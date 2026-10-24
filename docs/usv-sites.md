# 无人艇集群实景水域

2026-10-24 新增 `westlake`、`kallang`、`waalhaven` 三个环境。环境列表共 8 项，保留原有深水港、青州、九洲、Hornsea 2 和果洲群岛。三个新增环境依据 OpenStreetMap 的实际水域和设施轮廓构建，属于**实景岸线版**：没有高程模型，岸面与部分建筑高度为显示近似。

| 场景 | 范围（米） | 适合研究的运动任务 | 参考航线 |
| --- | --- | --- | --- |
| 杭州西湖 · 三岛水域 `westlake` | 2400 × 2500 | 岛屿分流、绕岛巡测、开阔水面队形变化 | 东侧巡测、西侧绕岛，共 2 条 |
| 新加坡 · 加冷盆地 `kallang` | 2200 × 2200 | 城市河湾分区覆盖、支流汇合、桥前队形调整 | 西侧与东侧覆盖、桥北支流汇合，共 3 条 |
| 鹿特丹 · 瓦尔港 `waalhaven` | 2800 × 3000 | 主港池纵向编队、支港分流、沿岸巡检 | 主港池、东侧支港、南侧岸线，共 3 条 |

## 使用

运行 `npm run dev`，点击顶部“环境库”，选择 R-05 / R-06 / R-07。每个场景初始放置 12 艘 S-02 水文测量无人艇，4 列 × 3 行，间隔 14 m，按三组标识色区分，保持真实尺寸。默认关闭标签，避免全景中标签堆叠。

- “12 艇编队”镜头查看整组近景；“贴水”“鸟瞰”“全景”观察环境。
- 载具可沿用现有位置编辑、碰撞提示、配色、草稿恢复与 JSON 导入导出。
- 右侧“集群场景”可下载初始编队 JSON，以及包含水域、障碍、出生点和参考航线的导航数据。
- 每处另有 12 个空中出生点，继续兼容已有 6 款无人机和 6 款无人艇。

`fleet-scene.json` 可直接通过工作台“导入 JSON”载入；`navigation.json` 是给算法使用的空间数据，不能当作工作台场景配置导入。水面和桨叶开关只控制视觉动画，载具不会自动沿参考航线运动。

## 数据与真实程度

| 内容 | 实现及精度边界 |
| --- | --- |
| 水域与岛岸 | OSM `natural=water`、`waterway=riverbank` 的闭合面和完整多边形关系；合并后裁剪，保留岛屿孔洞，简化容差 0.2 m。该容差不是测量精度。 |
| 岸上设施 | 实际 OSM 建筑、道路、绿地、码头和桥位轮廓，保留对象类型与 ID。道路无宽度标签时采用显示宽度。 |
| 高程 | 不含 DEM。西湖、加冷、瓦尔港的岸面分别显示为 2.2、2.5、3.2 m。建筑有 `height` 则使用该标签；否则按层数 × 3.2 m 或默认显示高度估计。各轮廓的 `heightBasis` 记录来源类型。 |
| 桥与码头 | 只使用已标绘平面范围。未核实桥墩位置和桥下净空，因此整个桥位为水面保守障碍；桥面显示高度不被当作已验证净空。 |
| 外观 | 程序化树木、门窗、表面颜色、水波和通用 CC0 天空。树木限制在已标绘绿地内，并避开建筑及道路，但不代表实测树位。 |
| 覆盖范围 | 矩形局部裁剪，外部城市、山体和湖岸未补造；全景可见裁剪边缘。 |

建筑高程来源统计以**裁剪后轮廓数**计，不等同于独立建筑数量：西湖 340 个轮廓中 1 个具有 OSM `height`；加冷 1443 个中 80 个；瓦尔港 2176 个中 1 个。层数估计与默认高度的详细数量见各场景的 `sources.json`。

