> 环境列表包含深水港示范、青州和九洲航道桥、北海 Hornsea 2 风电场，以及新增的 **香港果洲群岛**：23 个有公开岸线的岛屿与岩礁，结合香港地政总署 5 m 地形数据构建。详见 [群岛组件与精度说明](docs/ninepin.md)、[风电场说明](docs/hornsea.md)。六个通用环境保留 API 兼容，但不展示在列表。

# 空海 · 载具模型与水域环境库

笔者用 GPT-6 Astra 建了一个素材库：十二款原创程序化三维模型与水域工程环境，基于 Three.js、Vite 和 TypeScript。模型构造模块可以单独复用；工作台提供中文交互、标准视角、配色、缩放、线框、坐标轴、桨叶动画与 PNG 截图。

[GitHub 公开仓库](https://github.com/ZHT1235456/air-water-3d-asset-library) · [中文开发日志 PDF](docs/development-log/main.pdf) · [LaTeX 源码](docs/development-log/main.tex)

开发日志作者：**朱华天，GPT-6.1 Sol，GPT-6 Astra**；日期：**2026年10月22日**。日志以实际运行截图记录模型、实景数据、天空与海面融合、排查过程和验收结果。

## 运行截图

![香港果洲群岛鸟瞰：真实岸线与历史地形数据](docs/development-log/images/ninepin-aerial.jpg)

| 四旋翼无人机 | 单尖船首无人艇 |
| --- | --- |
| ![轻型巡检无人机](docs/development-log/images/quadrotor.jpg) | ![水文测量无人艇](docs/development-log/images/usv.jpg) |

| 深水港原创工程示范 | 北海 Hornsea 2 实景局部校核 |
| --- | --- |
| ![深水港工作台](docs/development-log/images/deepwater.jpg) | ![海上风电场](docs/development-log/images/hornsea.jpg) |

![果洲群岛岛间水道：HDR 摄影天空与实时海面](docs/development-log/images/ninepin-waterline.jpg)

截图来自本项目实际浏览器运行。深水港为原创工程示范；桥梁、风电场和群岛的数据精度、近似范围及第三方授权分别见环境说明与 `public/assets/*/sources.json`。天空使用 Poly Haven CC0 全景，未分发未获授权的实景参考照片。

## 项目范围

原始 API 提供六类通用水域环境：开阔湖面、曲折河道、港池码头、岛礁水域、跨河桥区、城市滨水。顶部切换“环境库”即可添加多个载具、编辑位置和朝向、检查碰撞并导入导出 JSON。环境接口与完整使用说明见 [环境库文档](docs/environments.md)，独立组合示例见 `examples/environment.ts`。

新增独立的 **E-07 深水港示范**，可从环境列表选择：三维岸桥群、远洋集装箱船、堆场、远山与 CC0 摄影全景天空融合，支持港区航拍、贴水、空中作业、设备与港口四个镜头，以及专注视图。原有十二款设备构造代码保持不变。查看 [参考与授权记录](docs/marine-references.md)、[深水港组件说明](docs/marine.md) 和 `examples/marine.ts`。

六款无人机均为**四个旋翼、每个旋翼两片桨叶**。六款无人艇均为**单体船，左右船舷汇到中轴线上的唯一尖船首**。

## 启动

已在 Node.js 24 环境验证。首次安装依赖后，运行不需要外部模型、字体、贴图或 CDN 请求。

```sh
npm ci
npm run dev
```

访问终端显示的本地地址，默认 `http://127.0.0.1:5173/`。

```sh
npm test          # 无需浏览器的模型、拓扑及独立复用测试
npm run build    # TypeScript 检查与生产构建
npm run preview  # 查看 dist 中的生产构建
```

浏览器验收需先运行开发服务器，再执行 `npm run test:browser`；原六场景执行 `npm run test:environments`；深水港执行 `npm run test:marine`；群岛执行 `npm run test:ninepin`。脚本使用本机 Microsoft Edge 无头模式，群岛输出在 `artifacts/ninepin/`。Vite 的 500 kB 分块提示来自本地打包的 Three.js；主入口 JS gzip 约 160 kB，含群岛地形的环境编辑器按需加载 gzip 约 153 kB。实景环境另按需读取已随项目打包的 4.43 MB 本地 HDR 文件，无需运行时联网。

## 十二款预设

所有数字均为**演示建模设定**，单位为米，不代表真实产品规格。长度沿 Z、宽度沿 X、高度沿 Y。工作台显示包括桨叶、天线和推进器在内的整体包围尺寸；尺寸在当前静止桨叶姿态下计算。

| 编号 | 构造函数 / variant | 名称 | 主体尺寸与结构 |
| --- | --- | --- | --- |
| Q-01 | `createQuadrotor / inspection` | 轻型巡检 | 中心机身长 0.30 × 宽 0.20 × 高 0.105；左右电机中心距 0.53，前后距 0.49；桨半径 0.175；短起落架与前置云台 |
| Q-02 | `createQuadrotor / survey` | 专业测绘 | 中心机身长 0.35 × 宽 0.27 × 高 0.12；左右中心距 0.80，前后距 0.72；桨半径 0.24；高起落架、测绘相机、扫描器及定位天线 |
| Q-03 | `createQuadrotor / heavy` | 重载作业 | 中心机身长 0.44 × 宽 0.36 × 高 0.16；左右中心距 1.10，前后距 0.96；桨半径 0.32；加粗机臂、双电池舱、载荷平台 |
| Q-04 | `createQuadrotor / protected` | 近距巡检 | 中心机身长 0.24 × 宽 0.19 × 高 0.10；左右中心距 0.48，前后距 0.46；桨半径 0.15；四个独立护圈、护圈支撑及前置云台 |
| Q-05 | `createQuadrotor / rescue` | 应急照明 | 中心机身长 0.36 × 宽 0.28 × 高 0.13；左右中心距 0.78，前后距 0.70；桨半径 0.23；双探照灯、定向扬声器与高起落架 |
| Q-06 | `createQuadrotor / cargo` | 物资运输 | 中心机身长 0.46 × 宽 0.38 × 高 0.17；左右中心距 1.18，前后距 1.06；桨半径 0.33；封闭货舱、绑带锁扣及双电池 |
| S-01 | `createUSV / inspection` | 轻型巡检 | 船体长 1.80 × 设计宽 0.64；船底低于水线 0.22；巡检相机、封闭设备舱、单推进器 |
| S-02 | `createUSV / survey` | 水文测量 | 船体长 2.40 × 设计宽 0.92；船底低于水线 0.29；探测支架、探头、测量箱、定位桅杆、双推进器 |
| S-03 | `createUSV / utility` | 综合作业 | 船体长 3.20 × 设计宽 1.08；船底低于水线 0.34；抬高前甲板、作业平台、围栏、防撞条、双推进器 |
| S-04 | `createUSV / rescue` | 水上救援 | 船体长 2.20 × 设计宽 0.88；船底低于水线 0.26；双救生圈、船尾滚轮回收滑道、警示灯、双推进器 |
| S-05 | `createUSV / sampling` | 环境采样 | 船体长 2.80 × 设计宽 1.02；船底低于水线 0.31；六瓶采样盘、吊架、外置采样探头、双推进器 |
| S-06 | `createUSV / endurance` | 长航时观测 | 船体长 3.60 × 设计宽 1.12；船底低于水线 0.33；双太阳能板、气象观测桅杆、双推进器 |

## 在自己的 Three.js 项目里复用

将整个 `src/models/` 目录复制到目标 TypeScript 项目，安装兼容的 `three` 与 `@types/three`，从 `models/index.ts` 导入。该目录只依赖 Three.js（含其官方 addons），不依赖工作台、Vite、DOM、Canvas 或渲染循环。完整版本以本仓库 `package-lock.json` 为准。

```ts
import { Scene } from 'three';
import { createQuadrotor, createUSV } from './models';

const scene = new Scene();
const drone = createQuadrotor({
  variant: 'survey',
  scale: 1,
  colors: { primary: '#e2e9ed', secondary: '#293b46', accent: '#267ca0' },
});
const boat = createUSV({ variant: 'inspection' });
drone.root.position.set(-1.5, 1.1, 0);
boat.root.position.set(1, 0, 0);
scene.add(drone.root, boat.root);

// 在使用方自己的渲染循环中调用：时间为秒，转速为弧度/秒。
function update(dt: number) {
  drone.update(dt, { rotorSpeed: 20 });
  boat.update(dt, { rotorSpeed: 5 });
}

// 访问具名部件；与 root.getObjectByName('gimbal') 是同一对象。
drone.parts.gimbal.rotation.y = Math.PI / 8;

// 不再使用时释放；不会影响另一个构造实例。
function dispose() {
  drone.dispose();
  boat.dispose();
}
```

可直接运行的无页面双模型示例在 `examples/independent.ts`，已纳入测试。展示时由使用方提供相机、光照及环境反射；工作台使用内置 RoomEnvironment，未下载 HDR 文件。

### 参数和返回值

```ts
createQuadrotor({ variant?: 'inspection' | 'survey' | 'heavy' | 'protected' | 'rescue' | 'cargo', scale?: number, colors?: ModelColors })
createUSV({ variant?: 'inspection' | 'survey' | 'utility' | 'rescue' | 'sampling' | 'endurance', scale?: number, colors?: ModelColors })

interface ModelColors {
  primary?: THREE.ColorRepresentation;
  secondary?: THREE.ColorRepresentation;
  accent?: THREE.ColorRepresentation;
}

// 两个函数均返回：
{ root: THREE.Group, parts: Record<string, THREE.Object3D>, update, dispose }
```

- 默认款式为 `inspection`，默认缩放为 `1`；省略颜色时使用该款式默认配色。缩放必须是有限正数，未知款式会抛出 `RangeError`。
- Y 向上，+Z 为机头或船首方向。无人机原点在中心机身，无人艇原点在设计水线的船体纵向中点。
- `root` 可平移、旋转、缩放。颜色在创建时设置，页面改色通过替换实例并释放旧实例完成。
- `update(deltaSeconds, { rotorSpeed })` 不包含物理仿真；默认转速为 0，负转速反转。时间必须非负且有限，转速必须有限。相邻无人机旋翼反向旋转。
- `dispose()` 可重复调用，会将根节点从父节点移除，并对实例内共享的几何体、材质、纹理各释放一次。释放后 `update()` 不再执行。
- 构造函数之间不共享可释放资源。不要用 `root.clone()` 假定会得到独立资源的副本；需要独立生命周期时再次调用构造函数。

### 稳定部件名称

| 模型 | 部件名称 |
| --- | --- |
| 全部无人机 | `body`、`landing-gear`；四个方向 `front-left`、`front-right`、`rear-left`、`rear-right` 分别带 `arm-`、`motor-`、`rotor-` 前缀 |
| 轻型巡检 / 近距巡检 / 测绘 / 应急照明无人机 | `gimbal`、`camera` |
| 测绘无人机 | `scanner`、`gnss-antenna` |
| 重载 / 运输无人机 | `batteries`、`payload-platform`、`gnss-antenna` |
| 近距巡检无人机 | `guard-front-left`、`guard-front-right`、`guard-rear-left`、`guard-rear-right` |
| 应急照明无人机 | `searchlights`、`speaker`、`gnss-antenna` |
| 运输无人机 | `cargo-pod` |
| 全部无人艇 | `hull`、`gunwale-left`、`gunwale-right`、`equipment-cabin`、`service-hatch`、`sensor-mast`、`gnss-antenna`、`camera` |
| 巡检无人艇 | `thruster-center`、`propeller-center` |
| 除轻型巡检外的无人艇 | `thruster-left`、`thruster-right`、`propeller-left`、`propeller-right` |
| 测量无人艇 | `water-probe` |
| 作业无人艇 | `work-platform`、`railing` |
| 救援无人艇 | `lifebuoys`、`recovery-ramp`、`rescue-beacon` |
| 采样无人艇 | `sample-carousel`、`sample-bottle-1` 至 `sample-bottle-6`、`sampling-davit`、`sampling-probe` |
| 长航时无人艇 | `solar-panels`、`solar-panel-left`、`solar-panel-right`、`weather-station` |

`left/right` 在模型局部坐标中分别对应 −X / +X，`front/rear` 分别对应 +Z / −Z。按名称访问部件时，先确认对应款式包含该部件。

## 工作台操作

- 左键拖动旋转，滚轮缩放，右键拖动平移；触屏单指旋转、双指缩放和平移。
- 下方按钮切换透视、前视、侧视、俯视和底视。俯视中 +Z 朝上，底视隐藏地面以检查船底。
- 右侧改变主色、辅色、标识色及整体比例；每款的颜色和比例在当前页面会话中独立保留，刷新恢复默认。
- 线框、坐标轴、动画初始关闭。开启动画后可调整转速；缩放与切换模型会自动重新取景。
- 视口获得键盘焦点后，方向键旋转，`+` / `-` 缩放，`Home` 复位；所有控件均可通过键盘聚焦。
- 相机图标保存不含界面的当前模型 PNG；展开图标进入全屏；窄屏模型库和设置面板支持折叠。
- 不支持 WebGL 2 或图形上下文中断时显示中文提示。

## 构造与验收说明

船体由 48 个纵向截面和唯一船首顶点生成，包含甲板、舷侧、底部及封闭船尾。逻辑网格经过闭合边、相反边方向、正体积、无退化面及唯一船首顶点检查；显示网格再按折角生成法线，使甲板与船舷交界清晰。完整船壳按材质合并为三个绘制批次。

材质包括涂装金属、金属紧固件、橡胶、镜头和程序生成的碳纤维纹理。当前适合近距离展示单个或少量模型；没有 LOD、流体动力学、飞行动力学或大规模编队优化。

验收截图涵盖十二款透视与俯视、六款船体底视与侧视、桌面和 390 px 窄屏。浏览器验收还覆盖改色恢复、缩放、线框、动画、鼠标交互、截图下载及重复切换时 GPU 资源计数。详情见 `artifacts/acceptance.json`。新增探照灯、扬声器、采样装置和太阳能板表现其外观结构，不模拟照明投射、声音、采样或发电过程。
