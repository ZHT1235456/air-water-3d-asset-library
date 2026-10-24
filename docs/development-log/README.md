# 中文 LaTeX 开发日志与技术白皮书

作者：朱华天，Gemini 3.8 Flash，GPT-6 Astra  
日期：2026年10月24日  
仓库：https://github.com/ZHT1235456/air-water-3d-asset-library

- [阅读 PDF](main.pdf)
- [LaTeX 源码](main.tex)
- `images/`：本项目浏览器运行截图，供白皮书与根 README 共用。

使用 XeLaTeX 编译（TeX Live，需 ctex、Fandol 中文字体、TikZ 等常规组件）：

```sh
cd docs/development-log
xelatex -interaction=nonstopmode -halt-on-error main.tex
xelatex -interaction=nonstopmode -halt-on-error main.tex
```

文档记录项目需求演进、18 款原创程序化模型（8 款四旋翼无人机、10 款单尖船首无人艇）、8 大核心实景水域工程环境（含深水港、港珠澳双航道桥、Hornsea 2 风电场、果洲群岛，以及 2026-10-24 新增的西湖三岛、加冷盆地、瓦尔港）、5 项无人艇规划与协同算法实验（A*、Dijkstra、领航跟随、一致性、全覆盖）、连续碰撞门（Continuous Collision Gate）安全防穿透机制、HDR 光度对齐水面物理渲染、对数深度缓冲排查过程、31 项自动化全量测试及复用方式。模型尺寸和未测绘的小构件属于演示设定。来源和授权以各环境台账为准。
