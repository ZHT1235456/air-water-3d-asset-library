# 无人艇算法库

工作台第三个页签「算法库」包含 **8 项实际任务与 5 项规划/编队基线，共 13 项演示**，直接在三维水域中驱动米制无人艇。任务链为「任务状态机 → 航线/位置引导 → 推进器分配 → 三自由度水动力积分 → 三维模型」。新增任务强制使用水动力学，原有 5 项基线仍可显式选择运动学对照。可选 8 个水域、10 款无人艇，三维场景复用环境库的岸线、孔洞、设施、障碍与高度包络。参数为未实测标定的工程估算，详见 [动力学说明](dynamics.md)。

## 面向实际任务

| 任务 | 实际执行 | 完成条件与指标 |
| --- | --- | --- |
| 航道循迹 LOS | A* 全局路线，路段投影和可调前视引导，接近转角与终点减速 | 到达终点并低速稳定；横向 RMS/最大误差、航程、推力做功 |
| 多艇分区巡逻 | 每艇独立分区，闭合检查航线运行指定圈数，障碍段 A* 连接 | 实际抵达每圈检查点后计数，最后稳定停留 |
| 水质定点采样 | 每分区最多 6 站，最近邻安排访问顺序，完成后返回原出发泊位 | 每站距离 < 0.65 m、速度 < 0.25 m/s、艏摇率 < 0.12 rad/s 连续保持指定时间；中断重新计时 |
| 扩展区域搜索 | 每艇从分区中心向外执行 3 层扩展矩形 | 实际抵达检查点；是扩展方形搜索的分区工程变体，指标不是目标发现概率或连续面积覆盖率 |
| 动态目标伴随 | 外部参考目标沿平滑椭圆运动；目标速度前馈加位置反馈 | 指定观测时段结束，报告到目标加世界偏移的 RMS/最大误差；时段完成不代表误差达标 |
| 抗风流定点驻留 | 位置 PD、速度阻尼及风流阻力补偿，通过已有推进器实现 | 距离 < 1.2 m、速度 < 0.25 m/s、艏摇率 < 0.12 rad/s 连续保持指定时长；中断重新计时 |
| 返航低速靠泊 | A* 返航，设置直线进场点，最后进场指令 ≤ 0.55 m/s | 距离 < 0.65 m、速度 < 0.12 m/s、艏向误差 < 10°、艏摇率 < 0.12 rad/s，连续停留确认 |
| 交汇预测避碰 | 2–6 艘艇；15 个候选速度含制动，按同一水动力模型预测 6 s，每 0.5 s 重规划 | 连续扫掠包络筛选后按进展、间距和控制变化评分，偏好右转；记录最小中心距和重规划次数 |

`steerUSV` 负责航行，`holdUSV` 负责低速停留和终端控制，均只输出推进器指令。单桨不增加虚构横向力或独立原地转矩，可能无法在给定风流中驻留或满足靠泊条件。采样只记录到站和停留事件，不生成水质浓度或模拟取水机构。巡逻、搜索和采样从独立分区/泊位启动。靠泊使用虚拟水面泊位，不模拟码头接触或系缆。伴随参考目标以黄色三维标记显示，为外部给定轨迹；所有受控艇仍由动力学积分。

目录可筛选实际任务和基线；界面只显示所选任务适用字段。新增任务支持前视距离、连续停留、巡逻圈数、观测/驻留时长和目标速度。彩色环是检查点，完成后变绿，浅色外框是任务区域；金色箭头表示实际合推力方向，长度仅为显示缩放。顶部显示选中艇的实际推力和艏摇率。回看时检查点、参考目标、任务阶段和进度也使用历史记录。任务尚未稳定结束时进度最多显示 99%。

误差定义：航行类任务统计到当前计划航段的横向距离，驻留统计到目标点距离，伴随统计到目标加分配偏移的距离。RMS 按物理时间积分并包含驶入过程，最大值同时记录。推力做功在实际安装点按 `∫ Σ |Fᵢ · v安装点,ᵢ| dt` 计算，含转动速度贡献，单位 J；不是电池耗电量，不含推进器效率。所有新增任务结束时还要求低速和低艏摇率，伴随时段试验除外。

任务 API 使用 `ExperimentConfig.mission`：`lookahead` 默认 8 m、`dwellTime` 4 s、`laps` 2、`duration` 60 s、`targetSpeed` 0.8 m/s。工作台预置圈数 1 和时长 45 s。`motion: 'kinematic'` 在任务中会被拒绝。`examples/algorithms.ts` 支持所有任务 ID，例如 `createWestlakeExperiment('sampling')`。

