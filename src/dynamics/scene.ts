import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createQuadrotor, createUSV, type ModelHandle, type QuadrotorVariant, type USVVariant } from '../models';
import type { DynamicsFrame } from './experiment';

export function createDynamicsScene(host: HTMLElement) {
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
  renderer.domElement.tabIndex = 0; renderer.domElement.setAttribute('aria-label', '三维动力学试验场，可拖动旋转、滚轮缩放'); host.appendChild(renderer.domElement);
  const scene = new T.Scene(); scene.background = new T.Color('#d5e6ec'); scene.fog = new T.Fog('#d5e6ec', 100, 330);
  const pmrem = new T.PMREMGenerator(renderer), room = new RoomEnvironment(), environment = pmrem.fromScene(room); room.dispose(); pmrem.dispose(); scene.environment = environment.texture;
  const camera = new T.PerspectiveCamera(42, 1, .03, 2000), controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.minDistance = .8; controls.maxDistance = 150; controls.maxPolarAngle = Math.PI * .49;
  scene.add(new T.HemisphereLight('#c5e6ef', '#59746d', 2));
  const sun = new T.DirectionalLight('#fff3db', 3); sun.position.set(20, 40, 15); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = sun.shadow.camera.bottom = -35; sun.shadow.camera.right = sun.shadow.camera.top = 35; sun.shadow.camera.far = 150; sun.shadow.normalBias = .025; scene.add(sun, sun.target);
  const floor = new T.Mesh(new T.PlaneGeometry(2000, 2000), new T.MeshStandardMaterial({ color: '#b7c6c9', roughness: .94 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -.005; floor.receiveShadow = true; scene.add(floor);
  const water = new T.Mesh(new T.PlaneGeometry(2000, 2000), new T.MeshStandardMaterial({ color: '#366e7b', roughness: .45, metalness: 0, envMapIntensity: 0 })); water.rotation.x = -Math.PI / 2; water.receiveShadow = true; scene.add(water);
  const grid = new T.GridHelper(100, 20, '#426d78', '#79989c'); grid.position.y = .007; (grid.material as T.Material).transparent = true; (grid.material as T.Material).opacity = .28; scene.add(grid);
  const pad = new T.Group(); scene.add(pad);
  const disk = new T.Mesh(new T.CircleGeometry(1.4, 64), new T.MeshStandardMaterial({ color: '#345764', roughness: .85 })); disk.rotation.x = -Math.PI / 2; disk.position.y = .008; disk.receiveShadow = true; pad.add(disk);
  const ring = new T.Mesh(new T.RingGeometry(1.18, 1.23, 64), new T.MeshBasicMaterial({ color: '#f5db9c', side: T.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .012; pad.add(ring);
  for (const [x, z, w, l] of [[-.3, 0, .12, 1], [.3, 0, .12, 1], [0, 0, .6, .12]]) {
    const line = new T.Mesh(new T.BoxGeometry(w, .012, l), new T.MeshStandardMaterial({ color: '#f4e6c4' })); line.position.set(x, .02, z); pad.add(line);
  }
  const target = new T.Group(); scene.add(target);
  for (const angle of [0, Math.PI / 2]) { const ring = new T.Mesh(new T.TorusGeometry(.45, .012, 6, 48), new T.MeshBasicMaterial({ color: '#c7773a', transparent: true, opacity: .8 })); ring.rotation.x = angle; target.add(ring); }
  const velocity = new T.ArrowHelper(new T.Vector3(0, 0, 1), new T.Vector3(), 1, '#b4f2e1', .2, .11), thrust = new T.ArrowHelper(new T.Vector3(0, 1, 0), new T.Vector3(), 1, '#e4a15e', .2, .11); scene.add(velocity, thrust);
  const traceGeometry = new T.BufferGeometry(), tracePositions = new Float32Array(1802 * 3); traceGeometry.setAttribute('position', new T.BufferAttribute(tracePositions, 3)); traceGeometry.setDrawRange(0, 0);
  const trace = new T.Line(traceGeometry, new T.LineBasicMaterial({ color: '#297d78', transparent: true, opacity: .75 })); trace.frustumCulled = false; scene.add(trace);
  let model: ModelHandle | undefined, kind: 'usv' | 'quadrotor' = 'quadrotor', size = 1, following = true, lastPosition = new T.Vector3(), current: DynamicsFrame | undefined, disposed = false;
  function resize() { if (!host.clientWidth || !host.clientHeight) return; renderer.setSize(host.clientWidth, host.clientHeight); camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); }
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  function setModel(next: typeof kind, variant: string) {
    model?.dispose(); kind = next; model = next === 'usv' ? createUSV({ variant: variant as USVVariant }) : createQuadrotor({ variant: variant as QuadrotorVariant }); scene.add(model.root);
    size = new T.Box3().setFromObject(model.root).getSize(new T.Vector3()).length(); water.visible = kind === 'usv'; floor.visible = pad.visible = kind === 'quadrotor'; grid.position.y = kind === 'usv' ? .015 : .007;
    traceGeometry.setDrawRange(0, 0); lastPosition.set(0, 0, 0); current = undefined; view('follow');
  }
  function view(mode: string) {
    following = mode === 'follow'; const p = current ? new T.Vector3(...current.position) : new T.Vector3(0, 1, 0);
    controls.target.copy(p); const span = Math.max(size * 2.2, kind === 'quadrotor' ? 4.2 : 6);
    if (mode === 'top') camera.position.copy(p).add(new T.Vector3(.001, span * 1.8, .001));
    else if (mode === 'overview') { controls.target.set(0, 1, 0); camera.position.set(32, 26, 40); }
    else camera.position.copy(p).add(new T.Vector3(span * .7, span * .5, span));
    lastPosition.copy(p); controls.update();
  }
  function render(frame: DynamicsFrame, frames: DynamicsFrame[], vectors: boolean, trails: boolean) {
    if (disposed || !model) return; current = frame;
    const p = new T.Vector3(...frame.position); model.root.position.copy(p); model.root.quaternion.fromArray(frame.quaternion); model.update(0, { rotorAngles: frame.rotorAngles });
    if (model.parts['thruster-center']) model.parts['thruster-center'].rotation.y = frame.steering;
    if (following) { const d = p.clone().sub(lastPosition); camera.position.add(d); controls.target.add(d); } lastPosition.copy(p);
    target.position.set(...frame.input.target); if (kind === 'usv') target.position.y = .35; target.visible = frame.input.mode === 'position';
    const v = new T.Vector3(...frame.velocity), direction = new T.Vector3(0, 1, 0).applyQuaternion(model.root.quaternion);
    if (kind === 'usv') direction.set(Math.sin(frame.steering), 0, Math.cos(frame.steering)).applyQuaternion(model.root.quaternion);
    const total = frame.thrust.reduce((s, x) => s + x, 0); if (total < 0) direction.negate();
    velocity.position.copy(p).add(new T.Vector3(0, kind === 'usv' ? .65 : .1, 0)); thrust.position.copy(velocity.position);
    velocity.visible = vectors && v.length() > .025; thrust.visible = vectors && Math.abs(total) > .01;
    velocity.setDirection(v.clone().normalize()); velocity.setLength(Math.max(.01, v.length() * 2), .2, .1);
    thrust.setDirection(direction); thrust.setLength(Math.max(.01, size * .7), .2, .1);
    const visible = [...frames.filter(f => f.time <= frame.time), frame].slice(-1802);
    visible.forEach((f, i) => tracePositions.set([f.position[0], Math.max(kind === 'usv' ? .05 : .03, f.position[1]), f.position[2]], i * 3));
    traceGeometry.attributes.position.needsUpdate = true; traceGeometry.setDrawRange(0, visible.length); trace.visible = trails;
    controls.update(); sun.target.position.copy(p); sun.position.copy(p).add(new T.Vector3(20, 40, 15)); renderer.render(scene, camera);
  }
  return { renderer, camera, controls, setModel, view, render, resize, get model() { return model; },
    dispose() { disposed = true; observer.disconnect(); model?.dispose(); controls.dispose(); environment.dispose(); sun.shadow.dispose(); const gs = new Set<T.BufferGeometry>(), ms = new Set<T.Material>(); scene.traverse(o => { if (o instanceof T.Mesh || o instanceof T.Line) { gs.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => ms.add(m)); } }); gs.forEach(g => g.dispose()); ms.forEach(m => m.dispose()); renderer.dispose(); renderer.domElement.remove(); },
  };
}
