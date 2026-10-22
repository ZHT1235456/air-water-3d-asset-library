# 香港果洲群岛

`ninepin` 是第五个可见环境，保留深水港、青州、九洲和 Hornsea 2。使用具体地点的公开岸线与历史地形数据，支持全景、岛间水道、鸟瞰和设备近景。现有十二款载具构造代码保持不变。

## 数据范围与精度

- 23 条闭合 OpenStreetMap 岸线，包括南果洲、北果洲、东侧小岛及周边岩礁。岛屿位置、岸线折点和稳定 way ID 来自本地保存的 OSM 快照，随机种子不改变地理布局。
- 高程来自香港地政总署 5 m DTM，使用 10 m 网格裁剪至原始岸线，双线性采样；顶面共 8,068 个顶点、13,479 个三角面，全部采样有源数据覆盖。几何封闭且法线朝外。
- 原点 WGS84 22.2635° N、114.3565° E，经 EPSG:2326 转至香港 1980 方格。+X 为网格东、−Z 为网格北、Y 向上，单位米。编辑范围 5,000 × 4,000 m，飞行检查高度 0–250 m。
- 地形源高程采用香港主水平基准；展示海面固定 Y=0，并非实时潮位。岸线低于 0.6 m 的采样点抬至 0.6 m，底部在 −8 m 封闭；该封底不是海床数据。
- [源数据规范](https://www.landsd.gov.hk/en/spatial-data/open-data/kf_dtm.html) 标称高程精度 ±5 m、90% 置信水平，采用 2014–2015 年航片，可能含植被等非地面高程。10 m 渲染网格不代表 10 m 测量精度。

这是实景地形校核版。海蚀洞、岩拱、悬挑和精细岩柱无法从高度场准确还原，未将它们伪造为可通行空间。极小岩礁可能只有粗略高度。灌丛、岩壁纹理、岸边泡沫是视觉装饰，未宣称为现场测绘结果。

## 参考与授权

[香港旅游发展局果洲群岛页面](https://www.discoverhongkong.com/eng/place-to-go/travel.guide-ninepin-group.html) 的岛群高视角和岩拱水面照片用于核对构图、低灌丛和岩石颜色；照片没有相机标定数据，不据此推断精确尺寸。摄影版权保留，未核实商业贴图授权，应用不加载或发布这些照片作为纹理。

岸线 © OpenStreetMap contributors，按 ODbL 1.0 提供；高程 © 香港特别行政区政府地政总署，经 DATA.GOV.HK 提供，依其条款保留来源、知识产权与修改说明。完整授权记录、原始岸线、地形裁剪和衍生数据库位于 `public/assets/ninepin/`。天空沿用 Poly Haven CC0 全景，是通用天气背景，不是香港现场天空摄影。

近景、中景及远处岛屿均为真实三维地形，环绕时具有正确视差；只有无限远天空使用全景贴图。水面反射、远海雾化与天空沿用共享海洋组件。修正了共享波纹噪声的正弦散列不连续问题，改用整数网格散列，低机位不再出现大块三角形断层。

## 接口与空间检查

```ts
import { createEnvironment } from './src/environments';
import { createQuadrotor, createUSV } from './src/models';

const environment = createEnvironment({ variant: 'ninepin', seed: 5104 });
const drone = createQuadrotor({ variant: 'inspection' });
const boat = createUSV({ variant: 'inspection' });
drone.root.position.set(-200, 10, 240);
boat.root.position.set(-200, 0, 240);
scene.add(environment.root, drone.root, boat.root);
// 在宿主渲染循环调用 environment.update(dt)，暂停时不调用。
// 应用 presentation 中的相机、背景和光照建议；HDR 接入见 docs/marine.md。
// 退出时分别调用 environment.dispose()、drone.dispose()、boat.dispose()。
```

每个岛屿轮廓都是水域孔洞，并生成同源的静态障碍。障碍为整岛轮廓乘以最高点高度的保守柱体，因此低空贴坡可能提示保守重叠；不是精确网格碰撞。默认 12 个船位与 12 个空中出生点位于岛间水域，设备维持真实尺寸。种子仅影响装饰灌丛，不移动地形。

水波与岸边泡沫独立于空间数据，水面动画开关同时暂停二者。多实例独立更新和释放。已有多载具编辑、草稿恢复、位置检查及版本化 JSON 导入导出直接适用。

## 构建与验证

`python scripts/extract-ninepin.py` 从保留的岸线及高程裁剪重建地形；仅离线构建需要 numpy、pyproj、shapely >= 2.1，应用运行只依赖 Three.js。没有外部地图或网络请求。

`npm test` 检查岸线数量与原始 XML、地形闭合与法线、岛洞碰撞、高空通行、出生点、确定性及独立释放；保留原十二款模型测试。`npm run test:ninepin` 检查五个入口、草稿、四镜头、绕岛、水面暂停、配置往返、错误导入保护、连续切换和窄屏。截图及实际采样在 `artifacts/ninepin/`。

本机 Edge 无头模式、Intel Arc 140V、1600 × 885 画布、DPR 1，场景持有 12 个载具时，静止和连续环绕的短时采样均约 60 FPS、P95 约 16.8 ms。统计为 requestAnimationFrame 帧间隔，并非独立 GPU 时间；全景使用已有小于 2 px 的载具裁剪，不能解读为十二个精细载具同时占满画面的性能。三轮切换后 GPU 资源计数均为 131 个几何体、7 个纹理（此项使用 3 个载具），未观察到持续增长。
