import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createQuadrotor, createUSV, quadrotorPresets, usvPresets } from './models';
import type { ModelHandle, ModelColors, QuadrotorVariant, USVVariant } from './models';
import './style.css';
import './ui.css';
import { compactPanel } from './responsive';

const droneIcon = `<svg viewBox="0 0 80 64" fill="none" aria-hidden="true"><g stroke="currentColor" stroke-width="2"><path d="m24 19 32 28m0-28L24 47" stroke-width="5"/><rect x="32" y="23" width="16" height="20" rx="5" fill="currentColor"/><ellipse cx="22" cy="17" rx="16" ry="7"/><ellipse cx="58" cy="17" rx="16" ry="7"/><ellipse cx="22" cy="49" rx="16" ry="7"/><ellipse cx="58" cy="49" rx="16" ry="7"/></g><path d="m37 29 3-4 3 4" stroke="#fff" stroke-width="1.5"/></svg>`;
const boatIcon = `<svg viewBox="0 0 80 64" fill="none" aria-hidden="true"><path d="M40 5C25 18 22 31 23 57h34C58 31 55 18 40 5Z" fill="currentColor" fill-opacity=".10" stroke="currentColor" stroke-width="2"/><rect x="31" y="27" width="18" height="21" rx="4" fill="currentColor"/><path d="M28 52h24M40 16v8m-9 13h18" stroke="currentColor" stroke-width="2"/><circle cx="40" cy="34" r="3" fill="#fff"/></svg>`;
const icons = {
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  camera: '<path d="M8 6l2-3h4l2 3h5v14H3V6Z"/><circle cx="12" cy="12" r="4"/>',
  cube: '<path d="m12 2 9 5v10l-9 5-9-5V7Zm0 10v10M3 7l9 5 9-5M7.5 4.5l9 5v5"/>',
};
const icon = (name: keyof typeof icons) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
type Entry = { id: string; kind: 'quadrotor' | 'usv'; variant: QuadrotorVariant | USVVariant; name: string; code: string; description: string; primary: string; secondary: string; accent: string };
const entries: Entry[] = [
  ...Object.entries(quadrotorPresets).map(([variant, p]) => ({ ...p, id: `quadrotor-${variant}`, kind: 'quadrotor' as const, variant: variant as QuadrotorVariant })),
  ...Object.entries(usvPresets).map(([variant, p]) => ({ ...p, id: `usv-${variant}`, kind: 'usv' as const, variant: variant as USVVariant })),
];
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="app-header">
    <a class="brand" href="./" aria-label="空海模型工作台首页"><span class="brand-symbol">${icon('cube')}</span><span>空海<span class="brand-divider">/</span><span class="brand-sub">模型工作台</span></span></a>
    <nav class="workspace-tabs" aria-label="工作台"><button id="mode-models" aria-pressed="true"><strong>模型库</strong><small>18 款载具</small></button><button id="mode-environments" aria-pressed="false"><strong>环境库</strong><small>8 个水域</small></button><button id="mode-algorithms" aria-pressed="false"><strong>算法库</strong><small>13 项任务与方法</small></button><button id="mode-dynamics" aria-pressed="false"><strong>动力学</strong><small>推力与惯性</small></button></nav>
    <div class="local-status"><span></span> 本地工作区</div>
  </header>
  <main class="workspace">
    <aside class="library" aria-label="模型库">
      <details open class="mobile-panel"><summary>模型库 <span>${entries.length} 款模型</span></summary><div class="panel-inner">
        <div class="panel-heading"><span>模型库</span><span class="count">${entries.length}</span></div>
        <p class="panel-hint">选择载具，查看结构与配色。</p><label class="model-search"><span>查找模型</span><input id="model-search" type="search" placeholder="名称、编号或任务…" autocomplete="off"/></label><p id="model-search-empty" role="status" hidden>没有匹配的模型，请更换关键词。</p>
        <div class="model-sections">${(['quadrotor', 'usv'] as const).map(kind => `<section class="model-section"><h2><span>${kind === 'quadrotor' ? '四旋翼无人机' : '单体无人艇'}</span><span>${kind === 'quadrotor' ? 'AIR' : 'WATER'}</span></h2><div class="model-list">${entries.filter(e => e.kind === kind).map(e => `<button class="model-button" data-model="${e.id}" aria-pressed="false"><span class="model-thumb ${e.variant}">${kind === 'quadrotor' ? droneIcon : boatIcon}</span><span class="model-info"><span class="model-code">${e.code}</span><strong>${e.name}</strong><small>${kind === 'quadrotor' ? '四旋翼' : '单尖船首'}<span class="selection-dot"></span></small></span></button>`).join('')}</div></section>`).join('')}
        </div><div class="library-note">${icon('cube')}<p>程序化构造<span>独立模型 · 可复用代码</span></p></div>
      </div></details>
    </aside>
    <section class="stage" aria-label="三维模型预览">
      <div class="stage-heading"><div><div class="eyebrow"><span id="model-code">Q-01</span><span class="small-line"></span><span id="model-category">QUADROTOR</span></div><h1 id="model-title">轻型巡检</h1><p id="model-description"></p></div><span class="view-tag"><i></i> 实时三维</span></div>
      <div id="viewport" tabindex="0" role="img" aria-label="可旋转缩放的三维模型；也可使用下方标准视角按钮"></div>
      <div class="stage-actions"><button id="screenshot" class="icon-button" title="保存当前视图" aria-label="保存当前视图">${icon('camera')}<span>保存图片</span></button><button id="fullscreen" class="icon-button" title="全屏预览" aria-label="全屏预览">${icon('expand')}<span>全屏</span></button></div>
      <div class="model-caption"><span id="caption-kind">X 形布局 · 四组独立旋翼</span><span>+Z 前向 / Y 向上</span></div>
      <div class="view-controls" role="group" aria-label="标准视角"><button data-view="perspective" class="active" aria-pressed="true">透视</button><button data-view="front" aria-pressed="false">前视</button><button data-view="side" aria-pressed="false">侧视</button><button data-view="top" aria-pressed="false">俯视</button><button data-view="bottom" aria-pressed="false">底视</button></div>
      <div class="stage-footer"><span><i class="mouse-icon"></i> 拖动旋转 <b>·</b> 滚轮缩放 <b>·</b> 右键平移</span><span id="render-status">准备场景…</span></div>
      <div id="error" role="alert" hidden></div>
    </section>
    <aside class="inspector" aria-label="模型参数"><details open class="mobile-panel"><summary>模型设置 <span>外观与显示</span></summary><div class="panel-inner">
      <div class="panel-heading"><span>模型设置</span>${icon('cube')}</div>
      <section class="settings-section"><h2>几何信息 <span>METRES</span></h2><div class="dimension-grid"><div><span>长度</span><strong id="dim-length">—</strong></div><div><span>宽度</span><strong id="dim-width">—</strong></div><div><span>高度</span><strong id="dim-height">—</strong></div></div><p class="dimension-note">模型整体包围尺寸 · 演示设定</p><label class="range-label" for="scale">整体缩放 <output id="scale-value">1.00 ×</output></label><input id="scale" type="range" min="0.5" max="2" value="1" step="0.05"/><div class="range-extents"><span>0.5 ×</span><span>2.0 ×</span></div></section>
      <section class="settings-section"><h2>材质配色 <button id="restore-colors" class="text-button">恢复</button></h2><label class="color-row" for="primary"><span>机身 / 船体</span><span class="color-input"><code id="primary-hex"></code><input type="color" id="primary" aria-label="主色"/></span></label><label class="color-row" for="secondary"><span>结构辅色</span><span class="color-input"><code id="secondary-hex"></code><input type="color" id="secondary" aria-label="辅色"/></span></label><label class="color-row" for="accent"><span>识别标识</span><span class="color-input"><code id="accent-hex"></code><input type="color" id="accent" aria-label="点缀色"/></span></label></section>
      <section class="settings-section"><h2>显示与动画</h2><label class="toggle-row" for="wireframe"><span>线框模式</span><input class="switch" type="checkbox" id="wireframe"/></label><label class="toggle-row" for="axes"><span>坐标轴</span><input class="switch" type="checkbox" id="axes"/></label><label class="toggle-row" for="animate"><span id="animation-label">旋翼转动</span><input class="switch" type="checkbox" id="animate"/></label><div id="speed-control"><label class="range-label" for="speed">转速 <output id="speed-value">12 rad/s</output></label><input id="speed" type="range" min="0" max="40" value="12" step="1" disabled/></div></section>
      <div class="structure-note"><span class="note-mark">i</span><div><strong id="structure-title">四旋翼结构</strong><p id="structure-description">四组电机与双叶桨，相邻旋翼反向旋转。</p></div></div>
      <button id="model-dynamics" class="model-dynamics-link">试验此载具的动力学 ↗</button><p class="dimension-note">按原始米制尺寸进入试验场，调整质量、推力与风流。</p><div class="inspector-footer"><span>比例单位</span><strong>1 unit = 1 m</strong></div>
    </div></details></aside>
  </main>
  <footer class="app-footer"><span>空海模型库 <b>/</b> 原创工程造型</span><span>THREE.JS <b>+</b> VITE <span class="footer-dot">·</span> ${entries.length} 款程序化模型</span></footer>
  <div id="toast" role="status" aria-live="polite"></div>`;

const $ = <E extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<E>(selector)!;
const releaseCompactPanel = compactPanel($<HTMLDetailsElement>('.library details'), 850);
window.addEventListener('pagehide', releaseCompactPanel, { once: true });
let workspaceMode: 'models' | 'environments' | 'algorithms' | 'dynamics' = 'models';
let environmentEditor: ReturnType<typeof import('./scenes/editor').createEnvironmentEditor> | undefined;
let algorithmWorkbench: ReturnType<typeof import('./algorithms/workbench').createAlgorithmWorkbench> | undefined;
let editorLoading: Promise<void> | undefined;
let algorithmsLoading: Promise<void> | undefined;
let dynamicsLab: ReturnType<typeof import('./dynamics/lab').createDynamicsLab> | undefined;
let dynamicsLoading: Promise<void> | undefined;
const modelWorkspace = $('.workspace'), modelFooter = $('.app-footer');
const environmentHost = document.createElement('div'); environmentHost.id = 'environment-app'; environmentHost.hidden = true; $('#app').appendChild(environmentHost);
const algorithmHost = document.createElement('div'); algorithmHost.id = 'algorithm-app'; algorithmHost.hidden = true; $('#app').appendChild(algorithmHost);
const dynamicsHost = document.createElement('div'); dynamicsHost.id = 'dynamics-app'; dynamicsHost.hidden = true; $('#app').appendChild(dynamicsHost);
async function switchWorkspace(mode: typeof workspaceMode) {
  workspaceMode = mode; modelWorkspace.hidden = modelFooter.hidden = mode !== 'models'; environmentHost.hidden = mode !== 'environments';
  algorithmHost.hidden = mode !== 'algorithms';
  dynamicsHost.hidden = mode !== 'dynamics'; $('#mode-dynamics').setAttribute('aria-pressed', String(mode === 'dynamics'));
  $('#mode-models').setAttribute('aria-pressed', String(mode === 'models')); $('#mode-environments').setAttribute('aria-pressed', String(mode === 'environments'));
  $('#mode-algorithms').setAttribute('aria-pressed', String(mode === 'algorithms'));
  if (mode === 'environments' && !environmentEditor) {
    editorLoading ??= import('./scenes/editor').then(({ createEnvironmentEditor }) => { environmentEditor = createEnvironmentEditor(environmentHost); environmentEditor.setActive(workspaceMode === 'environments'); }).catch(error => { environmentHost.textContent = `环境库启动失败：${String(error)}`; editorLoading = undefined; });
    await editorLoading;
  }
  if (mode === 'algorithms' && !algorithmWorkbench) {
    algorithmsLoading ??= import('./algorithms/workbench').then(({ createAlgorithmWorkbench }) => {
      algorithmWorkbench = createAlgorithmWorkbench(algorithmHost, async config => {
        await switchWorkspace('environments');
        if (environmentEditor && 'importText' in environmentEditor) environmentEditor.importText(JSON.stringify(config));
        else throw new Error('三维环境尚未初始化，请检查 WebGL 支持');
      });
      algorithmWorkbench.setActive(workspaceMode === 'algorithms');
    }).catch(error => { algorithmHost.textContent = `算法库启动失败：${String(error)}`; algorithmsLoading = undefined; });
    await algorithmsLoading;
  }
  if (mode === 'dynamics' && !dynamicsLab) {
    dynamicsLoading ??= import('./dynamics/lab').then(({ createDynamicsLab }) => { dynamicsLab = createDynamicsLab(dynamicsHost); dynamicsLab.setActive(workspaceMode === 'dynamics'); }).catch(error => { dynamicsHost.textContent = `动力学试验场启动失败：${String(error)}`; dynamicsLoading = undefined; });
    await dynamicsLoading;
  }
  dynamicsLab?.setActive(workspaceMode === 'dynamics');
  environmentEditor?.setActive(workspaceMode === 'environments');
  algorithmWorkbench?.setActive(workspaceMode === 'algorithms');
}
$('#mode-models').addEventListener('click', () => { void switchWorkspace('models'); });
$('#mode-environments').addEventListener('click', () => { void switchWorkspace('environments'); });
$('#mode-algorithms').addEventListener('click', () => { void switchWorkspace('algorithms'); });
$('#mode-dynamics').addEventListener('click', () => { void switchWorkspace('dynamics'); });
$('#model-dynamics').addEventListener('click', async () => { await switchWorkspace('dynamics'); dynamicsLab?.selectModel(active.id); });
window.addEventListener('pagehide', () => { algorithmWorkbench?.dispose(); dynamicsLab?.dispose(); });
let active = entries[0];
let handle: ModelHandle;
let renderer: T.WebGLRenderer;
let scene: T.Scene;
let camera: T.PerspectiveCamera;
let controls: OrbitControls;
let ground: T.Mesh;
let axes: T.AxesHelper;
let diagonal = 1;
let currentView = 'perspective';
let resizeObserver: ResizeObserver;
let frame = 0;
let stopped = false;
const colors: Record<string, ModelColors> = {};
const scales: Record<string, number> = {};
let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2400); }
function fail(message: string) { $('#error').hidden = false; $('#error').textContent = message; $('#render-status').textContent = '预览不可用'; }
function modelFactory(entry: Entry): ModelHandle {
  const options = { scale: scales[entry.id] ?? 1, colors: colors[entry.id] };
  return entry.kind === 'quadrotor' ? createQuadrotor({ ...options, variant: entry.variant as QuadrotorVariant }) : createUSV({ ...options, variant: entry.variant as USVVariant });
}
function applyWireframe() {
  const enabled = $<HTMLInputElement>('#wireframe').checked;
  handle.root.traverse(o => { if (o instanceof T.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m instanceof T.MeshStandardMaterial) m.wireframe = enabled; });
}
function measure() {
  handle.root.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(handle.root), size = bounds.getSize(new T.Vector3());
  $('#dim-length').textContent = size.z.toFixed(2); $('#dim-width').textContent = size.x.toFixed(2); $('#dim-height').textContent = size.y.toFixed(2);
  diagonal = size.length(); ground.position.y = bounds.min.y - diagonal * 0.018;
  axes.scale.setScalar(diagonal * 0.45); controls.target.copy(bounds.getCenter(new T.Vector3()));
  camera.near = diagonal / 100; camera.far = Math.max(80, diagonal * 50); camera.updateProjectionMatrix();
  controls.minDistance = diagonal * 0.28; controls.maxDistance = diagonal * 5;
}
function setView(view: string) {
  currentView = view;
  const direction = ({ perspective: [1.25, 0.95, 1.6], front: [0, 0, 1], side: [1, 0, 0], top: [0, 1, -0.00001], bottom: [0, -1, 0.00001] } as Record<string, number[]>)[view];
  camera.up.set(0, 1, 0);
  // Project all eight bounding-box corners into this view, with an 18% margin.
  // This keeps long boats and flat drones prominent without clipping on narrow screens.
  const vFov = T.MathUtils.degToRad(camera.fov), hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const forward = new T.Vector3(...direction).normalize();
  const right = new T.Vector3().crossVectors(camera.up, forward).normalize(), up = new T.Vector3().crossVectors(forward, right);
  const bounds = new T.Box3().setFromObject(handle.root);
  let distance = 0;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const offset = new T.Vector3(x, y, z).sub(controls.target);
    distance = Math.max(distance, offset.dot(forward) + Math.max(Math.abs(offset.dot(right)) / (Math.tan(hFov / 2) * 0.82), Math.abs(offset.dot(up)) / (Math.tan(vFov / 2) * 0.82)));
  }
  // Flush damping before applying a precise standard view.
  const damping = controls.enableDamping; controls.enableDamping = false; controls.update(); controls.enableDamping = damping;
  camera.position.copy(controls.target).add(forward.multiplyScalar(distance));
  camera.lookAt(controls.target); controls.enabled = true; controls.update();
  ground.visible = view !== 'bottom';
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => { const on = b.dataset.view === view; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
}
function updateColorFields() {
  for (const key of ['primary', 'secondary', 'accent'] as const) {
    const color = String(colors[active.id]?.[key] ?? active[key]);
    $<HTMLInputElement>(`#${key}`).value = color;
    $(`#${key}-hex`).textContent = color.toUpperCase();
  }
  $<HTMLButtonElement>('#restore-colors').disabled = !(['primary', 'secondary', 'accent'] as const).some(key => String(colors[active.id]?.[key] ?? active[key]).toLowerCase() !== active[key].toLowerCase());
}
function selectModel(id: string, preserveView = false) {
  const next = entries.find(e => e.id === id); if (!next) return;
  const newHandle = modelFactory(next);
  handle?.dispose(); active = next; handle = newHandle; scene.add(handle.root);
  applyWireframe();
  $('#model-title').textContent = active.name; $('#model-code').textContent = active.code; $('#model-description').textContent = active.description;
  const isAir = active.kind === 'quadrotor';
  $('#model-category').textContent = isAir ? 'QUADROTOR' : 'UNCREWED SURFACE VESSEL';
  $('#caption-kind').textContent = isAir ? 'X 形布局 · 四组独立旋翼' : '单体船形 · 中轴线单尖船首';
  $('#animation-label').textContent = isAir ? '旋翼转动' : '推进器转动';
  $('#structure-title').textContent = isAir ? '四旋翼结构' : '单尖船首结构';
  $('#structure-description').textContent = isAir ? '四组电机与双叶桨，相邻旋翼反向旋转。' : '左右船舷沿中轴线汇成一个尖点，连续曲面构成封闭船体。';
  document.querySelectorAll<HTMLButtonElement>('[data-model]').forEach(b => { const on = b.dataset.model === id; b.classList.toggle('selected', on); b.setAttribute('aria-pressed', String(on)); });
  const scale = scales[id] ?? 1;
  $<HTMLInputElement>('#scale').value = String(scale); $('#scale-value').textContent = scale.toFixed(2) + ' ×';
  updateColorFields(); measure(); setView(preserveView ? currentView : 'perspective');
  $('#render-status').textContent = '场景就绪';
}

