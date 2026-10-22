# 深水港混合环境组件

本轮只升级一个独立示范 `deepwater`。六个基础场景及模型工作台继续保留。项目为 Three.js r180、Vite 8、TypeScript，采用米制、Y 向上、载具 +Z 前向；未修改 `src/models/` 的设备几何、比例和材质。

## 使用入口

启动 `npm run dev`，进入顶部“环境库”，默认显示深水港。底部有四种镜头：

- 港区航拍：港口整体、巨轮、远山与大水域；默认 FOV 44°。
- 贴水视角：约 3.4 m 机位，选择第一艘无人艇附近取景。
- 空中作业：距第一架无人机约 4 m，以工业设施为尺度背景。
- 设备与港口：无人艇近景和岸桥背景；设备保持原尺寸。

“专注视图”收起编辑面板、标签及操作轴，保留镜头和截图入口；“恢复编辑”返回多载具操作。原有位置、朝向、改色、图层、JSON 与六环境草稿继续工作。JSON 的可选 `view.fov` 保存镜头焦距差异，旧 V1 配置不含该字段仍可导入。

## 分层与边界

| 层 | 实现 | 边界 |
| --- | --- | --- |
| 近景 | 原设备模型、真实 3D 浮台和航标、实时反射水面 | 水位固定 Y=0；不模拟船体俯仰或浮力 |
| 中景 | 2160 m 岸线、14 台岸桥、366 m / 302 m 货轮、箱区及仓库 | 2.4 × 1.8 km 编辑范围；空间障碍为保守棱柱 |
| 远景 | 三层分形地形，真实 3D 深度；精度随观看距离自然降低 | 远山位于编辑范围外，为视觉背景，不提供范围外仿真导航数据 |
| 天空与氛围 | 360×180° 摄影 HDRI、PMREM、方向光、ACES、距离雾 | 无限远天空没有平移视差；海岸和设施不使用照片卡片 |

没有把普通照片伪装成自由漫游场景。当前可环绕、缩放和平移；相机不进入水下，最大轨道距离 6 km。港区是参考工程布局的原创演示，不是洋山港测绘数据。尺寸和场景范围不应被用作真实港区通航依据。

## 模块与接口

```
src/environments/marine/
  config.ts       独立资源、摄影机与大气配置
  definition.ts   港区布局和空间障碍定义
  geometry.ts     实例化结构、货轮船壳和远山
  harbor.ts       完整环境构造与资源释放
  water.ts        反射水面、多尺度法线和位移尾流
  background.ts   本地 HDR 加载、PMREM、太阳方向和取消应用
```

```ts
import { createEnvironment } from './src/environments';

const environment = createEnvironment({ variant: 'deepwater', seed: 4101 });
scene.add(environment.root);
// Consumer applies presentation metadata to its camera, scene and lighting.
environment.setVessels?.([
  { id: 'boat-1', position: [0, 0, 0], yaw: 0, length: 1.8 },
]);
environment.update(deltaSeconds); // skip to pause
environment.dispose();
```

完整的“环境 + 无人机 + 无人艇 + HDR 光照”接入见 `examples/marine.ts`。环境构造和空间数据仍然可以在无 DOM 环境测试；HDR 查看器组件接收调用方的 WebGLRenderer 和 Scene。

`createMarineBackground(renderer, scene, onReady, onError, settings?)` 返回 `ready` 和 `dispose()`。`onReady(sun, horizon, sky)` 提供太阳方向、雾色和天空纹理，可分别传给环境的 `setSun`、`setHorizon`、`setSky`。资源加载完成前切换场景时，旧结果不会覆盖新场景；已加载的 HDR 与 PMREM 目标独立释放。天空上半球最亮点用于对齐太阳，远海按观看方位采样 HDR 地平线以衔接天空。该亮点法针对本项目已选天空，不是通用气象反演。

## 水面与性能取舍

评估了 r180 的官方 `Water` 与 `Reflector`。使用官方 Reflector 的裁剪反射通道，自定义水面 Fresnel、有限粗糙度、多方向波纹和像素导数过滤；可以明确释放反射渲染目标。法线波纹不改变碰撞水位。

反射目标固定 768×768，采用线性 HDR 中间目标；水面不增加密集顶点。天空只有一份 2K HDR，按需加载到环境库。港口重复构件按材质分组为 InstancedMesh；静态阴影在加载、摆放改变或桨叶动画时更新，避免重复绘制全部静态港区阴影。设备材质由同一环境照明，不重新制作设备。

尾流响应传入无人艇位置的变化，静止时衰减，瞬间超过 10 m 的位置跳转不生成长尾迹。最多对前 16 艘船生成视觉尾流；这是编辑 / 展示反馈，不是物理推进、船速求解或历史航迹。水面开关同时暂停波纹和尾流时间。

相机和场景静止时缓存平面倒影，波纹继续扰动采样坐标；相机、设备姿态、天空或可见性变化时刷新。独立接入者若自行动画其他场景对象，应调用 `environment.invalidateReflection?.()`。深水港全景中投影直径不足 2 像素的载具暂不绘制，接近后恢复完整模型；编辑中选中的载具始终显示。此优化不修改尺寸、材质、空间检查或配置数据，标签仍可指示位置。

2026-10-21 本机 Edge 155、Intel Arc 140V、1600×885 实际画布、DPR 1 的测量：2 载具静止全景约 60.0 FPS；12 载具静止全景约 60.0 FPS，连续移动镜头约 58.5 FPS，近景约 59.5 FPS。移动镜头 P95 帧间隔 17.3 ms。该测量使用水面动画、未开启设备旋翼动画；不代表其他硬件或全部操作的性能。静止全景 379 次绘制，移动镜头含倒影通道 757 次；缓存帧不执行倒影通道。三轮环境切换后几何 / 纹理计数均为 317 / 7，未持续增长。原始报告见 `artifacts/marine/acceptance.json`。

## 本地资源与来源

`public/assets/environment/kloppenheim_06_puresky_2k.hdr` 是 Poly Haven 的 CC0 摄影天空，原始摄影 Greg Zaal、天空编辑 Jarod Guest。许可、下载地址、字节数和 SHA-256 见同目录 `sources.json`。所有工程图片只作研究参考，未打包；六类候选场景的多视角来源、拟定机位及技术划分见 `marine-references.md`。

## 验证

```sh
npm test
npm run build
npm run test:marine         # 开发服务器运行时
npm run test:environments   # 原六场景回归
npm run test:browser        # 原模型工作台回归
```

深水港验收输出位于 `artifacts/marine/`：四种镜头、四个环绕方向、工作台和移动端截图，及 `acceptance.json`。性能记录包含实际 WebGL GPU 标识、画布分辨率、平均 / P95 帧间隔、2 / 12 载具，以及包含反射通道的绘制统计。它是该次本机测量，不是所有设备的帧率承诺。

当前版本是已接入实时渲染的工程示范。近距离设施仍采用简化构造；未实现海洋谱几何波、体积云、真实港区地图或离线路径追踪。不能把这些尚未实现的效果宣称为摄影级或电影成片质量。