地理坐标为 WGS84，经各自 UTM 投影后减去原点：+X 网格东、−Z 网格北、Y 向上，单位米。西湖 EPSG:32651、加冷 EPSG:32648、瓦尔港 EPSG:32631。精确原点经纬度与投影坐标保存在 `layout.json`、`navigation.json` 和 `sources.json`。水面固定 Y=0，不代表真实海拔或潮位。

来源背景：[UNESCO 西湖文化景观](https://whc.unesco.org/en/list/1334/)、[新加坡 PUB 滨海蓄水池](https://www.pub.gov.sg/Public/Places-of-Interest/Marina-Barrage)、[鹿特丹港务局 Waalhaven](https://www.portofrotterdam.com/nl/vestigen/waalhaven)。网页仅用于核对地理背景，没有将网页摄影作为纹理打包。

## 接入运动规划

```ts
import { createEnvironment, checkPlacement, surfaceObstacles } from './src/environments';
import { usvSiteConfigs } from './src/environments/usv-sites/config';

const environment = createEnvironment({ variant: 'waalhaven' });
scene.add(environment.root);
const water = environment.spatial.water;
const barriers = surfaceObstacles(environment.spatial);
const routes = usvSiteConfigs.waalhaven.routes; // 点为 [x, z]，米
// 也可读取本地 /assets/waalhaven/navigation.json，无需引入 Three.js。
// 将控制器输出的位置和朝向写入艇模型；checkPlacement 可检查当前位姿。
// 每帧调用 environment.update(dt) 只推进水面视觉时间。
```

12 艇出生点均有半径 5 m 的静态留空范围，彼此不重叠。8 条折线的完整缓冲走廊均处于水域内并避开水面障碍：西湖与加冷盆地路线留空半径 12 m，桥北支流路线为 8 m，瓦尔港为 15 m。

这些路线是依据当前几何设计的参考路径，**不是现场航迹或已经求解的多艇轨迹**。`corridorRadius` 是中心线的静态留空半径；初始编队宽 42 m，不保证整队保持刚性队形通过各条路线，狭窄段需要分组或变队。各路线没有分配时序、速度和优先权，实际控制仍须处理艇间避碰、转弯半径及水动力学。

不含水深、流场、船流、实时潮汐或临时障碍。此处“适合”指可进行几何运动规划实验，并不表示该地点允许实艇试验。

## 本地数据与重建

每处 `public/assets/<variant>/` 包含：

- `site.osm`：保留使用对象及完整依赖的 OSM 快照。
- `download-urls.txt`：原始 API 分块及完整水域关系的请求地址。
- `layout.json`：投影、裁剪后的衍生地理数据库。
- `navigation.json`：水域、保守水面障碍、12 艇出生点、参考路线。
- `fleet-scene.json`：可导入的 12 艇工作台配置。
- `map.svg`：按真实水域轮廓生成的缩略图。
- `sources.json`：来源、ODbL 许可、快照 SHA-256、修改方式和精度说明。

© OpenStreetMap contributors；快照和衍生地理数据库按 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) 提供。应用运行无外部地图或素材请求。

离线重建需要 Python 的 `shapely >= 2`、`pyproj`，和项目 Node.js 依赖：

```sh
npm run data:usv-sites
python scripts/validate-usv-data.py
npm test
npm run build
# 已启动 npm run dev 后：
npm run test:usv-sites
```

`scripts/fetch-usv-sites.py <variant>` 仅在明确需要刷新快照时联网，另需 `requests`；会覆盖该场景原始快照，之后须重建和重新检查航线。

验证覆盖：来源对象追溯、陆水分区无重叠/遗漏、完整路线走廊、出生点和艇间距离、所有载具的默认包围体、实例独立释放、八个入口、三场景四镜头、导入导出、水面暂停、反复切换资源数量、390 px 窄屏。结果和截图在 `artifacts/usv-sites/`。本机 Edge 无头模式、1600 × 1000 页面、12 艇近景全部可见的短时采样约 58–60 FPS；这是浏览器帧间隔观测，不是跨设备性能保证。