function init() {
  const viewport = $('#viewport');
  try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); }
  catch { fail('无法启动三维预览。请使用支持 WebGL 2 的现代浏览器，并开启硬件加速后刷新页面。'); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
  viewport.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); stopped = true; cancelAnimationFrame(frame); fail('图形上下文已中断。请刷新页面重新加载模型。'); });
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(35, 1, 0.01, 100);
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.10;
  controls.addEventListener('start', () => { document.querySelectorAll('[data-view]').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); }); ground.visible = true; });
  const pmrem = new T.PMREMGenerator(renderer), room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04); scene.environment = environment.texture; scene.environmentIntensity = 0.7;
  room.dispose(); pmrem.dispose();
  scene.add(new T.HemisphereLight('#f0f6ff', '#727b82', 0.9));
  const key = new T.DirectionalLight('#fff7e9', 3.2); key.position.set(3, 6, 4); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -5; key.shadow.camera.right = 5; key.shadow.camera.top = 5; key.shadow.camera.bottom = -5; key.shadow.normalBias = 0.012; key.shadow.bias = -0.0001; key.shadow.radius = 4; scene.add(key);
  const fill = new T.DirectionalLight('#c2ddf5', 1.1); fill.position.set(-4, 2, -3); scene.add(fill);
  ground = new T.Mesh(new T.PlaneGeometry(200, 200), new T.ShadowMaterial({ color: '#344d5b', opacity: 0.17 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  axes = new T.AxesHelper(1); axes.visible = false; scene.add(axes);
  const resize = () => { const w = viewport.clientWidth, h = viewport.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); if (handle) setView(currentView); };
  resize(); selectModel(active.id);
  resizeObserver = new ResizeObserver(resize); resizeObserver.observe(viewport);
  document.querySelectorAll<HTMLButtonElement>('[data-model]').forEach(b => b.addEventListener('click', () => selectModel(b.dataset.model!)));
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view!)));
  $('#model-search').addEventListener('input', () => {
    const query = $<HTMLInputElement>('#model-search').value.trim().toLowerCase(); let count = 0;
    document.querySelectorAll<HTMLButtonElement>('[data-model]').forEach(button => {
      const entry = entries.find(e => e.id === button.dataset.model)!;
      button.hidden = !`${entry.name} ${entry.code} ${entry.description} ${entry.kind === 'usv' ? '无人艇 水面' : '无人机 空中'}`.toLowerCase().includes(query); if (!button.hidden) count++;
    });
    document.querySelectorAll<HTMLElement>('.model-section').forEach(section => section.hidden = !section.querySelector('.model-button:not([hidden])'));
    $('#model-search-empty').hidden = count > 0;
  });
  $('#wireframe').addEventListener('change', applyWireframe);
  $('#axes').addEventListener('change', () => { axes.visible = $<HTMLInputElement>('#axes').checked; });
  $('#animate').addEventListener('change', () => { $<HTMLInputElement>('#speed').disabled = !$<HTMLInputElement>('#animate').checked; });
  $('#speed').addEventListener('input', () => { $('#speed-value').textContent = $<HTMLInputElement>('#speed').value + ' rad/s'; });
  $('#scale').addEventListener('input', () => { const scale = Number($<HTMLInputElement>('#scale').value); scales[active.id] = scale; handle.root.scale.setScalar(scale); $('#scale-value').textContent = scale.toFixed(2) + ' ×'; measure(); setView(currentView); });
  for (const key of ['primary', 'secondary', 'accent'] as const) $(`#${key}`).addEventListener('input', () => {
    colors[active.id] = { ...colors[active.id], [key]: $<HTMLInputElement>(`#${key}`).value }; selectModel(active.id, true);
  });
  $('#restore-colors').addEventListener('click', () => { delete colors[active.id]; selectModel(active.id, true); });
  $('#fullscreen').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('.stage').requestFullscreen(); } catch { toast('此浏览器暂不支持全屏预览'); }
  });
  document.addEventListener('fullscreenchange', () => { $('#fullscreen span').textContent = document.fullscreenElement ? '退出全屏' : '全屏'; $('#fullscreen').setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '全屏预览'); });
  $('#screenshot').addEventListener('click', () => {
    renderer.render(scene, camera);
    const canvas = document.createElement('canvas'); canvas.width = renderer.domElement.width; canvas.height = renderer.domElement.height;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#e8eef1'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(renderer.domElement, 0, 0);
    canvas.toBlob(blob => { if (!blob) { toast('图片保存失败，请重试'); return; } const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${active.code}-${currentView}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('已保存当前视图'); });
  });
  viewport.addEventListener('keydown', event => {
    if (event.key === 'Home') { measure(); setView('perspective'); event.preventDefault(); }
    if (event.key === '+' || event.key === '=' || event.key === '-') { camera.position.sub(controls.target).multiplyScalar(event.key === '-' ? 1.1 : 0.9).add(controls.target); event.preventDefault(); }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      const offset = camera.position.clone().sub(controls.target), spherical = new T.Spherical().setFromVector3(offset);
      spherical.theta += event.key === 'ArrowLeft' ? 0.10 : event.key === 'ArrowRight' ? -0.10 : 0;
      spherical.phi = T.MathUtils.clamp(spherical.phi + (event.key === 'ArrowUp' ? -0.10 : event.key === 'ArrowDown' ? 0.10 : 0), 0.02, Math.PI - 0.02);
      camera.position.copy(controls.target).add(new T.Vector3().setFromSpherical(spherical)); camera.up.set(0, 1, 0); event.preventDefault();
    }
  });
  let previous = performance.now();
  const render = (time: number) => {
    if (stopped) return;
    const dt = Math.max(0, Math.min((time - previous) / 1000, 0.05)); previous = time;
    if (!document.hidden && workspaceMode === 'models') { handle.update(dt, { rotorSpeed: $<HTMLInputElement>('#animate').checked ? Number($<HTMLInputElement>('#speed').value) : 0 }); controls.update(); renderer.render(scene, camera); }
    frame = requestAnimationFrame(render);
  };
  frame = requestAnimationFrame(render);
  // Development-only diagnostics used by the acceptance checks, not by model consumers.
  if (import.meta.env.DEV) Object.assign(window, { __modelWorkbench: { get handle() { return handle; }, get renderer() { return renderer; }, get camera() { return camera; }, get scene() { return scene; }, selectModel, setView, entries } });
  window.addEventListener('pagehide', () => { stopped = true; cancelAnimationFrame(frame); resizeObserver.disconnect(); controls.dispose(); handle.dispose(); environment.dispose(); ground.geometry.dispose(); (ground.material as T.Material).dispose(); axes.dispose(); key.shadow.dispose(); renderer.dispose(); environmentEditor?.dispose(); });
}
try { init(); } catch (error) { console.error(error); fail('模型初始化失败，请刷新页面重试。详细信息可在浏览器控制台查看。'); }
