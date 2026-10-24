# 第三方素材与数据说明

公开仓库不赋予所有文件统一的第三方许可。源数据原有版权、许可、署名及再分发条件继续适用。各项使用情况和下载来源记录在 `public/assets/*/sources.json`。

| 内容 | 来源与权利人 | 许可 / 条件 |
| --- | --- | --- |
| Kloppenheim 06 Pure Sky HDR | Greg Zaal、Jarod Guest / Poly Haven | [CC0 1.0](https://polyhaven.com/license)；本地打包，作为通用天空和环境光 |
| 岸线、桥梁位置、风机机位及相关数据库 | © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) | ODbL 1.0，保留署名与适用的数据库共享条件；原始快照与衍生数据库均有记录 |
| 果洲群岛地形裁剪及高程衍生数据 | © 香港特别行政区政府地政总署，经 DATA.GOV.HK 提供 | [DATA.GOV.HK 条款](https://data.gov.hk/en/terms-and-conditions)；保留来源、知识产权及修改说明，不代表政府认可或背书 |
| Three.js 及构建依赖 | 各依赖作者 | 见各依赖包许可及 `package-lock.json`；本仓库不提交 node_modules |

果洲地形经过裁剪、重采样和岸线接缝处理，不是实时潮位、精确洞穴、海床或航行安全数据。地形精度和坐标基准见 `docs/ninepin.md`。

西湖、加冷盆地和瓦尔港的 OSM 快照及衍生数据库位于 `public/assets/westlake/`、`public/assets/kallang/`、`public/assets/waalhaven/`，包括同源的运行时代码数据、缩略图和导航几何。保留 © OpenStreetMap contributors 署名、ODbL 1.0 许可与适用的数据库共享条件；完整来源、裁剪处理、快照 SHA-256 和建筑高度近似记录在各目录的 `sources.json`，使用及精度见 `docs/usv-sites.md`。

`docs/development-log/images/` 是本项目运行截图，其中包含上述天空和地理数据的渲染结果。研究时查看的机构摄影、论文原图及未获分发许可的第三方参考图片留在本地，不提交到此仓库；来源链接保留在研究记录和环境文档中。
