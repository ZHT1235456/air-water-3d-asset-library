# 中文 LaTeX 开发日志

作者：朱华天，GPT-6.1 Sol，GPT-6 Astra  
日期：2026年10月22日  
仓库：https://github.com/ZHT1235456/air-water-3d-asset-library

- [阅读 PDF](main.pdf)
- [LaTeX 源码](main.tex)
- `images/`：本项目浏览器运行截图，供日志与根 README 共用。

使用 XeLaTeX 编译（TeX Live，需 ctex、Fandol 中文字体、TikZ 等常规组件）：

```sh
cd docs/development-log
xelatex -interaction=nonstopmode -halt-on-error main.tex
xelatex -interaction=nonstopmode -halt-on-error main.tex
```

文档记录项目需求演进、十二款模型、环境接口、具体地点的数据依据、HDR 天空和水面、排查过程、实际验证及复用方式。模型尺寸和未测绘的小构件属于演示设定。来源和授权以各环境台账为准。
