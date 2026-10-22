# 果洲群岛研究与数据快照

正式来源和许可记录见 `../../public/assets/ninepin/sources.json`，实现及精度见 `../../docs/ninepin.md`。

- `site.osm`：2026-10-21 OSM API 边界框 114.34,22.23,114.39,22.29 的快照，23 条闭合岸线。© OpenStreetMap contributors，ODbL 1.0。
- `Whole_HK_DTM_5m.zip`：香港地政总署原始 5 m DTM，版权与 DATA.GOV.HK 使用条款保留。`dtm-crop.npz` 为局部裁剪，供离线重建。公开副本与来源说明在 public/assets/ninepin/。
- `aerial-reference.jpg`、`cliff-reference.jpg`：香港旅游发展局页面的岛群和岩拱参考照片。前者页面署名 Kelvin Yuen，其他摄影署名未明确。仅研究参考，未取得商业贴图授权，不复制到 public 或 dist，不作为场景纹理。
- `N22E114.hgt.gz`：早期评估的 SRTM 高程。分辨率不足以表达小岛，最终场景未使用。

参考图页面：https://www.discoverhongkong.com/eng/place-to-go/travel.guide-ninepin-group.html 。官方地质背景：https://www.geopark.gov.hk/about_us/geopark/ 。没有现场码头、建筑或设施资料支持的对象不加入本场景。

构图依据：高视角以南北两座主岛和东侧小岛组织岛间水道；低机位保留岩岸、海面与天空三层；设备近景保持 1:1 比例，靠相机距离突出主体。只有天空使用全景图，所有可接近岛体均为三维。
