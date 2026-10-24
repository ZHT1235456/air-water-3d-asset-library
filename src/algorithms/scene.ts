import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createEnvironment } from '../environments/render';
import type { EnvironmentHandle, EnvironmentVariant, Point2 } from '../environments/types';
import { createMarineBackground } from '../environments/marine/background';
import { createUSV, usvPresets, type ModelHandle, type USVVariant } from '../models';
import type { ExperimentPlan, Frame } from './types';

export const fleetColors = ['#43bdd0', '#eea45d', '#9ccc78', '#c69ce5', '#edcc67', '#7caedf'];
export type ExperimentCamera = 'mission' | 'fleet' | 'top';
const release = (root: T.Group) => {
  const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>();
  root.traverse(o => { if (o instanceof T.Mesh || o instanceof T.Line || o instanceof T.Points) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); } });
  root.clear(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
};

/** The experiment owns its actual environment and metre-scale model instances. */
export function createExperimentScene(host: HTMLElement, callbacks: {
  pick(point: Point2): void; select(index: number): void; interact(mode?: ExperimentCamera): void; status(text: string): void;
}) {
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(44, 1, 0.08, 20000);
  const renderer = new T.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute('aria-label', '三维算法实验视口，拖动旋转、滚轮缩放、右键平移');
  renderer.domElement.tabIndex = 0; host.appendChild(renderer.domElement);
  const labels = document.createElement('div'); labels.className = 'algo-scene-labels'; host.appendChild(labels);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 4; controls.maxDistance = 18000;
  controls.addEventListener('start', () => callbacks.interact());
  controls.addEventListener('change', () => { renderer.shadowMap.needsUpdate = true; });
  const sun = new T.DirectionalLight('#fff4dd', 2.2); sun.castShadow = true; sun.position.set(-500, 900, 300);
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.normalBias = 0.15; sun.shadow.camera.far = 5500;
  scene.add(sun, sun.target, new T.HemisphereLight('#e5f3ff', '#64766b', 0.7));
  const generator = new T.PMREMGenerator(renderer), room = new RoomEnvironment(), fallback = generator.fromScene(room, 0.04);
  room.dispose(); generator.dispose(); scene.environment = fallback.texture;
  const routes = new T.Group(), trails = new T.Group(), markers = new T.Group(); scene.add(routes, trails, markers);
  let environment: EnvironmentHandle | undefined, background: ReturnType<typeof createMarineBackground> | undefined;
  let models: ModelHandle[] = [], boatLabels: HTMLButtonElement[] = [], endpoints: { node: T.Object3D; label: HTMLSpanElement }[] = [];
  const leaders = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); leaders.classList.add('algo-label-leaders'); labels.appendChild(leaders);
  const labelLines = new Map<HTMLElement, SVGLineElement>();
  function attachLabel(label: HTMLElement) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line'); line.setAttribute('stroke', label.style.getPropertyValue('--boat-color'));
    leaders.appendChild(line); labelLines.set(label, line); labels.appendChild(label);
  }
  function removeLabel(label: HTMLElement) { labelLines.get(label)?.remove(); labelLines.delete(label); label.remove(); }
  let plan: ExperimentPlan | undefined, model: USVVariant = 'survey', selected = 0, following = false, disposed = false;
  let lastFrame: Frame | undefined, lastTrailKey = '', pickMode = false, active = true;
  let traceLines: { geometry: T.BufferGeometry; positions: Float32Array }[] = [];
  const followAnchor = new T.Vector3();
  const sunDirection = new T.Vector3(-0.4, 0.9, 0.3).normalize();
  function resize() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  function setEnvironment(variant: EnvironmentVariant) {
    background?.dispose(); environment?.dispose(); clearPlan();
    environment = createEnvironment({ variant }); scene.add(environment.root);
    scene.background = new T.Color(environment.presentation.background); scene.environment = fallback.texture;
    scene.fog = new T.Fog(environment.presentation.background, ...environment.presentation.fog);
    camera.far = environment.presentation.cameraFar ?? 22000; camera.updateProjectionMatrix();
    sunDirection.set(...environment.presentation.sunPosition).normalize(); renderer.shadowMap.needsUpdate = true;
    const current = environment; callbacks.status('正在载入三维场景…');
    if (environment.presentation.backgroundAsset) {
      background = createMarineBackground(renderer, scene, (direction, horizon, sky) => {
        current.setSun?.(direction); current.setHorizon?.(horizon); current.setSky?.(sky);
        (scene.fog as T.Fog).color.copy(horizon); sunDirection.copy(direction);
        renderer.shadowMap.needsUpdate = true; callbacks.status('三维实景 · 米制比例');
      }, () => callbacks.status('三维场景 · 基础光照'));
    } else callbacks.status('三维场景 · 米制比例');
  }
  function clearPlan() {
    models.forEach(m => m.dispose()); models = []; boatLabels.forEach(removeLabel); boatLabels = [];
    release(routes); release(trails); traceLines = []; plan = undefined; lastFrame = undefined; lastTrailKey = ''; following = false;
    environment?.setVessels?.([]);
  }
  function setEndpoints(start: Point2, goal: Point2 | undefined, centre = false) {
    endpoints.forEach(e => removeLabel(e.label)); endpoints = []; release(markers);
    for (const [point, text, color] of [[start, centre ? '任务中心' : '起点', '#78d2d3'], [goal, '终点', '#f1b772']] as const) {
      if (!point || !point.every(Number.isFinite)) continue;
      const node = new T.Object3D(); node.position.set(point[0], 0, point[1]); markers.add(node);
      const label = document.createElement('span'); label.className = 'algo-endpoint'; label.textContent = text; label.style.setProperty('--boat-color', color); attachLabel(label); endpoints.push({ node, label });
    }
  }
  function setPlan(next: ExperimentPlan, variant: USVVariant) {
    clearPlan(); plan = next; model = variant; selected = 0;
    next.routes.forEach((points, i) => {
      const line = new T.Line(new T.BufferGeometry().setFromPoints(points.map(([x, z]) => new T.Vector3(x, 1.1, z))), new T.LineDashedMaterial({ color: fleetColors[i % fleetColors.length], dashSize: 7, gapSize: 5, transparent: true, opacity: 0.65 }));
      line.computeLineDistances(); routes.add(line);
      const positions = new Float32Array(4002 * 3), geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage)); geometry.setDrawRange(0, 0);
      const trail = new T.Line(geometry, new T.LineBasicMaterial({ color: fleetColors[i % fleetColors.length], depthTest: false })); trail.frustumCulled = false; trail.renderOrder = 4; trails.add(trail); traceLines.push({ geometry, positions });
    });
    if (next.samples.length) {
      const geometry = new T.BufferGeometry().setFromPoints(next.samples.map(s => new T.Vector3(s.point[0], 1.2, s.point[1])));
      const material = new T.PointsMaterial({ color: '#f6e7bc', size: 3, sizeAttenuation: false, transparent: true, opacity: 0.65 }); routes.add(new T.Points(geometry, material));
    }
    next.initial.forEach((p, i) => {
      const handle = createUSV({ variant, colors: { accent: fleetColors[i % fleetColors.length] } });
      handle.root.position.set(p[0], 0, p[1]); scene.add(handle.root); models.push(handle);
      const label = document.createElement('button'); label.className = 'algo-vessel-label'; label.textContent = `${String(i + 1).padStart(2, '0')} 号艇`;
      label.setAttribute('aria-label', `聚焦 ${i + 1} 号艇`); label.style.setProperty('--boat-color', fleetColors[i % fleetColors.length]); label.onclick = () => { selected = i; focusBoat(); callbacks.select(i); }; attachLabel(label); boatLabels.push(label);
    });
    renderer.shadowMap.needsUpdate = true; environment?.invalidateReflection?.();
  }
  function setPose(target: T.Vector3, offset: T.Vector3) {
    controls.enableDamping = false; controls.update(); controls.target.copy(target); camera.position.copy(target).add(offset); controls.update(); controls.enableDamping = true;
    following = false; renderer.shadowMap.needsUpdate = true;
  }
  function fit(points: Point2[], top = false, margin = 20) {
    const bounds = new T.Box3(); points.filter(p => p.every(Number.isFinite)).forEach(([x, z]) => bounds.expandByPoint(new T.Vector3(x, 0, z)));
    if (bounds.isEmpty()) return;
    bounds.expandByScalar(margin); const target = bounds.getCenter(new T.Vector3()); target.y = 0;
    const direction = new T.Vector3(...(top ? [0, 1, -0.00001] : [0.3, 1.1, 0.85]) as [number, number, number]).normalize();
    const right = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), direction).normalize(), up = new T.Vector3().crossVectors(direction, right), tan = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
    let d = 15;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const p = new T.Vector3(x, y, z).sub(target); d = Math.max(d, p.dot(direction) + Math.max(Math.abs(p.dot(right)) / (tan * camera.aspect * 0.8), Math.abs(p.dot(up)) / (tan * 0.72)));
    }
    setPose(target, direction.multiplyScalar(d));
  }
  function view(mode: ExperimentCamera) {
    if (mode === 'fleet') fit(models.map(m => [m.root.position.x, m.root.position.z]), false, 7);
    else fit(plan?.routes.flat() ?? endpoints.map(e => [e.node.position.x, e.node.position.z]), mode === 'top', 25);
  }
  function focusBoat() {
    if (!models[selected]) return;
    const p = models[selected].root.position, length = usvPresets[model].length;
    setPose(p.clone(), new T.Vector3(length * 1.7, length * 1.5, length * 2.5)); followAnchor.copy(p);
  }
  function follow(value: boolean) { if (value) focusBoat(); following = value; }
  function updateLabels() {
    const w = host.clientWidth, h = host.clientHeight, occupied: { x: number; y: number; width: number; height: number }[] = [];
    const position = (node: T.Object3D, label: HTMLElement, isBoat: boolean) => {
      const projected = node.position.clone().add(new T.Vector3(0, isBoat ? 1.6 : 2, 0)).project(camera);
      label.hidden = projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1;
      const line = labelLines.get(label)!; line.style.display = label.hidden ? 'none' : '';
      if (label.hidden) return;
      const px = (projected.x * .5 + .5) * w, py = (-projected.y * .5 + .5) * h, width = label.offsetWidth, height = label.offsetHeight;
      const baseX = Math.max(width / 2 + 8, Math.min(w - width / 2 - 8, px)), baseY = Math.max(75, Math.min(h - 50, py - 24));
      let x = baseX, y = baseY;
      const candidates = [];
      for (let row = -12; row <= 12; row++) for (let col = -3; col <= 3; col++) candidates.push({ x: baseX + col * 72, y: baseY + row * 33, score: Math.abs(row) * 33 + Math.abs(col) * 90 });
      for (const p of candidates.sort((a, b) => a.score - b.score)) {
        if (p.x < width / 2 + 7 || p.x > w - width / 2 - 7 || p.y < 75 || p.y > h - 50) continue;
        if (!occupied.some(o => Math.abs(o.x - p.x) < (o.width + width) / 2 + 5 && Math.abs(o.y - p.y) < (o.height + height) / 2 + 5)) { x = p.x; y = p.y; break; }
      }
      occupied.push({ x, y, width, height }); label.style.left = `${x}px`; label.style.top = `${y}px`;
      line.setAttribute('x1', String(px)); line.setAttribute('y1', String(py)); line.setAttribute('x2', String(x)); line.setAttribute('y2', String(y + (py > y ? height / 2 : -height / 2)));
    };
    endpoints.forEach(e => position(e.node, e.label, false)); models.forEach((m, i) => { position(m.root, boatLabels[i], true); boatLabels[i].setAttribute('aria-pressed', String(i === selected)); });
  }
  function render(frame: Frame | undefined, history: Frame[], dt: number) {
    if (!active || disposed || !environment) return;
    const simulationDelta = frame && lastFrame ? Math.max(0, frame.time - lastFrame.time) : 0;
    if (frame && plan) {
      models.forEach((m, i) => {
        const v = frame.vessels[i]; m.root.position.set(v.position[0], 0, v.position[1]); m.root.rotation.y = v.yaw;
        if (v.dynamics) {
          m.update(0, { rotorAngles: v.dynamics.propellerPhase.map((phase, j) => phase * (j ? -1 : 1)) });
          if (m.parts['thruster-center']) m.parts['thruster-center'].rotation.y = v.dynamics.steering;
        } else if (dt > 0) m.update(dt, { rotorSpeed: 10 });
      });
      if (following && models[selected]) { const p = models[selected].root.position, delta = p.clone().sub(followAnchor); camera.position.add(delta); controls.target.add(delta); followAnchor.copy(p); }
      const key = `${history.length}:${frame.time}`;
      if (key !== lastTrailKey) {
        lastTrailKey = key;
        const visible = history.filter(f => f.time <= frame.time);
        traceLines.forEach(({ geometry, positions }, i) => {
          const points = [...visible.map(f => f.vessels[i].position), frame.vessels[i].position].slice(-4002);
          points.forEach(([x, z], j) => { positions[j * 3] = x; positions[j * 3 + 1] = 1.3; positions[j * 3 + 2] = z; });
          geometry.attributes.position.needsUpdate = true; geometry.setDrawRange(0, points.length);
        });
        environment.setVessels?.(frame.vessels.map((v, i) => ({ id: `algo-${i}`, position: [v.position[0], 0, v.position[1]], yaw: v.yaw, length: usvPresets[model].length, speed: v.dynamics ? Math.hypot(...v.dynamics.velocity.slice(0, 2)) : undefined })));
        renderer.shadowMap.needsUpdate = true;
      }
      lastFrame = frame;
    }
    environment.update(dt > 0 ? simulationDelta : 0);
    controls.update(); camera.position.y = Math.max(1, camera.position.y);
    // Restrict the shadow volume to the visible task/boat rather than the whole site.
    const span = Math.max(25, Math.min(1200, camera.position.distanceTo(controls.target)));
    sun.target.position.copy(controls.target); sun.position.copy(sunDirection).multiplyScalar(2400).add(controls.target);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -span; sun.shadow.camera.right = sun.shadow.camera.top = span; sun.shadow.camera.updateProjectionMatrix();
    updateLabels(); renderer.render(scene, camera);
  }
  const raycaster = new T.Raycaster(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  let down = [0, 0];
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!pickMode || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || e.button !== 0) return;
    const rect = renderer.domElement.getBoundingClientRect(), mouse = new T.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(mouse, camera); const p = raycaster.ray.intersectPlane(plane, new T.Vector3()); if (p) callbacks.pick([p.x, p.z]);
  });
  renderer.domElement.addEventListener('keydown', e => {
    if (e.key === 'Home') { view('mission'); callbacks.interact('mission'); }
    else if (e.key.toLowerCase() === 'f') { focusBoat(); callbacks.interact(); }
    else if (['+', '=', '-'].includes(e.key)) { camera.position.sub(controls.target).multiplyScalar(e.key === '-' ? 1.2 : .8).add(controls.target); callbacks.interact(); }
    else return; e.preventDefault();
  });
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); active = false; callbacks.status('三维视口已中断，请刷新恢复'); });
  return {
    scene, camera, renderer, controls, setEnvironment, setPlan, clearPlan, setEndpoints, view, follow, render,
    get models() { return models; }, get environment() { return environment; }, get frame() { return lastFrame; },
    setPicking(value: boolean) { pickMode = value; controls.enabled = !value; renderer.domElement.style.cursor = value ? 'crosshair' : 'grab'; },
    setActive(value: boolean) { active = value; if (value) resize(); },
    dispose() { disposed = true; observer.disconnect(); background?.dispose(); clearPlan(); release(markers); environment?.dispose(); controls.dispose(); fallback.dispose(); sun.shadow.dispose(); renderer.dispose(); renderer.domElement.remove(); labels.remove(); },
  };
}
