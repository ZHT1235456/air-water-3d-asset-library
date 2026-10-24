import { defineEnvironment, environmentPresets } from '../environments/definitions';
import type { EnvironmentVariant, Point2, SpatialData } from '../environments/types';
import { environmentLibrary } from '../scenes/environment-library';
import { conservativeBounds, type SceneConfig } from '../scenes/config';
import { createUSV, usvPresets, type USVVariant } from '../models';
import { algorithmCatalog, distance, ExperimentSimulation, NavigationDomain, trajectoryCSV } from './index';
import type { AlgorithmId, ExperimentConfig, ExperimentPlan, Formation, Frame } from './types';
import './workbench.css';
import { algorithmMarkup } from './markup';
import { createExperimentScene, fleetColors, type ExperimentCamera } from './scene';
import { compactPanel } from '../responsive';
import { parameterBasis, usvProfile } from '../dynamics';

const format = (n: number, digits = 1) => Number.isFinite(n) ? n.toFixed(digits) : '—';
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type })), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function createAlgorithmWorkbench(host: HTMLElement, openScene: (config: SceneConfig) => Promise<void>) {
  host.innerHTML = algorithmMarkup();
  const $ = <E extends HTMLElement = HTMLElement>(s: string) => host.querySelector<E>(s)!;
  const releaseCompactPanel = compactPanel($<HTMLDetailsElement>('.algo-settings-details'), 1050);
  const narrow = matchMedia('(max-width: 640px)');
  const revealMethod = () => { if (narrow.matches) host.querySelector<HTMLElement>('[data-algorithm][aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' }); };
  narrow.addEventListener('change', revealMethod);
  const num = (s: string) => $<HTMLInputElement>(s).valueAsNumber;
  let active = true, disposed = false, running = false, busy = false, replay = -1, animation = 0;
  let algorithm: AlgorithmId = 'astar', environment: EnvironmentVariant = 'westlake', model: USVVariant = 'survey';
  let spatial: SpatialData, domain: NavigationDomain, plan: ExperimentPlan | undefined, simulation: ExperimentSimulation | undefined;
  let worker: Worker | undefined, generation = 0;
  let start: Point2 = [-60, 150], goal: Point2 = [-850, -200];
  let radius = 3, minY = -1, maxY = 2;
  let fleetCount = 6;
  let picking: 'start' | 'goal' | null = null;
  const message = (text: string, error = false) => { $('#algo-message').textContent = text; $('#algo-message').classList.toggle('is-error', error); };
  let view: ReturnType<typeof createExperimentScene> | undefined;
  function cancelPicking() { picking = null; $<HTMLSelectElement>('#algo-pick-mode').value = ''; view?.setPicking(false); }
  try {
    view = createExperimentScene($('#algo-viewport'), {
      status(text) { $('#algo-sky-status').textContent = text; },
      interact(mode) { cancelPicking(); view?.follow(false); $('#algo-follow').setAttribute('aria-pressed', 'false'); $<HTMLSelectElement>('#algo-camera').value = mode ?? 'custom'; },
      select(i) { cancelPicking(); $('#algo-follow').textContent = `跟随 ${String(i + 1).padStart(2, '0')} 号艇`; $('#algo-follow').setAttribute('aria-pressed', 'false'); $<HTMLSelectElement>('#algo-camera').value = 'custom'; },
      pick(p) {
        if (!picking) return;
        if (!domain.contains(p, radius)) { message('选点靠近岸线或障碍，请在可通航水面重新选择。', true); return; }
        if (picking === 'start') start = p; else goal = p;
        picking = null; $<HTMLSelectElement>('#algo-pick-mode').value = ''; syncCoordinates(); invalidate();
      },
    });
  } catch { $('#algo-viewport').textContent = '无法启动三维视口，请开启浏览器硬件加速后刷新。'; }
  const settings = () => ({ algorithm, motion: $<HTMLSelectElement>('#algo-motion').value, vehicle: model,
    current: $<HTMLSelectElement>('#algo-motion').value === 'dynamics' ? [num('#algo-current-x'), num('#algo-current-z')] : [0, 0], wind: $<HTMLSelectElement>('#algo-motion').value === 'dynamics' ? [num('#algo-wind-x'), num('#algo-wind-z')] : [0, 0], start: [...start], goal: ['consensus', 'coverage'].includes(algorithm) ? [...start] : [...goal], fleetSize: algorithm === 'astar' || algorithm === 'dijkstra' ? 1 : num('#algo-count'),
    speed: num('#algo-speed'), spacing: ['leader', 'consensus'].includes(algorithm) ? num('#algo-spacing') : 12, gain: ['leader', 'consensus'].includes(algorithm) ? num('#algo-gain') : 0.35, gridSize: algorithm === 'consensus' ? 100 : num('#algo-grid'), radius, minY, maxY,
    formation: $<HTMLSelectElement>('#algo-formation').value as Formation, coverageWidth: algorithm === 'coverage' ? num('#algo-width') : 240, coverageHeight: algorithm === 'coverage' ? num('#algo-height') : 200, laneSpacing: algorithm === 'coverage' ? num('#algo-lane') : 25 } as ExperimentConfig);
  function syncCoordinates() {
    for (const [id, p] of [['start', start], ['goal', goal]] as const) { $<HTMLInputElement>(`#algo-${id}-x`).value = p[0].toFixed(1); $<HTMLInputElement>(`#algo-${id}-z`).value = p[1].toFixed(1); }
  }
  function modelEnvelope() {
    const handle = createUSV({ variant: model }), b = conservativeBounds(handle, `usv-${model}`); handle.dispose();
    radius = Math.ceil((Math.hypot(Math.max(Math.abs(b.min[0]), Math.abs(b.max[0])), Math.max(Math.abs(b.min[2]), Math.abs(b.max[2]))) + 0.5) * 10) / 10;
    minY = b.min[1]; maxY = b.max[1];
    $('#algo-envelope').textContent = `安全包络半径 ${radius.toFixed(1)} m · 包含设备外廓及 0.5 m 余量`;
    const p = usvProfile(model); $('#algo-physics-note').textContent = `估算质量 ${p.mass} kg · ${p.propulsion === 'twin' ? '双桨差速' : '单桨转向'} · 单桨上限 ${p.maxThrust.toFixed(1)} N · 电机响应 ${p.motorTimeConstant} s。`;
  }
  function loadEnvironment() {
    spatial = defineEnvironment(environment).spatial; domain = new NavigationDomain(spatial, { minY, maxY });
    const spawn = spatial.spawnPoints.find(p => p.kind === 'usv');
    start = spawn ? [spawn.position[0], spawn.position[2]] : [0, 0];
    const fixed: Partial<Record<EnvironmentVariant, Point2>> = { westlake: [-850, -200], kallang: [-380, 790], waalhaven: [100, -600] };
    goal = fixed[environment] ?? start;
    if (!fixed[environment]) {
      searchGoal: for (const clearance of [radius + 50, radius]) for (const d of [350, 200, 100, 50, 25]) {
        const candidates: Point2[] = [[start[0], start[1] - d], [start[0] + d, start[1]], [start[0] - d, start[1]], [start[0], start[1] + d]];
        const found = candidates.find(p => domain.segmentClear(start, p, clearance));
        if (found) { goal = found; break searchGoal; }
      }
    }
    $<HTMLInputElement>('#algo-grid').value = String(Math.max(10, Math.ceil(Math.max(spatial.bounds.maxX - spatial.bounds.minX, spatial.bounds.maxZ - spatial.bounds.minZ) / 140 / 5) * 5));
    $('#algo-scene-name').textContent = `${environmentPresets[environment].name} · ${environment === 'deepwater' ? '原创工程布局' : '公开地理数据'} · 三维运动实验`;
    const source = environmentLibrary.find(e => e.variant === environment)!;
    const attribution = $<HTMLAnchorElement>('#algo-attribution'); attribution.href = source.source; attribution.textContent = source.attribution;
    syncCoordinates(); view?.setEnvironment(environment);
  }
  function invalidate() {
    generation++; worker?.terminate(); worker = undefined; busy = false; running = false; replay = -1; plan = undefined; simulation = undefined;
    view?.clearPlan(); view?.setEndpoints(start, ['consensus', 'coverage'].includes(algorithm) ? undefined : goal, ['consensus', 'coverage'].includes(algorithm)); $('#algo-follow').setAttribute('aria-pressed', 'false');
    $('#algo-follow').textContent = '跟随 01 号艇';
    $('#algo-plan-info').textContent = ''; message('参数已更新，点击下方「生成方案」计算新的航线。'); refresh(); draw();
  }
  function selectAlgorithm(id: AlgorithmId) {
    if (!['astar', 'dijkstra'].includes(algorithm)) fleetCount = num('#algo-count');
    algorithm = id; picking = null; invalidate(); $('#algo-follow').textContent = '跟随 01 号艇';
    const a = algorithmCatalog.find(a => a.id === id)!;
    host.querySelectorAll<HTMLButtonElement>('[data-algorithm]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.algorithm === id)));
    revealMethod();
    $('#algo-title').textContent = a.name; $('#algo-description').textContent = a.description; $('#algo-equation').textContent = a.equation; $('#algo-note').textContent = a.note;
    const reference = $<HTMLAnchorElement>('#algo-reference'); reference.hidden = !a.reference;
    if (a.reference) { reference.textContent = `${a.reference.title} ↗`; reference.href = a.reference.url; }
    const formation = id === 'leader' || id === 'consensus', hasGoal = id === 'astar' || id === 'dijkstra' || id === 'leader';
    $('#algo-formation-fields').hidden = $('#algo-formation-label').hidden = !formation;
    $('#algo-coverage-fields').hidden = id !== 'coverage'; $('#algo-grid-label').hidden = id === 'consensus';
    $('#algo-goal-fields').hidden = !hasGoal; $<HTMLOptionElement>('#algo-goal-option').disabled = !hasGoal; $('#algo-goal-option').hidden = !hasGoal; $<HTMLSelectElement>('#algo-pick-mode').value = '';
    $('#algo-count-label').hidden = id === 'astar' || id === 'dijkstra';
    $<HTMLInputElement>('#algo-count').disabled = id === 'astar' || id === 'dijkstra';
    $<HTMLInputElement>('#algo-count').value = String(id === 'astar' || id === 'dijkstra' ? 1 : fleetCount);
    $('#algo-start-option').textContent = $('#algo-start-label').textContent = id === 'coverage' ? '设覆盖中心' : id === 'consensus' ? '设编队中心' : '设起点';
    void build();
  }
  async function build() {
    invalidate(); busy = true; refresh(); message('正在计算可通航航线与初始艇群…');
    const ticket = generation, config = settings();
    worker = new Worker(new URL('./planning.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<{ plan?: ExperimentPlan; error?: string }>) => {
      if (ticket !== generation || disposed) return;
      worker?.terminate(); worker = undefined; busy = false;
      if (data.error || !data.plan) { message(data.error ?? '未生成方案，请调整参数重试', true); refresh(); draw(); return; }
      plan = data.plan; domain = new NavigationDomain(spatial, config); simulation = new ExperimentSimulation(plan, domain);
      view?.setPlan(plan, model); draw(); fitMission();
      $('#algo-plan-info').textContent = `航线总长 ${format(plan.routeLength)} m · 扩展 ${plan.expanded.toLocaleString()} 节点${['astar', 'dijkstra'].includes(algorithm) ? ` · 栅格代价 ${format(plan.gridCost)} m` : ''}${algorithm === 'coverage' ? ` · ${plan.samples.length} 个采样点 / 排除 ${plan.excludedSamples} 个陆地或障碍点` : ''}`;
      message(`${plan.initial.length} 艘艇已就位。运行后可暂停、回看并导出轨迹。`); refresh(); draw();
    };
    worker.onerror = () => { if (ticket !== generation) return; worker?.terminate(); worker = undefined; busy = false; message('规划模块加载失败，请重新生成方案或刷新页面。', true); refresh(); };
    worker.postMessage({ spatial, config });
  }
  function frame(): Frame | undefined {
    if (!simulation) return;
    return replay >= 0 ? simulation.frames[replay] : simulation.currentFrame();
  }
  function fitMission() { view?.view('mission'); $<HTMLSelectElement>('#algo-camera').value = 'mission'; }
  function draw(dt = 0) { view?.render(frame(), simulation?.frames ?? [], dt); }
  function refresh() {
    const s = simulation, end = s && ['complete', 'blocked', 'timeout'].includes(s.status);
    $('#algo-state').textContent = busy ? '计算中' : replay >= 0 ? '历史回看' : !s ? '待生成' : running ? '运行中' : s.status === 'complete' ? '已完成' : s.status === 'blocked' ? '受阻停止' : s.status === 'timeout' ? '到达时限' : s.time > 0 ? '已暂停' : '就绪';
    $('#algo-state').classList.toggle('is-running', running);
    $<HTMLButtonElement>('#algo-run').disabled = busy || !view;
    $('#algo-run').textContent = busy ? '计算中…' : !s ? '生成方案' : running ? '暂停' : end ? '重新运行' : s.time > 0 ? '继续运行' : '运行实验';
    $<HTMLButtonElement>('#algo-step').disabled = !s || busy || running || !!end;
    $<HTMLButtonElement>('#algo-reset').disabled = !s || s.time === 0 || busy;
    for (const id of ['open-scene', 'json', 'csv', 'follow']) $<HTMLButtonElement>(`#algo-${id}`).disabled = !s || busy;
    $<HTMLOptionElement>('#algo-camera option[value="fleet"]').disabled = !s;
    $('#algo-time').innerHTML = `${format(frame()?.time ?? 0)} <small>s</small>`;
    $('#algo-distance').innerHTML = `${format(s?.distance ?? 0)} <small>m</small>`;
    $('#algo-separation').innerHTML = s && s.vessels.length > 1 ? `${format(s.minSeparation)} <small>m</small>` : '—';
    $('#algo-metric-label').textContent = algorithm === 'coverage' ? '采样点到达率' : ['leader', 'consensus'].includes(algorithm) ? '编队 RMS 误差' : '搜索节点';
    $('#algo-metric').innerHTML = !s || !plan ? '—' : algorithm === 'coverage' ? `${format(s.coverage * 100, 0)} <small>%</small>` : ['leader', 'consensus'].includes(algorithm) ? `${format(s.formationError, 2)} <small>m</small>` : plan.expanded.toLocaleString();
    const slider = $<HTMLInputElement>('#algo-replay'); slider.max = String(Math.max(0, (s?.frames.length ?? 1) - 1)); slider.value = replay >= 0 ? String(replay) : slider.max; slider.disabled = !s || s.frames.length < 2 || running;
    $('#algo-replay-time').textContent = replay >= 0 ? `${format(frame()!.time)} s` : '实时';
    $('#algo-distance').parentElement!.title = $('#algo-separation').parentElement!.title = $('#algo-metric').parentElement!.title = '完整运行的统计结果；回看时仅改变场景与时间';
    view?.setPicking(!!picking);
  }
  function terminalMessage() {
    if (!simulation) return;
    if (simulation.status === 'complete') message(`实验完成 · ${format(simulation.time)} s · ${format(simulation.distance)} m。可回看轨迹或导出结果。`);
    if (simulation.status === 'blocked') message(simulation.stopReason || '连续 10 秒无法前进，实验已停止。请增大艇间距、调整任务区或减少艇数后重新生成方案。', true);
    if (simulation.status === 'timeout') message('已达到 1,800 秒仿真时限。可导出当前轨迹，或调整参数重新实验。', true);
  }
  function step() { if (!simulation) return; replay = -1; simulation.step(); if (simulation.status !== 'running') { running = false; terminalMessage(); } }
  function resultFrames() {
    if (!simulation) return [];
    const frames = simulation.frames.slice();
    if (frames.at(-1)!.time < simulation.time) frames.push(simulation.currentFrame());
    return frames;
  }
  function sceneConfig(): SceneConfig {
    const f = frame()!, p = usvPresets[model], centre: Point2 = [f.vessels.reduce((s, v) => s + v.position[0], 0) / f.vessels.length, f.vessels.reduce((s, v) => s + v.position[1], 0) / f.vessels.length];
    const span = Math.max(30, ...f.vessels.map(v => distance(v.position, centre) * 3));
    return { version: 1, environment: { variant: environment, seed: environmentPresets[environment].seed }, vehicles: f.vessels.map((v, i) => ({ id: `algo-${i + 1}`, modelId: `usv-${model}`, position: [v.position[0], 0, v.position[1]], yaw: v.yaw, scale: 1,
      colors: { primary: p.primary, secondary: p.secondary, accent: fleetColors[i % fleetColors.length] } })), view: { selectedId: null, cameraPosition: [centre[0] + span * 0.4, span, centre[1] + span * 0.75], target: [centre[0], 0, centre[1]], labels: true, waterBoundary: false, obstacles: false, spawns: false, waterAnimation: false, rotorAnimation: false } };
  }
  host.querySelectorAll<HTMLButtonElement>('[data-algorithm]').forEach(button => button.onclick = () => selectAlgorithm(button.dataset.algorithm as AlgorithmId));
  $<HTMLSelectElement>('#algo-environment').value = environment; $<HTMLSelectElement>('#algo-model').value = model;
  $('#algo-environment').onchange = () => { environment = $<HTMLSelectElement>('#algo-environment').value as EnvironmentVariant; invalidate(); loadEnvironment(); void build(); };
  $('#algo-model').onchange = () => { model = $<HTMLSelectElement>('#algo-model').value as USVVariant; modelEnvelope(); domain = new NavigationDomain(spatial, { minY, maxY }); invalidate(); };
  $('#algo-motion').onchange = () => { $('#algo-physics-fields').hidden = $<HTMLSelectElement>('#algo-motion').value === 'kinematic'; invalidate(); };
  host.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.algo-settings input, #algo-formation').forEach(input => input.onchange = () => {
    if (input.id.startsWith('algo-start-')) start = [num('#algo-start-x'), num('#algo-start-z')];
    if (input.id.startsWith('algo-goal-')) goal = [num('#algo-goal-x'), num('#algo-goal-z')];
    invalidate();
  });
  $('#algo-run').onclick = () => {
    cancelPicking();
    if (!simulation) { void build(); return; }
    if (['complete', 'blocked', 'timeout'].includes(simulation.status)) simulation = new ExperimentSimulation(plan!, domain);
    running = !running; replay = -1;
    message(running ? '实验运行中。可跟随任一艘艇，或暂停后回看轨迹。' : `已暂停在 ${format(simulation.time)} s，可单步、回看或导出当前结果。`);
    refresh();
  };
  $('#algo-step').onclick = () => { cancelPicking(); step(); if (simulation?.status === 'running') message(`已前进至 ${format(simulation.time)} s，继续运行将从此处开始。`); refresh(); draw(); };
  $('#algo-reset').onclick = () => { if (plan) simulation = new ExperimentSimulation(plan, domain); running = false; replay = -1; message('已复位到初始艇群。'); refresh(); draw(); };
  $('#algo-camera').onchange = () => { cancelPicking(); view?.view($<HTMLSelectElement>('#algo-camera').value as ExperimentCamera); $('#algo-follow').setAttribute('aria-pressed', 'false'); draw(); };
  $('#algo-follow').onclick = () => { cancelPicking(); const on = $('#algo-follow').getAttribute('aria-pressed') !== 'true'; view?.follow(on); $('#algo-follow').setAttribute('aria-pressed', String(on)); $<HTMLSelectElement>('#algo-camera').value = 'custom'; draw(); };
  $('#algo-pick-mode').onchange = () => {
    picking = ($<HTMLSelectElement>('#algo-pick-mode').value || null) as typeof picking;
    running = false; if (picking) { view?.view('top'); $<HTMLSelectElement>('#algo-camera').value = 'top'; $('#algo-follow').setAttribute('aria-pressed', 'false'); }
    message(picking ? '在水面上点击选点，再生成方案；也可在右侧「精确选点」输入坐标。' : '拖动旋转 · 滚轮缩放 · 右键平移。点击艇号可查看近景。'); refresh(); draw();
  };
  $('#algo-viewport').addEventListener('keydown', e => {
    if (e.key === 'Escape' && picking) { picking = null; $<HTMLSelectElement>('#algo-pick-mode').value = ''; message('已退出选点，可继续观察场景。'); refresh(); }
  });
  $('#algo-replay').oninput = () => { running = false; replay = num('#algo-replay'); message('正在回看历史时刻；航程、中心距和误差显示完整运行结果。'); refresh(); draw(); };
  $('#algo-csv').onclick = () => download(`${environment}-${algorithm}-trajectory.csv`, trajectoryCSV(resultFrames()), 'text/csv;charset=utf-8');
  $('#algo-json').onclick = () => {
    if (!plan || !simulation) return;
    download(`${environment}-${algorithm}-experiment.json`, JSON.stringify({ version: 2, coordinateSystem: 'local metres, X/Z, Y=0', parameterBasis, dynamics: plan.config.motion === 'kinematic' ? null : usvProfile(model), environment: { variant: environment, seed: environmentPresets[environment].seed }, modelId: `usv-${model}`, method: algorithmCatalog.find(a => a.id === algorithm), plan,
      result: { status: simulation.status === 'running' && !running ? 'paused' : simulation.status, stopReason: simulation.stopReason, time: simulation.time, distance: simulation.distance, minSeparation: Number.isFinite(simulation.minSeparation) ? simulation.minSeparation : null, formationError: simulation.formationError, coverage: simulation.coverage, blockedSteps: simulation.blockedSteps }, frames: resultFrames(), scene: sceneConfig() }, null, 2), 'application/json');
  };
  $('#algo-open-scene').onclick = async () => { if (!simulation) return; running = false; refresh(); try { await openScene(sceneConfig()); } catch (error) { message(`三维场景打开失败：${String(error)}`, true); } };
  let previous = performance.now(), accumulator = 0;
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - previous) / 1000); previous = now;
    if (active && !document.hidden && running) {
      accumulator += dt * Number($<HTMLSelectElement>('#algo-rate').value);
      while (accumulator >= 0.1 && running) { step(); accumulator -= 0.1; }
      refresh();
    } else accumulator = 0;
    if (active && !document.hidden) draw(running ? dt : 0);
    if (!disposed) animation = requestAnimationFrame(tick);
  };
  modelEnvelope(); loadEnvironment(); selectAlgorithm(algorithm); animation = requestAnimationFrame(tick);
  const api = { setActive(value: boolean) { active = value; if (!value) running = false; view?.setActive(value); refresh(); if (value) draw(); }, dispose() { disposed = true; releaseCompactPanel(); narrow.removeEventListener('change', revealMethod); worker?.terminate(); cancelAnimationFrame(animation); view?.dispose(); },
    get simulation() { return simulation; }, get plan() { return plan; }, get busy() { return busy; }, get running() { return running; }, get view() { return view; }, sceneConfig };
  if (import.meta.env.DEV) Object.assign(window, { __algorithmWorkbench: api });
  return api;
}
