# Hornsea 2 海上风电巡检区

环境库新增 `hornsea`，与深水港、青州和九洲场景并列。这里使用具体地点的公开机位数据，不随机生成风机阵列。该版本是**局部实景校核模型**，尚不能称为完整实地精确复刻。

## 数据与精度

- 位置：北海 Hornsea 2 风电场的 G33 及其最近 11 台机组。OSM relation 11343101 的快照中有 164 个发电机节点，运营方公布全场有 165 台；本版本只展示明确有坐标的 12 台，没有补造缺失机位。
- 工程尺寸：官方公布叶轮直径 167 m、叶片长 81 m。约 200 m 总高对应本版推算轮毂高 116.5 m，待竣工资料核实。单桩、机舱及检修附属设施为照片指导的近似建模。
- 原点：G33，WGS84 纬度 53.902265°、经度 1.5653799°。+X 向东、−Z 向北、Y 向上；本地等距近似投影，非测量控制坐标。
- 编辑范围：8,000 × 7,000 m，固定展示水位 Y=0，飞行检查范围 0–250 m。范围为编辑裁剪框，并非风场法定边界。
- 机组朝向、静止叶片相位、光照和海况是展示设定。未模拟发电、叶轮动力学、潮汐或真实海床，不包含实时通航限制。

机位衍生数据库 `public/assets/hornsea/turbines.json` 与原始 `site.osm` 按 ODbL 1.0 提供，界面保留 OpenStreetMap 署名。执行 `python scripts/extract-hornsea.py` 可从本地快照重建坐标表，不需要联网。机位选择与随机种子无关；种子不会改变实际机位。

## 参考与场景分层

[Ørsted 项目页面](https://orsted.co.uk/energy-solutions/offshore-wind/our-wind-farms/hornsea2) 提供机舱俯视、风机与运维船水面视角、施工海况及位置图。[首次安装公告](https://orsted.co.uk/media/newsroom/news/2021/05/first-turbine-installed-at-hornsea-two-offshore-wind-farm) 提供叶轮和整机的大尺度。

机舱俯视图用于观察圆形轮毂、红色检修栏杆与顶部黄色作业区；水面照片用于核对黄色过渡段、塔筒渐缩及登乘平台的相对位置。照片不提供标定焦距，不能据此声称小构件尺寸已实测。摄影权利归 Ørsted / 相应摄影者，未核实商业纹理授权，因此仅作研究参考，不随应用作为贴图发布。

近景、中景的所有风机均有三维深度，实例化塔筒、闭合扭转翼型叶片、单桩、机舱、检修平台、梯子和护栏；远方风机仍按真实机位绘制，不使用相机朝向的图片平面。天空使用现有 Poly Haven CC0 全景，属于通用光照条件，不宣称是现场天空摄影。远海通过大尺寸水面、方向一致的 HDR 环境与距离雾过渡。

水面使用原有反射组件，并针对本场景提高风浪法线强度、加入长波频段和粗糙反射近似。所有波动只影响着色，不改变 Y=0 或载具姿态。其他场景沿用原始水面参数。波纹开关只暂停水面；风机本版保持静止。

## 碰撞与复用

单桩、登乘梯、检修平台、塔筒、机舱与叶轮扫掠区分别记录高度。船可以位于高空叶轮下方的水域；相同 XZ 的无人机升到叶轮高度后会提示重叠。叶轮使用完整扫掠保守长方体，而不是当前三片叶片的薄网格。此检查会有保守误报，不是精确碰撞或航行安全评估。

```ts
import { createEnvironment } from './src/environments';
import { createQuadrotor, createUSV } from './src/models';

const environment = createEnvironment({ variant: 'hornsea', seed: 5103 });
const drone = createQuadrotor({ variant: 'inspection' });
const boat = createUSV({ variant: 'inspection' });
drone.root.position.set(50, 10, 240);
boat.root.position.set(50, 0, 240);
scene.add(environment.root, drone.root, boat.root);
// 由宿主应用更新 environment.update(dt)，并应用 presentation 推荐的背景/镜头。
// HDR 与太阳反射接入方式沿用 docs/marine.md。
// 退出时各自 dispose()，宿主移除载具 root。
```

四个预设镜头为风场全景、单桩水面巡检、真实机位鸟瞰、设备与风场。修复了原有电影镜头不能仰视的问题：环境镜头允许朝上观察，仍限制相机不进入水下。固定场景鸟瞰不再额外减去无人机默认的 10 m 高度。

## 验收

`npm test` 包括 12 机位与原始 XML 对照、米制投影、36 片叶片、法线方向、高低空碰撞区别、安全出生点、确定性和独立释放。既有 12 款载具测试保留。

`npm run test:hornsea` 检查四个可见环境入口与来源链接、草稿恢复、四镜头、旋转、俯视、水面暂停、JSON 往返、连续切换及 390 px 窄屏。截图与性能记录位于 `artifacts/hornsea/`。详细性能以 `acceptance.json` 为准；测试使用本机 Edge 无头模式和 Intel Arc 140V，不代表所有设备表现。

2026-10-21 最终测试：18 项测试通过，TypeScript 与生产构建通过；浏览器无控制台错误。1600 × 885 渲染画布、12 个载具、DPR 1 的短时采样中，静止镜头平均 16.67 ms / 60.00 FPS，连续环绕平均 16.67 ms / 60.00 FPS，环绕 P95 为 16.8 ms。这里统计的是 requestAnimationFrame 帧间隔，不是独立 GPU 计时；载具使用现有小于 2 px 的视口裁剪规则。三轮切换回本场景后均为 114 个几何资源、7 个纹理资源（该内存检查使用 3 个载具）。贴水预设实测相机 Y=4 m。
