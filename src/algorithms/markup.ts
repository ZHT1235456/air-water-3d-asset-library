import { algorithmCatalog } from './catalog';
import { environmentLibrary } from '../scenes/environment-library';
import { environmentPresets } from '../environments/definitions';
import { usvPresets } from '../models';

export const algorithmMarkup = () => `<main class="algorithm-workbench">
  <aside class="algo-library" aria-label="算法目录">
    <div class="algo-section-title">实验方法 <span>05 / METHODS</span></div>
    <p class="algo-hint">选择任务，在真实水域中观察协同运动。</p>
    <div class="algo-list">${algorithmCatalog.map(a => `<button data-algorithm="${a.id}" aria-pressed="false"><span class="algo-symbol">${a.label}</span><span><small>${a.family}</small><strong>${a.name}</strong></span><span class="algo-selected-mark">↗</span></button>`).join('')}</div>
    <div class="algo-principle"><p id="algo-description"></p><details><summary>方法与适用范围</summary><code id="algo-equation"></code><p id="algo-note"></p><a id="algo-reference" target="_blank" rel="noreferrer"></a></details></div>
    <div class="algo-limit"><span>实验约定</span><p>默认采用三自由度水动力学：惯性、阻力、风流与推进器滞后。参数为工程估算。几何航线不保证动力学可行；触及安全包络会终止实验。未建模波浪载荷及海上避碰规则。</p></div>
  </aside>
  <section class="algo-stage" aria-label="三维算法实验">
    <header class="algo-stage-heading"><div><div class="eyebrow">USV / MOTION LAB</div><h1 id="algo-title"></h1><p id="algo-scene-name"></p></div><span id="algo-state" class="algo-state">准备中</span></header>
    <div class="algo-viewport-wrap">
      <div id="algo-viewport"></div>
      <div class="algo-view-tools" role="group" aria-label="实验视角"><label>视角<select id="algo-camera"><option value="mission">航线全景</option><option value="fleet">艇群近景</option><option value="top">任务俯视</option><option value="custom" hidden>自由视角</option></select></label><button id="algo-follow" aria-pressed="false" disabled>跟随 01 号艇</button></div>
      <div class="algo-pick-tools"><select id="algo-pick-mode" aria-label="场景选点"><option value="">拖动观察</option><option value="start" id="algo-start-option">设置起点</option><option value="goal" id="algo-goal-option">设置终点</option></select></div>
      <div class="algo-map-key"><span><i class="path-key"></i>计划航线</span><span><i class="trail-key"></i>运动轨迹</span><span>点击艇号聚焦</span></div><span id="algo-sky-status">正在准备三维场景…</span>
    </div>
    <a id="algo-attribution" target="_blank" rel="noreferrer"></a>
    <div class="algo-telemetry" aria-label="实验指标"><div><span>仿真时间</span><strong id="algo-time">0.0 <small>s</small></strong></div><div><span>累计航程</span><strong id="algo-distance">0.0 <small>m</small></strong></div><div><span>最小中心距</span><strong id="algo-separation">—</strong></div><div><span id="algo-metric-label">搜索节点</span><strong id="algo-metric">—</strong></div></div>
    <div class="algo-playback"><button id="algo-run" class="algo-primary" disabled>生成方案</button><button id="algo-step" disabled title="向前推进 0.1 秒">单步</button><button id="algo-reset" disabled>回到起点</button><label>速度<select id="algo-rate"><option value="1">1 ×</option><option value="4">4 ×</option><option value="16" selected>16 ×</option><option value="32">32 ×</option></select></label></div>
    <div class="algo-timeline"><label for="algo-replay">轨迹回看</label><input id="algo-replay" type="range" min="0" max="0" value="0" disabled/><output id="algo-replay-time">实时</output></div>
    <p id="algo-message" role="status" aria-live="polite">正在准备实验…</p>
  </section>
  <aside class="algo-settings" aria-label="实验参数"><details open class="algo-settings-details"><summary>实验设置 <span>场景 / 载具 / 参数</span></summary><div class="algo-settings-content">
    <div class="algo-section-title">实验设置 <span>CONFIGURATION</span></div>
    <label>水域场景<select id="algo-environment">${environmentLibrary.map(e => `<option value="${e.variant}">${environmentPresets[e.variant].name}</option>`).join('')}</select></label>
    <label>无人艇模型<select id="algo-model">${Object.entries(usvPresets).map(([v, p]) => `<option value="${v}">${p.code} · ${p.name}</option>`).join('')}</select></label>
    <label>运动模型<select id="algo-motion"><option value="dynamics">水动力学 · 推力与惯性</option><option value="kinematic">运动学 · 算法基线</option></select></label>
    <details id="algo-physics-fields" class="algo-coordinates"><summary>风流与动力参数</summary><p id="algo-physics-note"></p><div class="algo-field-grid"><label>水流 X m/s<input id="algo-current-x" type="number" min="-3" max="3" step="0.1" value="0"/></label><label>水流 Z m/s<input id="algo-current-z" type="number" min="-3" max="3" step="0.1" value="0"/></label><label>风速 X m/s<input id="algo-wind-x" type="number" min="-20" max="20" step="1" value="0"/></label><label>风速 Z m/s<input id="algo-wind-z" type="number" min="-20" max="20" step="1" value="0"/></label></div><p>以世界坐标 X/Z 输入。完整载具参数可在动力学工作台调整；此处使用所选型号的默认估算参数。</p></details>
    <div class="algo-field-grid"><label id="algo-count-label">艇数<input id="algo-count" type="number" min="1" max="12" value="6"/></label><label>巡航指令 m/s<input id="algo-speed" type="number" min="0.1" max="15" step="0.5" value="4"/></label></div>
    <div class="algo-field-grid" id="algo-formation-fields"><label>艇间距 m<input id="algo-spacing" type="number" min="2" max="100" value="12"/></label><label>控制增益 1/s<input id="algo-gain" type="number" min="0.01" max="2" step="0.05" value="0.35"/></label></div>
    <label id="algo-formation-label">目标队形<select id="algo-formation"><option value="wedge">楔形编队</option><option value="column">纵列编队</option><option value="line">横列编队</option></select></label>
    <label id="algo-grid-label">规划栅格 m<input id="algo-grid" type="number" min="1" max="1000" step="1" value="20"/></label>
    <div id="algo-coverage-fields" hidden><div class="algo-field-grid"><label>覆盖宽度 m<input id="algo-width" type="number" min="10" max="2000" value="240"/></label><label>覆盖高度 m<input id="algo-height" type="number" min="10" max="2000" value="200"/></label></div><label>航线 / 采样间距 m<input id="algo-lane" type="number" min="2" max="200" value="25"/></label></div>
    <details class="algo-coordinates"><summary>精确选点 <span>X / Z · m</span></summary><span id="algo-start-label">起点</span><div class="algo-field-grid"><label>X<input id="algo-start-x" type="number" step="1"/></label><label>Z<input id="algo-start-z" type="number" step="1"/></label></div><div id="algo-goal-fields"><span>终点</span><div class="algo-field-grid"><label>X<input id="algo-goal-x" type="number" step="1"/></label><label>Z<input id="algo-goal-z" type="number" step="1"/></label></div></div></details>
    <p id="algo-envelope" class="algo-hint"></p><div id="algo-plan-info" class="algo-plan-info"></div>
    <div class="algo-export"><span class="algo-section-title">实验结果</span><div><button id="algo-json" disabled>实验 JSON ↓</button><button id="algo-csv" disabled>轨迹 CSV ↓</button></div><button id="algo-open-scene" disabled>编辑当前艇群 ↗</button><p>前往环境编辑器调整此时刻的艇群布局。导出文件包含参数、轨迹和结果。</p></div>
  </div></details></aside>
</main>`;
