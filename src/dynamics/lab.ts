import { Euler, Quaternion } from 'three';
import { quadrotorPresets, usvPresets, type QuadrotorVariant, type USVVariant } from '../models';
import { compactPanel } from '../responsive';
import { gravity, parameterBasis, quadrotorProfile, usvProfile, type Vec3 } from './profiles';
import { dynamicsCSV, VehicleExperiment, type LabInput, type PhysicalOverrides } from './experiment';
import { createDynamicsScene } from './scene';
import './lab.css';

const field = (id: string, label: string, value: number, min: number, max: number, step = .1) => `<label>${label}<input id="dyn-${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" required/></label>`;
const markup = () => `<main class="dynamics-workbench">
  <aside class="dyn-config"><details open id="dyn-setup"><summary>载具与试验 <span>18 款模型</span></summary><div class="dyn-panel-content">
    <label>载具<select id="dyn-model">${[['quadrotor', quadrotorPresets, '四旋翼无人机'], ['usv', usvPresets, '无人艇']].map(([kind, presets, title]) => `<optgroup label="${title}">${Object.entries(presets).map(([v, p]) => `<option value="${kind}-${v}">${p.code} · ${p.name}</option>`).join('')}</optgroup>`).join('')}</select></label>
    <label>试验<select id="dyn-experiment"></select></label><p id="dyn-description" class="dyn-hint"></p>
    <div id="dyn-manual" class="dyn-fields"><label>油门 / 倒车<input id="dyn-throttle" type="range" min="-1" max="1" step="0.01" value="0.65"/><output id="dyn-throttle-value"></output></label><label>艇首转向<input id="dyn-turn" type="range" min="-1" max="1" step="0.01" value="0"/><output id="dyn-turn-value"></output></label></div>
    <div id="dyn-target-fields"><h2>目标位置 <small>m · 世界坐标</small></h2><div class="dyn-fields">${field('target-x', 'X', 0, -100, 100)}${field('target-y', '高度 Y', 3, .2, 60)}${field('target-z', 'Z', 0, -100, 100)}${field('yaw', '航向 °', 0, -180, 180, 1)}${field('cruise', '巡航 m/s', 2.5, .2, 8)}</div></div>
    <label class="dyn-check dyn-power"><input id="dyn-power" type="checkbox" checked/>动力接通</label><p class="dyn-hint">关闭后电机逐渐停转，惯性仍会保留。</p>
    <section class="dyn-actuators"><h2>推进器反馈 <small>实际转速 / 推力</small></h2><div id="dyn-motors"></div></section>
    <details class="dyn-method"><summary>方程与适用范围</summary><code id="dyn-equation"></code><p id="dyn-limits"></p><a id="dyn-reference" target="_blank" rel="noreferrer">模型依据 ↗</a></details>
  </div></details></aside>
  <section class="dyn-stage"><header><div><div class="eyebrow">AIR / WATER · DYNAMICS</div><h1>动力学试验场</h1><p id="dyn-subtitle"></p></div><span id="dyn-state">就绪</span></header>
    <div class="dyn-view-wrap"><div id="dyn-viewport"></div><div class="dyn-view-tools"><label>视角<select id="dyn-camera"><option value="follow">跟随载具</option><option value="overview">试验场全景</option><option value="top">俯视</option></select></label><label class="dyn-check"><input type="checkbox" id="dyn-vectors" checked/>向量</label><label class="dyn-check"><input type="checkbox" id="dyn-trail" checked/>轨迹</label></div><div class="dyn-view-key"><span>● 速度 × 2</span><span>● 推力方向</span><span>◎ 目标</span></div><span class="dyn-world-note">1 单位 = 1 米 · Y 向上 / 模型前向 +Z</span></div>
    <div class="dyn-telemetry"><div><span>仿真时间</span><strong id="dyn-time"></strong></div><div><span>地速</span><strong id="dyn-speed"></strong></div><div><span id="dyn-attitude-label">离地高度</span><strong id="dyn-altitude"></strong></div><div><span id="dyn-rate-label">倾斜角</span><strong id="dyn-attitude"></strong></div></div>
    <div class="dyn-playback"><button id="dyn-run" class="dyn-primary">运行试验</button><button id="dyn-step">单步 0.02 s</button><button id="dyn-reset" disabled>复位</button><label>速度<select id="dyn-rate"><option value="1">1 ×</option><option value="4">4 ×</option><option value="8">8 ×</option></select></label></div>
    <div class="dyn-timeline"><label for="dyn-replay">历史回看</label><input type="range" id="dyn-replay" min="0" max="0" value="0" disabled/><output id="dyn-replay-time">实时</output></div><p id="dyn-message" role="status" aria-live="polite"></p>
  </section>
  <aside class="dyn-parameters"><details open id="dyn-parameters-details"><summary>物理参数 <span>工程估算 · 可校准</span></summary><div class="dyn-panel-content">
    <p class="dyn-hint">质量与推力按原创模型尺寸估算，尚无实测标定。修改下列参数会复位试验。</p>
    <div class="dyn-fields">${field('mass', '质量 kg', 2, .1, 2000)}${field('thrust', '单桨最大推力 N', 10, .1, 5000, .001)}${field('lag', '电机响应 s', .055, .01, 2, .005)}${field('drag', '阻力倍率', 1, 0, 5, .1)}</div>
    <button id="dyn-defaults" class="dyn-text-button">恢复本型号参数</button><p id="dyn-capacity" class="dyn-capacity"></p>
    <h2>环境扰动 <small>可在运行中调整</small></h2><div class="dyn-fields">${field('wind-x', '风速 X m/s', 0, -20, 20, .5)}${field('wind-z', '风速 Z m/s', 0, -20, 20, .5)}</div><div id="dyn-current-fields" class="dyn-fields">${field('current-x', '水流 X m/s', 0, -3, 3)}${field('current-z', '水流 Z m/s', 0, -3, 3)}</div>
    <p class="dyn-hint">正负号表示流向；风流均为世界坐标中的恒定速度。水面试验采用静水面，不叠加视觉摇摆。</p>
    <div class="dyn-export"><h2>记录与复现</h2><button id="dyn-json">参数与记录 JSON ↓</button><button id="dyn-csv">状态轨迹 CSV ↓</button><p class="dyn-hint">记录位置、姿态、速度、角速度、各桨推力及输入。每次试验最长 180 秒。</p></div>
  </div></details></aside>
</main>`;

