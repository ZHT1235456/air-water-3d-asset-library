import { environmentLibrary, libraryEntry } from './environment-library';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createEnvironment, createSpatialOverlays, environmentPresets, checkPlacement } from '../environments';
import type { EnvironmentHandle, EnvironmentVariant, Placement, PlacementIssue, Point3 } from '../environments';
import { createQuadrotor, createUSV } from '../models';
import type { ModelHandle, QuadrotorVariant, USVVariant } from '../models';
import { conservativeBounds, modelCatalog, parseSceneConfig, serializeSceneConfig } from './config';
import type { SceneConfig, VehicleConfig } from './config';
import './editor.css';
import { createMarineBackground } from '../environments/marine/background';
import { marineConfig } from '../environments/marine/config';

type Vehicle = { config: VehicleConfig; handle: ModelHandle; bounds: Placement['bounds']; issues: PlacementIssue[] };
type Runtime = { environment: EnvironmentHandle; overlays: ReturnType<typeof createSpatialOverlays>; config: SceneConfig; vehicles: Vehicle[] };
const flags = ['labels', 'waterBoundary', 'obstacles', 'spawns', 'waterAnimation', 'rotorAnimation'] as const;
const flagNames = ['载具标签', '水域边界', '障碍包围体', '出生点', '水面波纹', '桨叶转动'];
export function createEnvironmentEditor(host: HTMLElement) {
  host.innerHTML = `
    <main class="env-workspace">
      <aside class="env-library"><details open><summary>环境与载具 <span>${environmentLibrary.length} 个环境</span></summary><div class="env-panel">
        <div class="env-section-head"><strong>环境库</strong><span>${String(environmentLibrary.length).padStart(2,'0')} / ENVIRONMENTS</span></div>
        <div class="env-presets">${environmentLibrary.map(entry => { const key=entry.variant,p=environmentPresets[key]; return `<button data-env="${key}" aria-pressed="false"><span class="env-map env-map-${key}"></span><span><small>${p.code} / ${entry.category}</small><strong>${p.name}</strong></span></button>`; }).join('')}</div>
        <div class="env-section-head fleet-heading"><strong>场景载具</strong><span id="env-fleet-count">0</span></div>
        <select id="env-model-add" aria-label="添加型号">${modelCatalog.map(m => `<option value="${m.id}">${m.code} · ${m.name}</option>`).join('')}</select>
        <button id="env-add" class="env-primary">＋ 添加载具</button>
        <div id="env-vehicles" aria-label="场景载具列表"></div>
        <p class="env-note">按真实米制比例放置。点击载具标签或列表选择；双击标签聚焦。</p>
      </div></details></aside>
      <section class="env-stage" aria-label="环境三维预览">
        <div id="env-canvas" tabindex="0" aria-label="环境三维视口"></div>
        <div id="env-labels"></div>
        <div class="env-stage-title"><div class="eyebrow"><span id="env-code">E-01</span><span class="small-line"></span>ENVIRONMENT LIBRARY</div><h1 id="env-name">开阔湖面</h1><p id="env-description"></p></div>
        <div class="env-stage-badge"><i></i>真实比例 <span>1 unit = 1 m</span></div>
        <div class="env-film-shots" hidden>${Object.entries(marineConfig.cameras).map(([id,c]) => `<button data-shot="${id}">${c.label}</button>`).join('')}<span id="env-sky-status">载入本地全景…</span></div>
        <div class="env-tools" role="group" aria-label="场景取景"><button id="env-overview">全景</button><button id="env-top">俯视</button><button id="env-focus">聚焦载具</button><button id="env-reset">复位</button><button id="env-shot">保存图片</button><button id="env-immersive">专注视图</button></div>
        <div class="env-stage-bottom"><span id="env-dimensions"></span><span>拖动旋转 · 滚轮缩放 · 右键平移</span></div>
        <div id="env-error" role="alert" hidden></div>
      </section>
      <aside class="env-inspector"><details open><summary>摆放与配置 <span>场景设置</span></summary><div class="env-panel">
        <div class="env-section-head"><strong>所选载具</strong><span id="env-selected-code">—</span></div>
        <p id="env-selected-name" class="env-selected-name">选择载具以编辑</p>
        <div class="env-transform-mode"><button id="env-translate" aria-pressed="true">平移</button><button id="env-rotate" aria-pressed="false">朝向</button></div>
        <div class="env-position">${['x', 'y', 'z'].map(axis => `<label>${axis.toUpperCase()} / m<input id="env-pos-${axis}" type="number" step="0.1" min="-1000000" max="1000000"/></label>`).join('')}</div>
        <label class="env-field">朝向 / °<input id="env-yaw" type="number" step="1" min="-360000" max="360000"/></label>
        <div class="env-colors">${(['primary', 'secondary', 'accent'] as const).map((key, i) => `<label>${['主色', '辅色', '标识'][i]}<input id="env-color-${key}" type="color"/></label>`).join('')}</div>
        <button id="env-delete" class="env-delete">移除所选载具</button>
        <div id="env-issues" role="status" aria-live="polite"></div>
        <section class="env-display"><div class="env-section-head"><strong>环境显示</strong><span>LAYERS</span></div>
        ${flags.map((flag, i) => `<label class="toggle-row" for="env-flag-${flag}"><span>${flagNames[i]}</span><input type="checkbox" class="switch" id="env-flag-${flag}"/></label>`).join('')}</section>
        <section class="env-storage"><div class="env-section-head"><strong>场景配置</strong><span>JSON · V1</span></div>
          <label class="env-field">生成种子<input id="env-seed" type="number" min="0" max="4294967295" step="1"/></label>
          <button id="env-regenerate" class="env-secondary">按种子重建环境</button>
          <div class="env-file-buttons"><button id="env-export" class="env-primary">导出 JSON</button><button id="env-import" class="env-secondary">导入 JSON</button></div>
          <input id="env-file" type="file" accept=".json,application/json" hidden/>
          <p class="env-note">切换环境保留本次草稿；刷新前请导出。位置警告不阻止保存。</p>
        </section>
      </div></details></aside>
    </main><footer class="app-footer"><span>空海环境库 / <span id="env-status">准备场景…</span></span><span>静态空间数据 · 动态视觉水面</span></footer>
    <a id="env-source" href="/assets/qingzhou/sources.json" target="_blank" rel="noopener">数据 © OpenStreetMap contributors · ODbL · 工程尺寸与精度说明</a><div id="env-toast" role="status" aria-live="polite"></div>`;
  const $ = <E extends HTMLElement = HTMLElement>(s: string) => host.querySelector<E>(s)!;
  const canvasHost = $('#env-canvas');
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(42, 1, 0.1, 6000);
  let renderer: T.WebGLRenderer;
  try { renderer = new T.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true }); }
  catch { $('#env-error').hidden = false; $('#env-error').textContent = '环境预览需要 WebGL 2，请开启硬件加速后刷新。'; return { setActive() {}, dispose() {} }; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; renderer.info.autoReset = false;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  canvasHost.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.maxDistance = 3500; controls.minDistance = 0.3; controls.maxPolarAngle = Math.PI * 0.49;
  const transform = new TransformControls(camera, renderer.domElement); transform.setSize(0.75); scene.add(transform.getHelper());
  transform.addEventListener('dragging-changed', e => { controls.enabled = !e.value; });
  const sun = new T.DirectionalLight('#fff5df', 3); sun.position.set(160, 320, 180); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -450; sun.shadow.camera.right = 450; sun.shadow.camera.top = 400; sun.shadow.camera.bottom = -400; sun.shadow.camera.far = 1200; sun.shadow.normalBias = 0.25;
  const hemisphere = new T.HemisphereLight('#e5f3ff', '#667b66', 1.5); scene.add(sun, hemisphere);
  const generator = new T.PMREMGenerator(renderer), room = new RoomEnvironment(), envMap = generator.fromScene(room, 0.04);
  room.dispose(); generator.dispose(); scene.environment = envMap.texture; scene.environmentIntensity = 0.55;
  const selection = new T.Box3Helper(new T.Box3(), new T.Color('#f7ba69')); selection.visible = false; scene.add(selection);
  const drafts = new Map<EnvironmentVariant, SceneConfig>();
  let runtime: Runtime, selected = '', active = true, stopped = false, raf = 0, dirty = false;
  let background: ReturnType<typeof createMarineBackground> | undefined;
  let immersive = false;
  let gizmoMode: 'translate' | 'rotate' = 'translate';
  let toastTimer: ReturnType<typeof setTimeout>;
  let labelNodes = new Map<string, HTMLButtonElement>();
  let labelLines = new Map<string, SVGLineElement>();
  const selectedVehicle = () => runtime?.vehicles.find(v => v.config.id === selected);
  function notify(text: string) { $('#env-toast').textContent = text; $('#env-toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#env-toast').classList.remove('show'), 3000); }
  function allocate(c: VehicleConfig): Vehicle {
    const spec = modelCatalog.find(m => m.id === c.modelId)!;
    const handle = spec.kind === 'quadrotor' ? createQuadrotor({ variant: spec.variant as QuadrotorVariant, scale: c.scale, colors: c.colors }) : createUSV({ variant: spec.variant as USVVariant, scale: c.scale, colors: c.colors });
    const bounds = conservativeBounds(handle, c.modelId);
    handle.root.position.set(...c.position); handle.root.rotation.y = c.yaw; handle.root.userData.instanceId = c.id;
    return { config: c, handle, bounds, issues: [] };
  }
  function placement(v: Vehicle): Placement { return { id: v.config.id, kind: modelCatalog.find(m => m.id === v.config.modelId)!.kind, position: v.config.position, yaw: v.config.yaw, bounds: v.bounds }; }
  function snapshot(): SceneConfig {
    runtime.config.view.fov = camera.fov;
    runtime.config.view.cameraPosition = camera.position.toArray() as Point3;
    runtime.config.view.target = controls.target.toArray() as Point3;
    return structuredClone(runtime.config);
  }
  function fitPose(bounds: T.Box3, direction: T.Vector3) {
    const target = bounds.getCenter(new T.Vector3()), forward = direction.normalize();
    const right = new T.Vector3().crossVectors(camera.up, forward).normalize(), up = new T.Vector3().crossVectors(forward, right);
    const tanV = Math.tan(T.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect;
    let distance = 0;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const p = new T.Vector3(x, y, z).sub(target);
      distance = Math.max(distance, p.dot(forward) + Math.max(Math.abs(p.dot(right)) / (tanH * 0.88), Math.abs(p.dot(up)) / (tanV * 0.68)));
    }
    return { target: target.toArray() as Point3, cameraPosition: target.clone().addScaledVector(forward, distance).toArray() as Point3 };
  }
  function disposeRuntime(r: Runtime) { r.overlays.dispose(); r.vehicles.forEach(v => v.handle.dispose()); r.environment.dispose(); }
  function load(config: SceneConfig) {
    // Build all replacement resources before removing the current draft.
    let environment: EnvironmentHandle | undefined, overlays: Runtime['overlays'] | undefined;
    const vehicles: Vehicle[] = [];
    try {
      environment = createEnvironment(config.environment); overlays = createSpatialOverlays(environment.spatial);
      config.vehicles.forEach(c => vehicles.push(allocate(c)));
    } catch (error) { vehicles.forEach(v => v.handle.dispose()); overlays?.dispose(); environment?.dispose(); throw error; }
    if (runtime) { drafts.set(runtime.config.environment.variant, snapshot()); transform.detach(); disposeRuntime(runtime); }
    runtime = { environment, overlays, config, vehicles };
    background?.dispose(); background = undefined;
    const marine = !!libraryEntry(config.environment.variant);
    host.classList.toggle('marine-scene', marine); $('.env-film-shots').hidden = !marine;
    scene.environment = envMap.texture; scene.backgroundIntensity = 1; scene.environmentIntensity = .55;
    scene.backgroundRotation.set(0, 0, 0); scene.environmentRotation.set(0, 0, 0);
    renderer.toneMappingExposure = marine ? marineConfig.sky.exposure : 1.05;
    camera.far = environment.presentation.cameraFar ?? 6000; camera.fov = config.view.fov ?? (marine ? 44 : 42); camera.updateProjectionMatrix();
    controls.maxDistance = marine ? Math.max(6000, environmentPresets[config.environment.variant].width * 2) : 3500;
    controls.maxPolarAngle = marine ? Math.PI * .9 : Math.PI * .49;
    sun.position.set(...environment.presentation.sunPosition); sun.intensity = marine ? 2.2 : 3;
    hemisphere.intensity = marine ? .45 : 1.5;
    sun.shadow.camera.left = sun.shadow.camera.bottom = marine ? -1150 : -450;
    sun.shadow.camera.right = sun.shadow.camera.top = marine ? 1150 : 450;
    sun.shadow.camera.far = marine ? 5000 : 1200; sun.shadow.camera.updateProjectionMatrix();
    scene.add(environment.root, overlays.root, ...vehicles.map(v => v.handle.root));
    scene.background = new T.Color(environment.presentation.background); scene.fog = new T.Fog(environment.presentation.background, ...environment.presentation.fog);
    if (environment.presentation.backgroundAsset) {
      $('#env-sky-status').textContent = '载入本地全景…';
      background = createMarineBackground(renderer, scene, (direction, horizon, sky) => {
        environment.setSun?.(direction); environment.setHorizon?.(horizon);
        environment.setSky?.(sky);
        (scene.fog as T.Fog).color.copy(horizon);
        sun.position.copy(direction).multiplyScalar(marine ? 2400 : 600);
        renderer.shadowMap.needsUpdate = true;
        $('#env-sky-status').textContent = '360° HDR · CC0';
      }, () => { $('#env-sky-status').textContent = '天空加载失败 · 基础光照'; });
    }
    controls.enableDamping = false; controls.update();
    camera.position.set(...config.view.cameraPosition); controls.target.set(...config.view.target);
    controls.update(); controls.enableDamping = true;
    const preset = environmentPresets[config.environment.variant];
    host.querySelectorAll<HTMLButtonElement>('[data-shot]').forEach(b => { b.textContent = (libraryEntry(config.environment.variant)?.cameras ?? marineConfig.cameras)[b.dataset.shot as keyof typeof marineConfig.cameras].label; });
    $('#env-code').textContent = preset.code; $('#env-name').textContent = preset.name; $('#env-description').textContent = preset.description;
    const entry = libraryEntry(config.environment.variant), source = $<HTMLAnchorElement>('#env-source');
    source.hidden = !entry;
    if (entry) { source.href = entry.source; source.textContent = entry.attribution; }
    $('#env-dimensions').textContent = `${preset.width} × ${preset.depth} m · 水位 0 m · 飞行高度 0–${environment.spatial.flight.maxY} m`;
    $<HTMLInputElement>('#env-seed').value = String(config.environment.seed);
    host.querySelectorAll<HTMLButtonElement>('[data-env]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.env === config.environment.variant)));
    flags.forEach(f => { $<HTMLInputElement>(`#env-flag-${f}`).checked = config.view[f]; });
    syncLayers(); buildList(); select(config.view.selectedId ?? ''); validate();
  }
  function defaultConfig(variant: EnvironmentVariant): SceneConfig {
    const environment = createEnvironment({ variant }), { presentation, spatial } = environment;
    const vehicles = (['quadrotor', 'usv'] as const).map((kind, i) => {
      const model = modelCatalog.find(m => m.id === `${kind}-inspection`)!, spawn = spatial.spawnPoints.find(s => s.kind === kind)!;
      return { id: `v${i + 1}`, modelId: model.id, position: [...spawn.position] as Point3, yaw: 0, scale: 1, colors: { ...model.colors } };
    });
    const pose = !!libraryEntry(variant) ? { target: presentation.target, cameraPosition: presentation.cameraPosition } : fitPose(new T.Box3().setFromObject(environment.root), new T.Vector3(...presentation.cameraPosition));
    environment.dispose();
    return { version: 1, environment: { variant, seed: environmentPresets[variant].seed }, vehicles, view: { ...pose, selectedId: !!libraryEntry(variant) ? null : 'v1', labels: true, waterBoundary: false, obstacles: false, spawns: false, waterAnimation: !matchMedia('(prefers-reduced-motion: reduce)').matches, rotorAnimation: false } };
  }
  function switchEnvironment(variant: EnvironmentVariant) {
    if (runtime?.config.environment.variant === variant) return;
    try { load(structuredClone(drafts.get(variant) ?? defaultConfig(variant))); } catch (e) { notify(`环境加载失败：${(e as Error).message}`); }
  }
  function syncLayers() {
    const v = runtime.config.view;
    runtime.overlays.water.visible = v.waterBoundary; runtime.overlays.obstacles.visible = v.obstacles; runtime.overlays.spawns.visible = v.spawns;
    $('#env-labels').hidden = !v.labels || immersive;
  }
  function buildList() {
    const list = $('#env-vehicles'), labels = $('#env-labels'); list.replaceChildren(); labels.replaceChildren(); labelNodes = new Map(); labelLines = new Map();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.classList.add('env-label-leaders'); labels.appendChild(svg);
    runtime.vehicles.forEach(v => {
      const model = modelCatalog.find(m => m.id === v.config.modelId)!;
      const item = document.createElement('button'); item.dataset.instance = v.config.id; item.className = 'env-vehicle-item';
      item.textContent = `${model.code} · ${model.name} / ${v.config.id}`; item.addEventListener('click', () => select(v.config.id)); item.addEventListener('dblclick', focusSelected); list.appendChild(item);
      const label = document.createElement('button'); label.className = `env-vehicle-label ${model.kind}`; label.textContent = `${model.code} · ${v.config.id}`; label.dataset.label = v.config.id;
      label.addEventListener('click', () => select(v.config.id)); label.addEventListener('dblclick', () => { select(v.config.id); focusSelected(); }); labels.appendChild(label); labelNodes.set(v.config.id, label);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line'); line.setAttribute('stroke', model.kind === 'usv' ? '#568e7d' : '#a68f60'); svg.appendChild(line); labelLines.set(v.config.id, line);
    });
    $('#env-fleet-count').textContent = `${runtime.vehicles.length} / 100`; markSelection();
  }
  function markSelection() {
    host.querySelectorAll<HTMLButtonElement>('[data-instance]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.instance === selected)); });
    labelNodes.forEach((node, id) => node.classList.toggle('selected', id === selected));
  }
  function select(id: string) {
    selected = id; const vehicle = selectedVehicle(); transform.detach();
    runtime.config.view.selectedId = vehicle ? id : null;
    if (vehicle) { transform.attach(vehicle.handle.root); setGizmo(gizmoMode); }
    selection.visible = Boolean(vehicle); markSelection(); inspector(); updateSelectionBox();
  }
  function setGizmo(mode: 'translate' | 'rotate') {
    gizmoMode = mode; transform.setMode(mode);
    const isBoat = selectedVehicle()?.config.modelId.startsWith('usv');
    transform.showX = transform.showZ = mode === 'translate';
    transform.showY = mode === 'rotate' || !isBoat;
    $('#env-translate').setAttribute('aria-pressed', String(mode === 'translate')); $('#env-rotate').setAttribute('aria-pressed', String(mode === 'rotate'));
  }
  function inspector() {
    const v = selectedVehicle(), m = modelCatalog.find(m => m.id === v?.config.modelId);
    $('#env-selected-name').textContent = m ? `${m.name} / ${selected}` : '选择载具以编辑'; $('#env-selected-code').textContent = m?.code ?? '—';
    for (const [i, axis] of ['x', 'y', 'z'].entries()) {
      const input = $<HTMLInputElement>(`#env-pos-${axis}`); input.disabled = !v || (axis === 'y' && m?.kind === 'usv');
      if (document.activeElement !== input) input.value = v ? String(Number(v.config.position[i].toFixed(3))) : '';
    }
    const yaw = $<HTMLInputElement>('#env-yaw'); yaw.disabled = !v; if (document.activeElement !== yaw) yaw.value = v ? String(Number(T.MathUtils.radToDeg(v.config.yaw).toFixed(2))) : '';
    for (const key of ['primary', 'secondary', 'accent'] as const) { const input = $<HTMLInputElement>(`#env-color-${key}`); input.disabled = !v; input.value = v?.config.colors[key] ?? '#ffffff'; }
    $<HTMLButtonElement>('#env-delete').disabled = !v;
    const issues = $('#env-issues'); issues.replaceChildren(); issues.className = v?.issues.length ? 'has-issues' : '';
    if (v) {
      const heading = document.createElement('strong'); heading.textContent = v.issues.length ? `${v.issues.length} 项位置提示 · 仍可保存` : '位置检查通过'; issues.appendChild(heading);
      for (const issue of v.issues.slice(0, 8)) { const p = document.createElement('p'); p.textContent = issue.message; issues.appendChild(p); }
    }
  }
  function updateSelectionBox() {
    const v = selectedVehicle(); if (!v) return;
    selection.box.setFromObject(v.handle.root); (selection.material as T.LineBasicMaterial).color.set(v.issues.length ? '#ed7355' : '#e6b355');
  }
  function validate() {
    renderer.shadowMap.needsUpdate = true;
    runtime.environment.invalidateReflection?.();
    const all = runtime.vehicles.map(placement);
    runtime.vehicles.forEach(v => {
      v.issues = checkPlacement(runtime.environment.spatial, placement(v), all);
      labelNodes.get(v.config.id)?.classList.toggle('invalid', Boolean(v.issues.length));
      const b = Array.from(host.querySelectorAll<HTMLButtonElement>('[data-instance]')).find(b => b.dataset.instance === v.config.id);
      b?.classList.toggle('invalid', Boolean(v.issues.length));
    });
    const count = runtime.vehicles.filter(v => v.issues.length).length;
    $('#env-status').textContent = count ? `${count} 个载具有位置提示` : `${runtime.vehicles.length} 个载具 · 位置检查通过`;
    inspector(); updateSelectionBox(); dirty = false;
  }
  function addVehicle(modelId: string) {
    if (runtime.vehicles.length >= 100) { notify('第一版每场景最多保留 100 个载具'); return; }
    const model = modelCatalog.find(m => m.id === modelId); if (!model) return;
    let index = 1; while (runtime.vehicles.some(v => v.config.id === `v${index}`)) index++;
    const c: VehicleConfig = { id: `v${index}`, modelId, position: [0, model.kind === 'quadrotor' ? 10 : 0, 0], yaw: 0, scale: 1, colors: { ...model.colors } };
    const v = allocate(c), spawns = runtime.environment.spatial.spawnPoints.filter(p => p.kind === model.kind), others = runtime.vehicles.map(placement);
    let found = false;
    for (const p of spawns) {
      c.position = [...p.position]; c.yaw = p.yaw;
      if (!checkPlacement(runtime.environment.spatial, placement(v), others).length) { found = true; break; }
    }
    if (!found && spawns[0]) { c.position = [...spawns[0].position]; c.yaw = spawns[0].yaw; notify('出生点已占用；载具仍已添加，请调整位置'); }
    v.handle.root.position.set(...c.position); v.handle.root.rotation.y = c.yaw;
    runtime.vehicles.push(v); runtime.config.vehicles.push(c); scene.add(v.handle.root); buildList(); select(c.id); validate();
  }
  function overview(top = false) {
    if (!!libraryEntry(runtime.config.environment.variant) && !top) { shot('establishing'); return; }
    const bounds = runtime.environment.spatial.bounds;
    const fitBounds = !!libraryEntry(runtime.config.environment.variant) ? new T.Box3(new T.Vector3(bounds.minX, 0, bounds.minZ), new T.Vector3(bounds.maxX, libraryEntry(runtime.config.environment.variant)?.height ?? 110, bounds.maxZ)) : new T.Box3().setFromObject(runtime.environment.root);
    const pose = fitPose(fitBounds, new T.Vector3(...(top ? [0, 1, -0.00001] as Point3 : runtime.environment.presentation.cameraPosition)));
    controls.enableDamping = false; controls.update();
    controls.target.set(...pose.target); camera.position.set(...pose.cameraPosition);
    camera.near = 0.1; camera.updateProjectionMatrix(); controls.enableDamping = false; controls.update(); controls.enableDamping = true;
  }
  function focusSelected() {
    const v = selectedVehicle(); if (!v) { notify('先选择一个载具'); return; }
    const bounds = new T.Box3().setFromObject(v.handle.root), center = bounds.getCenter(new T.Vector3()), size = bounds.getSize(new T.Vector3()).length();
    controls.enableDamping = false; controls.update();
    controls.target.copy(center); camera.position.copy(center).add(new T.Vector3(1, 0.8, 1.3).normalize().multiplyScalar(size * 1.9 * Math.max(1, 1 / camera.aspect)));
    camera.near = 0.01; camera.updateProjectionMatrix(); controls.enableDamping = false; controls.update(); controls.enableDamping = true;
  }
  function importText(text: string) {
    const c = parseSceneConfig(text); load(c); notify(`已导入 ${c.vehicles.length} 个载具`);
  }
  function shot(name: keyof typeof marineConfig.cameras) {
    const preset = (libraryEntry(runtime.config.environment.variant)?.cameras ?? marineConfig.cameras)[name];
    controls.enableDamping = false; controls.update();
    const vehicle = name === 'establishing' || (name === 'aerial' && libraryEntry(runtime.config.environment.variant)?.fixedAerial) ? undefined : runtime.vehicles.find(v => v.config.modelId.startsWith(name === 'aerial' ? 'quadrotor' : 'usv'));
    const offset = vehicle ? new T.Vector3(...vehicle.config.position) : new T.Vector3();
    if (name === 'aerial' && vehicle) offset.y -= 10;
    camera.position.set(...preset.position).add(offset); controls.target.set(...preset.target).add(offset);
    camera.fov = preset.fov; camera.near = name === 'establishing' ? .5 : .03; camera.updateProjectionMatrix();
    controls.update(); controls.enableDamping = true;
    if (vehicle) select(vehicle.config.id); else select('');
    host.querySelectorAll<HTMLButtonElement>('[data-shot]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.shot === name)));
  }
  transform.addEventListener('objectChange', () => {
    const v = selectedVehicle(); if (!v) return;
    if (v.config.modelId.startsWith('usv')) v.handle.root.position.y = 0;
    const forward = new T.Vector3(0, 0, 1).applyQuaternion(v.handle.root.quaternion);
    v.handle.root.rotation.set(0, Math.atan2(forward.x, forward.z), 0);
    v.config.position = v.handle.root.position.toArray() as Point3; v.config.yaw = v.handle.root.rotation.y; dirty = true;
  });
  host.querySelectorAll<HTMLButtonElement>('[data-env]').forEach(b => b.addEventListener('click', () => switchEnvironment(b.dataset.env as EnvironmentVariant)));
  $('#env-add').addEventListener('click', () => addVehicle($<HTMLSelectElement>('#env-model-add').value));
  $('#env-translate').addEventListener('click', () => setGizmo('translate')); $('#env-rotate').addEventListener('click', () => setGizmo('rotate'));
  for (const axis of ['x', 'y', 'z']) $(`#env-pos-${axis}`).addEventListener('change', () => {
    const v = selectedVehicle(); if (!v) return;
    const input = $<HTMLInputElement>(`#env-pos-${axis}`), value = input.valueAsNumber;
    if (!Number.isFinite(value) || Math.abs(value) > 1e6) { input.value = String(v.config.position['xyz'.indexOf(axis)]); notify('坐标须为绝对值不超过 1,000,000 的有限数'); return; }
    v.config.position['xyz'.indexOf(axis)] = axis === 'y' && v.config.modelId.startsWith('usv') ? 0 : value;
    v.handle.root.position.set(...v.config.position); validate();
  });
  $('#env-yaw').addEventListener('change', () => {
    const v = selectedVehicle(), input = $<HTMLInputElement>('#env-yaw'); if (!v) return;
    if (!Number.isFinite(input.valueAsNumber)) { input.value = String(T.MathUtils.radToDeg(v.config.yaw)); return; }
    v.config.yaw = T.MathUtils.degToRad(input.valueAsNumber % 360); v.handle.root.rotation.y = v.config.yaw; validate();
  });
  for (const key of ['primary', 'secondary', 'accent'] as const) $(`#env-color-${key}`).addEventListener('change', () => {
    const old = selectedVehicle(); if (!old) return;
    const c = { ...old.config, colors: { ...old.config.colors, [key]: $<HTMLInputElement>(`#env-color-${key}`).value } }, replacement = allocate(c), i = runtime.vehicles.indexOf(old);
    transform.detach(); old.handle.dispose(); runtime.vehicles[i] = replacement; runtime.config.vehicles[i] = c; scene.add(replacement.handle.root); select(c.id); validate();
  });
  $('#env-delete').addEventListener('click', () => {
    const v = selectedVehicle(); if (!v) return; transform.detach(); v.handle.dispose(); runtime.vehicles = runtime.vehicles.filter(o => o !== v); runtime.config.vehicles = runtime.vehicles.map(v => v.config);
    buildList(); select(runtime.vehicles[0]?.config.id ?? ''); validate();
  });
  flags.forEach(f => $(`#env-flag-${f}`).addEventListener('change', () => { runtime.config.view[f] = $<HTMLInputElement>(`#env-flag-${f}`).checked; syncLayers(); }));
  $('#env-overview').addEventListener('click', () => overview()); $('#env-top').addEventListener('click', () => overview(true)); $('#env-reset').addEventListener('click', () => overview()); $('#env-focus').addEventListener('click', focusSelected);
  host.querySelectorAll<HTMLButtonElement>('[data-shot]').forEach(b => b.addEventListener('click', () => shot(b.dataset.shot as keyof typeof marineConfig.cameras)));
  $('#env-immersive').addEventListener('click', () => {
    immersive = !immersive; host.classList.toggle('env-immersive', immersive); $('#env-immersive').textContent = immersive ? '恢复编辑' : '专注视图';
    transform.getHelper().visible = !immersive; selection.visible = !immersive && Boolean(selectedVehicle()); syncLayers(); resize();
  });
  $('#env-regenerate').addEventListener('click', () => {
    const c = snapshot(); c.environment.seed = $<HTMLInputElement>('#env-seed').valueAsNumber;
    try { load(parseSceneConfig(JSON.stringify(c))); notify('已重建环境并保留载具位置'); } catch (e) { notify((e as Error).message); }
  });
  function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  $('#env-export').addEventListener('click', () => { try { download(new Blob([serializeSceneConfig(snapshot())], { type: 'application/json' }), `${runtime.config.environment.variant}-scene.json`); notify('已导出场景配置'); } catch (e) { notify((e as Error).message); } });
  $('#env-import').addEventListener('click', () => $<HTMLInputElement>('#env-file').click());
  $('#env-file').addEventListener('change', async () => {
    const input = $<HTMLInputElement>('#env-file'), file = input.files?.[0];
    try { if (file) { if (file.size > 2_000_000) throw new Error('配置文件超过 2 MB'); importText(await file.text()); } } catch (e) { notify(`导入失败：${(e as Error).message}`); } finally { input.value = ''; }
  });
  $('#env-shot').addEventListener('click', () => { renderer.render(scene, camera); renderer.domElement.toBlob(blob => { if (blob) download(blob, `${runtime.config.environment.variant}-view.png`); }); });
  const raycaster = new T.Raycaster(), pointer = new T.Vector2();
  let down = { x: 0, y: 0 };
  renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || transform.dragging || transform.axis) return;
    const r = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(runtime.vehicles.map(v => v.handle.root), true)[0];
    if (hit) { let obj: T.Object3D | null = hit.object; while (obj && !obj.userData.instanceId) obj = obj.parent; if (obj) select(obj.userData.instanceId); }
  });
  canvasHost.addEventListener('keydown', e => { if (e.key === 'Home') overview(); if (e.key.toLowerCase() === 'f') focusSelected(); });
  const resize = () => { const w = canvasHost.clientWidth, h = canvasHost.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const observer = new ResizeObserver(resize); observer.observe(canvasHost); resize();
  load(defaultConfig('qingzhou'));
  let previous = performance.now();
  function render(time: number) {
    if (stopped) return;
    const dt = Math.max(0, Math.min(0.05, (time - previous) / 1000)); previous = time;
    if (active && !document.hidden && runtime) {
      if (!!libraryEntry(runtime.config.environment.variant)) {
        camera.position.y = Math.max(.6, camera.position.y);
        runtime.environment.setVessels?.(runtime.vehicles.filter(v => v.config.modelId.startsWith('usv')).map(v => ({ id: v.config.id, position: v.config.position, yaw: v.config.yaw, length: v.bounds.max[2] - v.bounds.min[2] })));
        if (immersive) { selection.visible = false; transform.getHelper().visible = false; }
      }
      if (runtime.config.view.waterAnimation) runtime.environment.update(dt);
      if (runtime.config.view.rotorAnimation) { runtime.vehicles.forEach(v => v.handle.update(dt, { rotorSpeed: 12 })); renderer.shadowMap.needsUpdate = true; runtime.environment.invalidateReflection?.(); }
      if (dirty) validate();
      controls.update();
      if (!!libraryEntry(runtime.config.environment.variant)) camera.position.y = Math.max(.6, camera.position.y);
      const rect = canvasHost.getBoundingClientRect();
      if (!!libraryEntry(runtime.config.environment.variant)) {
        const pixelScale = rect.height / (2 * Math.tan(T.MathUtils.degToRad(camera.fov / 2)));
        runtime.vehicles.forEach(v => {
          const size = new T.Vector3(...v.bounds.max).sub(new T.Vector3(...v.bounds.min)).length();
          const pixels = size * pixelScale / Math.max(.1, camera.position.distanceTo(v.handle.root.position));
          const visible = pixels >= 2 || (!immersive && v.config.id === selected);
          if (v.handle.root.visible !== visible) { v.handle.root.visible = visible; runtime.environment.invalidateReflection?.(); }
        });
      }
      const occupied: { x: number; y: number; w: number; h: number }[] = [];
      const ordered = [...runtime.vehicles].sort((a, b) => Number(b.config.id === selected) - Number(a.config.id === selected));
      if (runtime.config.view.labels) ordered.forEach(v => {
        const label = labelNodes.get(v.config.id); if (!label) return;
        const line = labelLines.get(v.config.id)!;
        const pos = new T.Vector3(...v.config.position).add(new T.Vector3(0, v.bounds.max[1] + 0.5, 0)).project(camera);
        label.hidden = pos.z < -1 || pos.z > 1 || Math.abs(pos.x) > 1 || Math.abs(pos.y) > 1;
        line.style.display = label.hidden ? 'none' : ''; if (label.hidden) return;
        const anchorX = (pos.x * 0.5 + 0.5) * rect.width, anchorY = (-pos.y * 0.5 + 0.5) * rect.height;
        const width = label.offsetWidth || 80, height = 24, direction = v.config.modelId.startsWith('usv') ? 1 : -1;
        let chosen = { x: anchorX, y: anchorY + direction * 20, w: width, h: height }, found = false;
        for (let ring = 0; ring <= 9 && !found; ring++) {
          for (let dx = -ring; dx <= ring && !found; dx++) for (const dy of [...new Set([ring - Math.abs(dx), -ring + Math.abs(dx)])]) {
            const x = Math.max(width / 2 + 5, Math.min(rect.width - width / 2 - 5, anchorX + dx * (width + 8)));
            const y = Math.max(125, Math.min(rect.height - 110, anchorY + direction * 20 + dy * 29));
            if (!occupied.some(o => Math.abs(x - o.x) < (width + o.w) / 2 + 5 && Math.abs(y - o.y) < (height + o.h) / 2 + 3)) { chosen = { x, y, w: width, h: height }; found = true; break; }
          }
        }
        occupied.push(chosen); label.style.left = `${chosen.x}px`; label.style.top = `${chosen.y}px`;
        line.setAttribute('x1', String(anchorX)); line.setAttribute('y1', String(anchorY)); line.setAttribute('x2', String(chosen.x)); line.setAttribute('y2', String(chosen.y));
        line.setAttribute('stroke', v.issues.length ? '#c66d4e' : v.config.modelId.startsWith('usv') ? '#568e7d' : '#a68f60');
      });
      renderer.info.reset(); renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(render);
  }
  raf = requestAnimationFrame(render);
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); stopped = true; cancelAnimationFrame(raf); $('#env-error').hidden = false; $('#env-error').textContent = '图形上下文中断，请刷新并导入已保存的配置。'; });
  const api = {
    setActive(value: boolean) { active = value; if (value) { resize(); controls.update(); } },
    dispose() { stopped = true; cancelAnimationFrame(raf); observer.disconnect(); clearTimeout(toastTimer); background?.dispose(); transform.dispose(); controls.dispose(); disposeRuntime(runtime); selection.geometry.dispose(); (selection.material as T.Material).dispose(); envMap.dispose(); sun.shadow.dispose(); renderer.dispose(); },
    get runtime() { return runtime; }, get renderer() { return renderer; }, get camera() { return camera; }, get transform() { return transform; },
    snapshot, importText, switchEnvironment, addVehicle, select, overview, focusSelected, shot,
  };
  if (import.meta.env.DEV) Object.assign(window, { __environmentWorkbench: api });
  return api;
}