JSON 的每帧 `mission` 字段包含完成检查点编号、逐艇连续停留时间/阶段、参考目标、进度、误差、推力做功和避碰计数。CSV 在原物理列后增加相应任务列。原 `thrust_left_or_single_N` / `thrust_right_N` 沿用资产通道名，依次是局部 −X/+X，即实际右桨/左桨。

新增方法背景：[Fossen、Pettersen、Galeazzi，2015，LOS 引导](https://fossen.biz/publications/2015%20Fossen%20et%20al%20TCST.pdf)、[Fox、Burgard、Thrun，1997，Dynamic Window Approach](https://publications.ri.cmu.edu/the-dynamic-window-approach-to-collision-avoidance)、[USCG，Search and Rescue Addendum](https://www.dco.uscg.mil/Portals/9/CG-5R/manuals/COMDTINST%20M16130.2F.pdf)。本项目未实现自适应 LOS 侧滑补偿；避碰为受 DWA 启发的速度采样工程基线，使用实际艇体模型预测，其他艇按上一轮速度选择预测，不声称复现标准 DWA 或保证任意交汇无死锁。

## 操作

1. 选择算法和水域。A* / Dijkstra 使用 1 艘艇；集群实验支持 1–12 艘。默认西湖规划由 `(-60, 150)` 前往 `(-850, -200)`，直线受岛屿阻挡，需要绕行。
2. 调整参数后点击视口下方「生成方案」。从视口右上角选择「设起点 / 设终点」后点击水面，或展开「精确选点」输入局部 X、Z 米制坐标。选点时自动进入俯视；覆盖与一致性实验使用中心点。坐标改动会使旧结果失效，避免导出参数与轨迹不一致的文件。
3. 同一个主按钮随状态切换为「运行实验」「暂停」「继续运行」或「重新运行」。用 1 / 4 / 16 / 32 倍速度观察，可单步 0.1 秒或「回到起点」。切换工作台页签自动暂停，后台标签不累计仿真时间。
4. 视角菜单提供航线全景、艇群近景与任务俯视。点击任一艇号可聚焦该艇，再开启「跟随」使相机随其运动；手动拖动会退出跟随。艇模型按真实米制比例渲染，标签自动避让并用引线指向对应模型；虚线表示计划航线，实线表示已经运动的轨迹。
5. 暂停后拖动「轨迹回看」。三维位置、朝向、桨相位、轨迹、任务状态与时间对应历史帧；航程和最小中心距仍是完整运行统计，原基线的编队误差/覆盖率也显示完整结果，界面会明确提示。「编辑当前艇群」把当前或回看时刻的空间快照带入环境编辑器；环境编辑器不播放算法。
6. 导出实验 JSON（参数、方法说明、计划、指标、轨迹、三维快照）或轨迹 CSV。JSON v2 另含完整默认动力参数和各帧的轴速、推力、转角、艇体速度与艏摇率；`scene` 字段符合环境库的 `SceneConfig`，提取后可作为环境配置导入；完整实验 JSON 不是环境配置文件。

三维视口支持拖动旋转、右键平移、滚轮或 `+` / `-` 缩放，`Home` 返回任务范围，`F` 聚焦选中的艇，`Escape` 退出选点。模型以 +Z 为船首、Y=0 为设计水位。窄屏下方法目录横向滚动，实验设置可折叠；尚未生成方案时，依赖结果的按钮禁用。

## 实现与适用边界

| 方法 | 实际计算 | 指标与边界 |
| --- | --- | --- |
| A* | 八邻接栅格，欧氏距离启发式，起终点连接附近可见栅格节点 | 与 Dijkstra 使用相同图；最优性针对离散图，不是连续水域 |
| Dijkstra | 同一图上令启发式为 0，按累计距离展开 | 显示展开节点数及栅格代价；两者都做通视折线简化，简化后长度另列 |
| 领航跟随 | A* 领航路径；`u_i = u_0 + k(p_0+d_i-p_i)`，逐艇限速 | 队形朝向固定于初始航向，初始偏移展开 8%，可观察误差收敛；领航速度为最大速度的 75% |
| 一致性编队 | `q_i=p_i-d_i`，固定完全图，`u_i=k(mean(q)-q_i)` | 运动学基线以同一比例限速并保留质心，误差 < 0.15 m 完成；水动力学模式要求误差 < 0.3 m 且各艇低速，不保证质心不变。初始队形展开 50% |
| 分区往复覆盖 | 将中心矩形沿 X 均分，每艇在自己的条带往复；遇障碍段用 A* 连接 | 开始时各艇位于各自首个有效采样点，不模拟从统一基地出发；到达率为离散点数比例，不是面积比例 |

领航路线以整个展开编队的保守圆包络规划，窄水道可能拒绝一个实际可变形通过的队形。覆盖排除陆地、障碍和包络不足的点；有效点间无栅格路径时整个方案失败，避免将不可达点误报为覆盖完成。障碍连接段可能离开矩形或条带，艇间冲突会由运动检查停止。

空间判断使用环境库同一份水域多边形、孔洞及障碍物。水平半径由所选模型整体包围盒四角的外接圆加 0.5 m 余量得到；垂直范围采用模型实际包围盒，低桥等障碍也参与计算。API 使用者需自行提供足够保守的包络。

每个物理子步检查完整圆扫掠包络，艇间检查相对运动线段的最小距离。水动力学模式先通过推力制动；若仍会触及包络，则在最后安全状态终止整个实验并记录原因，不把位置冻结称为实际刹停。运动学基线保留旧的位移停止规则。局部绕行仅在交汇预测避碰任务启用；没有全局时序预约、通用死锁解除、波浪耦合、通信时延、传感误差或 COLREGs。几何航线不保证动力学可执行性，也不能据此保证实艇安全或任意任务收敛。

原有基线连续 10 秒没有运动会标记为「受阻停止」；任务中的正常采样和驻留允许静止等待，1,800 秒仍为仿真上限。安全判断保守地保留重叠水域多边形的内部边界。最多 100,000 个栅格、1,500 个覆盖采样点，超过上限会提示调整参数。规划在 Web Worker 中执行，改动参数会终止旧计算。预测负载与硬件会影响实际播放速度，倍率不改变积分步长。

## 独立复用

核心入口 `src/algorithms/index.ts` 不依赖 DOM、Three.js 渲染器或工作台；需保留 `src/dynamics/` 参数和物理模块。几何层复用 `src/environments/spatial.ts`，数据类型来自 `src/environments/types.ts`；将这些依赖一并保留。`workbench.ts`、`markup.ts`、`scene.ts` 和 `planning.worker.ts` 是可选的页面层。`scene.ts` 独立管理三维模型、相机、航线、历史轨迹与 GPU 资源。

```ts
import { createWestlakeExperiment } from '../examples/algorithms';
import { trajectoryCSV } from '../src/algorithms';

const simulation = createWestlakeExperiment('leader');
while (!['complete', 'blocked', 'timeout'].includes(simulation.status)) {
  simulation.step(0.1);
}
const csv = trajectoryCSV(simulation.frames);
// 在自己的渲染循环中，使用 position=[x, 0, z]、rotation.y=yaw 驱动三维模型。
```

`buildExperiment(spatial, config)` 生成确定性方案；`NavigationDomain` 负责圆包络与线段检查；`GridPlanner.search(start, goal, method)` 返回路径、展开数、图上代价与简化长度；`ExperimentSimulation.step(dt)` 接受 `(0, 0.1]` 秒步长，动力学模式内部进一步拆到 ≤ 0.01 s。配置默认 `motion: dynamics`、`vehicle: survey`；`motion: kinematic` 显式选择旧基线。覆盖采样半径在两种模式下分别为 0.8 m / 0.6 m。`frames` 每 0.5 秒及终止时记录一帧，工作台导出时额外包含尚未采样的当前时刻。CSV 在 `time_s,vessel_id,x_m,z_m,yaw_rad` 后增加纵向速度、横向速度、艏摇率、左右/单桨推力及转角；运动学模式留空这些动力列。

## 来源

实现为本项目原创 TypeScript 代码，没有复制论文代码或下载论文到素材包。下列文献为方法来源或背景，页面同时给出链接：

- [Hart、Nilsson、Raphael，1968，A Formal Basis for the Heuristic Determination of Minimum Cost Paths](https://www.cs.auckland.ac.nz/courses/compsci709s2c/resources/Mike.d/astarNilsson.pdf)：A*。
- [Dijkstra，1959，A note on two problems in connexion with graphs](https://link.springer.com/article/10.1007/BF01386390)：最短路。
- [Olfati-Saber、Murray，2004，Consensus Problems in Networks of Agents With Switching Topology and Time-Delays](https://www.ee.iitb.ac.in/~dc/EE749/Olfati.pdf)：一致性背景。本项目只实现固定完全图的一阶基线，并加入限速与碰撞停止，不复现全部论文条件和结论。
- [Choset、Pignon，1997，Coverage Path Planning: The Boustrophedon Decomposition](https://publications.ri.cmu.edu/coverage-path-planning-the-boustrophedon-decomposition)：覆盖背景。本项目是矩形条带方法，不是完整牛耕单元分解。

验证命令：`npm test`、`npm run build`，启动开发服务器后执行 `npm run test:missions`、`npm run test:algorithms` 和 `npm run test:ui`。新增任务验收覆盖西湖中 8 项任务完整物理执行、实际低速停留、三维同步、参考目标历史回放、筛选、导出与 360/390 px 布局；报告在 `artifacts/missions/`。原基线与界面报告位于 `artifacts/algorithms/` 和 `artifacts/ui/`。