function download(name: string, content: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500); }

export function createDynamicsLab(host: HTMLElement) {
  host.innerHTML = markup();
  const $ = <E extends HTMLElement = HTMLElement>(s: string) => host.querySelector<E>(s)!;
  const number = (id: string) => $<HTMLInputElement>(`#dyn-${id}`).valueAsNumber;
  const input = (id: string) => $<HTMLInputElement>(`#dyn-${id}`);
  const releases = [compactPanel($<HTMLDetailsElement>('#dyn-setup'), 750), compactPanel($<HTMLDetailsElement>('#dyn-parameters-details'), 1050)];
  let kind: 'quadrotor' | 'usv' = 'quadrotor', variant: QuadrotorVariant | USVVariant = 'inspection', selectedExperiment = 'hover';
  let simulation: VehicleExperiment, running = false, active = true, disposed = false, replay = -1, animation = 0, invalid = false;
  let defaultPhysics: PhysicalOverrides;
  let view: ReturnType<typeof createDynamicsScene> | undefined;
  const message = (text: string, error = false) => { $('#dyn-message').textContent = text; $('#dyn-message').classList.toggle('is-error', error); };
  try { view = createDynamicsScene($('#dyn-viewport')); } catch { message('无法启动三维视口，请开启浏览器硬件加速后刷新。', true); }
  const parameters = (): PhysicalOverrides => ({ mass: number('mass'), maxThrust: number('thrust'), motorTimeConstant: number('lag'), dragScale: number('drag') });
  const commands = (): LabInput => ({ powered: input('power').checked, mode: kind === 'quadrotor' || selectedExperiment === 'waypoint' ? 'position' : 'manual', throttle: number('throttle'), turn: number('turn'), target: [number('target-x'), kind === 'quadrotor' ? number('target-y') : 0, number('target-z')], yaw: number('yaw') * Math.PI / 180, cruise: number('cruise'), wind: [number('wind-x'), 0, number('wind-z')], current: kind === 'usv' ? [number('current-x'), number('current-z')] : [0, 0] });
  function valid() {
    const bad = [...host.querySelectorAll<HTMLInputElement>('input[type=number]')].find(el => !el.closest('[hidden]') && !el.checkValidity());
    invalid = !!bad;
    if (bad) { running = false; message(`请填写有效的「${bad.parentElement!.childNodes[0].textContent}」，范围 ${bad.min}–${bad.max}。`, true); }
    return !bad;
  }
  function defaults() {
    const p = kind === 'quadrotor' ? quadrotorProfile(variant as QuadrotorVariant) : usvProfile(variant as USVVariant);
    input('mass').value = String(p.mass); input('lag').value = String(p.motorTimeConstant); input('drag').value = '1';
    input('thrust').value = String(Number(('maxThrust' in p ? p.maxThrust : p.thrustCoefficient * p.maxRotorSpeed ** 2).toFixed(3)));
    defaultPhysics = parameters();
  }
  function reset() {
    running = false; replay = -1;
    if (!valid()) { refresh(); return; }
    try { simulation = new VehicleExperiment(kind, variant, parameters(), commands()); invalid = false; }
    catch (error) { invalid = true; message(String(error), true); refresh(); return; }
    $('#dyn-capacity').textContent = kind === 'quadrotor' ? `最大推重比 ${(4 * number('thrust') / (number('mass') * gravity)).toFixed(2)}。${4 * number('thrust') <= number('mass') * gravity ? '当前推力不足以起飞。' : '实际推力受电机响应与姿态控制约束。'}` : `${simulation.boat!.profile.propulsion === 'twin' ? '双桨差速转向' : '单桨转向，不能原地回转'} · 转向根据实际角速度反馈调节，反打时自动减速。`;
    view?.view($<HTMLSelectElement>('#dyn-camera').value); message(view ? '已复位。运行后可实时调整目标、风流和动力开关。' : '无法启动三维视口，请开启浏览器硬件加速后刷新。', !view); refresh(); draw();
  }
  function chooseExperiment() {
    selectedExperiment = $<HTMLSelectElement>('#dyn-experiment').value;
    input('power').checked = selectedExperiment !== 'drift';
    input('target-x').value = selectedExperiment === 'waypoint' ? '8' : '0'; input('target-z').value = selectedExperiment === 'waypoint' ? '12' : '0'; input('target-y').value = selectedExperiment === 'waypoint' ? '5' : '3';
    input('yaw').value = '0'; input('wind-x').value = selectedExperiment === 'wind' ? '4' : '0'; input('wind-z').value = '0'; input('current-x').value = selectedExperiment === 'drift' ? '0.5' : '0'; input('current-z').value = '0'; input('throttle').value = '.65'; input('turn').value = '0';
    $('#dyn-description').textContent = ({ hover: '从地面起飞并保持目标高度。关闭动力可以观察推力衰减与下落。', waypoint: '载具依靠姿态或航向调整接近目标；可在运行中修改目标位置。', wind: '在 4 m/s 侧风中起飞并悬停，观察倾斜补偿及各电机推力。', manual: '滑杆请求艇首左转或右转，回中后逐渐停止旋转。反打时自动减速；关闭动力可观察惯性滑行。', drift: '初始关闭推进器，观察水流通过相对流速和水阻逐渐带动船体。' } as Record<string, string>)[selectedExperiment];
    $('#dyn-manual').hidden = kind !== 'usv' || selectedExperiment === 'waypoint'; $('#dyn-target-fields').hidden = kind === 'usv' && selectedExperiment !== 'waypoint';
    reset();
  }
  function chooseModel(id: string) {
    const [nextKind, nextVariant] = id.split('-'); kind = nextKind as typeof kind; variant = nextVariant as typeof variant;
    $<HTMLSelectElement>('#dyn-model').value = id; const p = kind === 'quadrotor' ? quadrotorPresets[variant as QuadrotorVariant] : usvPresets[variant as USVVariant];
    $('#dyn-subtitle').textContent = `${p.code} · ${p.name} / ${kind === 'quadrotor' ? '六自由度飞行' : '三自由度水面运动'}`;
    $<HTMLSelectElement>('#dyn-experiment').innerHTML = kind === 'quadrotor' ? '<option value="hover">起飞与悬停</option><option value="waypoint">三维航点跟踪</option><option value="wind">侧风悬停</option>' : '<option value="manual">加速、转弯与滑行</option><option value="waypoint">航点跟踪</option><option value="drift">随流漂移</option>';
    $('#dyn-current-fields').hidden = kind !== 'usv'; input('target-y').parentElement!.hidden = input('yaw').parentElement!.hidden = kind !== 'quadrotor'; input('cruise').parentElement!.hidden = kind !== 'usv';
    $('#dyn-equation').textContent = kind === 'quadrotor' ? 'm v̇ = R ΣF − mg + Fdrag\nI ω̇ = τ − ω × Iω\nFᵢ = kF ωᵢ²' : 'νr = ν − νcurrent\nMRB ν̇ + CRB ν + MA ν̇r\n+ CA νr + D νr = τprop + τwind';
    $('#dyn-limits').textContent = kind === 'quadrotor' ? '四元数姿态、四电机独立推力、反扭矩、惯量耦合、空气阻力及电机滞后。位置—速度—姿态—角速度级联控制。平面接地为简化接触；未建模桨叶柔性、地效、电池和传感器。' : '纵荡、横荡、艏摇，附加质量及科氏项，线性和二次阻力、风流及推进器滞后。重心假定在几何中心；未建模波浪、横摇、纵摇、升沉或障碍接触。';
    $<HTMLAnchorElement>('#dyn-reference').href = kind === 'quadrotor' ? 'https://docs.px4.io/main/en/flight_stack/controller_diagrams' : 'https://fossen.biz/html/marineCraftModel.html';
    $('#dyn-attitude-label').textContent = kind === 'quadrotor' ? '离地高度' : '艏向'; $('#dyn-rate-label').textContent = kind === 'quadrotor' ? '倾斜角' : '艏摇角速度';
    // Display physical sides while retaining the model asset's -X, +X channel order.
    const names = kind === 'quadrotor' ? ['前右', '前左', '后右', '后左'] : variant === 'inspection' ? ['单桨'] : ['右桨', '左桨'];
    $('#dyn-motors').innerHTML = names.map((name, i) => `<div class="dyn-motor"><span>${name}</span><strong id="dyn-motor-${i}"></strong><meter id="dyn-meter-${i}" min="0" max="1" value="0" aria-label="${name}推力比例"></meter></div>`).join('');
    view?.setModel(kind, variant); $<HTMLSelectElement>('#dyn-camera').value = 'follow'; defaults(); chooseExperiment();
  }
  const frame = () => replay >= 0 ? simulation.frames[replay] : simulation.snapshot();
  function draw() { if (simulation) view?.render(frame(), simulation.frames, input('vectors').checked, input('trail').checked); }
  function refresh() {
    if (!simulation) return;
    const f = frame(), finished = simulation.time >= 180, q = new Quaternion(...f.quaternion), euler = new Euler().setFromQuaternion(q, 'YXZ');
    $('#dyn-state').textContent = !view ? '视口不可用' : invalid ? '参数待修正' : replay >= 0 ? '历史回看' : running ? '运行中' : finished ? '已结束' : simulation.time > 0 ? '已暂停' : '就绪';
    $('#dyn-time').innerHTML = `${f.time.toFixed(2)} <small>s</small>`; $('#dyn-speed').innerHTML = `${Math.hypot(...f.velocity).toFixed(2)} <small>m/s</small>`;
    $('#dyn-altitude').innerHTML = kind === 'quadrotor' ? `${Math.max(0, f.position[1] - simulation.air!.profile.groundClearance).toFixed(2)} <small>m</small>` : `${(euler.y * 180 / Math.PI).toFixed(1)} <small>°</small>`;
    const tilt = Math.acos(Math.max(-1, Math.min(1, 1 - 2 * (f.quaternion[0] ** 2 + f.quaternion[2] ** 2)))) * 180 / Math.PI;
    $('#dyn-attitude').innerHTML = `${(kind === 'quadrotor' ? tilt : f.angularVelocity[1] * 180 / Math.PI).toFixed(1)} <small>${kind === 'quadrotor' ? '°' : '°/s'}</small>`;
    f.rotorSpeed.forEach((speed, i) => { $(`#dyn-motor-${i}`).textContent = `${Math.round(speed * 30 / Math.PI)} rpm / ${f.thrust[i].toFixed(1)} N`; $<HTMLMeterElement>(`#dyn-meter-${i}`).value = Math.abs(f.thrust[i]) / (simulation.boat?.profile.maxThrust ?? simulation.air!.maxRotorThrust); });
    for (const id of ['json', 'csv']) $<HTMLButtonElement>(`#dyn-${id}`).disabled = invalid;
    $<HTMLButtonElement>('#dyn-defaults').disabled = Object.entries(defaultPhysics).every(([key, value]) => parameters()[key as keyof PhysicalOverrides] === value);
    input('run').disabled = invalid || !view || finished; $('#dyn-run').textContent = running ? '暂停' : replay >= 0 ? '继续最新状态' : simulation.time > 0 ? '继续运行' : '运行试验';
    input('step').disabled = invalid || running || finished || !view; input('reset').disabled = simulation.time === 0 && !invalid;
    input('replay').max = String(simulation.frames.length - 1); input('replay').value = String(replay >= 0 ? replay : simulation.frames.length - 1); input('replay').disabled = simulation.frames.length < 2 || running;
    $('#dyn-replay-time').textContent = replay >= 0 ? `${f.time.toFixed(1)} s` : '实时';
    $('#dyn-throttle-value').textContent = `${(number('throttle') * 100).toFixed(0)} %`;
    const turn = number('turn'), turnLabel = turn === 0 ? '直航' : `${turn > 0 ? '右' : '左'}转 ${(Math.abs(turn) * 100).toFixed(0)} %`;
    $('#dyn-turn-value').textContent = turnLabel; input('turn').setAttribute('aria-valuetext', turnLabel);
    if (running) message(`${kind === 'quadrotor' ? f.grounded ? '地面接触' : '飞行中' : '静水面试验'} · ${f.saturated ? '已触及控制限幅' : '推力正常'} · ${f.input.powered ? '动力接通' : '动力已关闭'}。`);
  }
  function step() {
    if (invalid || simulation.time >= 180) return; replay = -1;
    const body = simulation.boat ?? simulation.air!, before = body.snapshot();
    try { simulation.step(); } catch (error) { Object.assign(body.state, before); running = false; invalid = true; message(`${String(error)}。可恢复本型号参数后重新运行。`, true); return; }
    if (simulation.time >= 180) { running = false; message('已完成 180 秒记录，可导出结果或复位后继续试验。'); }
  }
  $('#dyn-model').onchange = () => chooseModel($<HTMLSelectElement>('#dyn-model').value);
  $('#dyn-experiment').onchange = chooseExperiment;
  for (const id of ['mass', 'thrust', 'lag', 'drag']) input(id).onchange = reset;
  $('#dyn-defaults').onclick = () => { defaults(); reset(); };
  for (const id of ['power', 'throttle', 'turn', 'target-x', 'target-y', 'target-z', 'yaw', 'cruise', 'wind-x', 'wind-z', 'current-x', 'current-z']) input(id).oninput = () => { if (valid()) { simulation.input = commands(); replay = -1; message('输入已更新，将作用于后续运动。'); } refresh(); draw(); };
  $('#dyn-run').onclick = () => { if (!valid()) return; running = !running; replay = -1; if (!running) message('已暂停。可回看历史姿态和各桨推力，或单步观察。'); refresh(); };
  $('#dyn-step').onclick = () => { step(); refresh(); draw(); };
  $('#dyn-reset').onclick = reset;
  $('#dyn-camera').onchange = () => { view?.view($<HTMLSelectElement>('#dyn-camera').value); draw(); };
  for (const id of ['vectors', 'trail']) input(id).onchange = draw;
  input('replay').oninput = () => { replay = number('replay'); running = false; message('当前读数与三维姿态均来自选定历史时刻；继续运行将返回最新状态。'); refresh(); draw(); };
  $('#dyn-json').onclick = () => download(`${kind}-${variant}-dynamics.json`, JSON.stringify({ version: 1, parameterBasis, model: `${kind}-${variant}`, units: 'm, kg, s, N, radians; right-handed Y up; model +Z forward, -X right; quaternion xyzw', physicsStep: .005, profile: simulation.profile, frames: simulation.resultFrames() }, null, 2), 'application/json');
  $('#dyn-csv').onclick = () => download(`${kind}-${variant}-dynamics.csv`, dynamicsCSV(simulation.resultFrames()), 'text/csv;charset=utf-8');
  let previous = performance.now(), accumulator = 0;
  const tick = (now: number) => { const dt = Math.min(.05, (now - previous) / 1000); previous = now;
    if (active && !document.hidden && running) { accumulator += dt * Number($<HTMLSelectElement>('#dyn-rate').value); while (accumulator >= .02 && running) { step(); accumulator -= .02; } refresh(); } else accumulator = 0;
    if (active && !document.hidden) draw(); if (!disposed) animation = requestAnimationFrame(tick);
  };
  chooseModel('quadrotor-inspection'); animation = requestAnimationFrame(tick);
  const api = { setActive(value: boolean) { active = value; if (!value) running = false; else view?.resize(); refresh(); }, selectModel(id: string) { chooseModel(id); }, get simulation() { return simulation; }, get view() { return view; }, get running() { return running; }, dispose() { disposed = true; releases.forEach(fn => fn()); cancelAnimationFrame(animation); view?.dispose(); } };
  if (import.meta.env.DEV) Object.assign(window, { __dynamicsLab: api }); return api;
}
