---
name: "DSH Auto Memory · C 原生桌面"
description: "白浅蓝、深蓝文字、蓝色操作；欢迎精致，工作页紧凑，独立表面共享主题。"
colors:
  i5-blue: "#1764FF"
  i5-fill: "#1764FF"
  i5-primary: "#1764FF"
  i5-on-accent: "#FFFFFF"
  i5-bg: "#F5FAFF"
  i5-surface: "#FFFFFF"
  i5-side: "#F2F8FF"
  i5-soft: "#EAF2FE"
  i5-text: "#102044"
  i5-secondary: "#4E6080"
  i5-muted: "#5B6B85"
  i5-line: "#DCE8F7"
  i5-ok: "#1F7A4D"
  i5-error: "#B42338"
  i5-warning: "#8A5A0E"
  i5-indigo: "#4F46E5"
  i5-purple: "#7C3AED"
  i5-green: "#047857"
  i5-orange: "#B45309"
  i5-pink: "#BE123C"
  i5-cyan: "#0E7490"
  i5-slate: "#475569"
  i5-blue-dark: "#9ABEFF"
  i5-fill-dark: "#77A9FF"
  i5-bg-dark: "#151D2C"
  i5-surface-dark: "#1D293D"
  i5-side-dark: "#172338"
  i5-soft-dark: "#283F61"
  i5-text-dark: "#ECF2FF"
  i5-secondary-dark: "#C4D1E8"
  i5-muted-dark: "#B2C3DE"
  i5-line-dark: "#3B4D67"
  i5-ok-dark: "#8EDAAF"
  i5-error-dark: "#FFB2BC"
  i5-warning-dark: "#F0CB8A"
  i5-indigo-dark: "#B6B1FF"
  i5-purple-dark: "#CFADFF"
  i5-green-dark: "#8EDAAF"
  i5-orange-dark: "#F0CB8A"
  i5-pink-dark: "#FFB3C7"
  i5-cyan-dark: "#8FD6E7"
  i5-slate-dark: "#C4D1E8"
typography:
  headline:
    fontSize: "calc(22px * var(--dam-user-scale,1))"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "0"
  title:
    fontSize: "calc(16px * var(--dam-user-scale,1))"
    fontWeight: 600
  body:
    fontFamily: "system-ui,\"Segoe UI\",\"Microsoft YaHei\",sans-serif"
    fontSize: "calc(14px * var(--dam-user-scale,1))"
    lineHeight: 1.6
  label:
    fontSize: "calc(12px * var(--dam-user-scale,1))"
  mono:
    fontFamily: "ui-monospace,Consolas,monospace"
    fontSize: "12px"
    lineHeight: 1.6
rounded:
  i5-radius: "12px"
  i5-control-radius: "8px"
  i5-tag-radius: "6px"
spacing:
  i5-compact-gap: "12px"
components:
  button-secondary:
    backgroundColor: "{colors.i5-surface}"
    textColor: "{colors.i5-text}"
    rounded: "{rounded.i5-control-radius}"
    padding: "6px 12px"
    typography: "{typography.body}"
  button-primary:
    textColor: "{colors.i5-surface}"
    rounded: "{rounded.i5-control-radius}"
    padding: "6px 12px"
  button-primary-soft:
    textColor: "{colors.i5-blue}"
    rounded: "{rounded.i5-control-radius}"
    padding: "6px 12px"
  button-link:
    textColor: "{colors.i5-blue}"
    padding: "4px 0"
  input:
    backgroundColor: "{colors.i5-surface}"
    textColor: "{colors.i5-text}"
    rounded: "{rounded.i5-control-radius}"
    padding: "7px 10px"
  navigation-active:
    backgroundColor: "{colors.i5-soft}"
    textColor: "{colors.i5-blue}"
    rounded: "{rounded.i5-control-radius}"
    padding: "5px 10px"
  chip:
    backgroundColor: "{colors.i5-soft}"
    textColor: "{colors.i5-blue}"
    rounded: "{rounded.i5-tag-radius}"
    padding: "3px 9px"
  card:
    backgroundColor: "{colors.i5-surface}"
    rounded: "{rounded.i5-radius}"
    padding: "16px"
  quick-record:
    backgroundColor: "{colors.i5-surface}"
    textColor: "{colors.i5-text}"
    rounded: "10px"
    padding: "14px"
---

# Design System: DSH Auto Memory · C 原生桌面

## Overview

> 状态：current implementation inventory / not visually accepted。用户已明确拒绝当前视觉结果，认为未达到 C 参考复刻目标；本文仅盘点现有代码，不构成已接受的设计规范或验收通过，后续完整视觉复核优先。

**Creative North Star: "C 原生桌面 · 白浅蓝记忆工作空间"**

采用用户明确选择的 C 系列参考：白色内容面、浅蓝环境、深蓝文字与清晰蓝色操作。欢迎流程保留独立插画与舒展节奏，工作页以紧凑分区和可读信息行承载日常操作。

运行于 DSH Web 宿主，原生桌面是视觉方向。工作台、宿主设置、轻面板和浮层共享语义主题，各自保有容器与密度。

**Key Characteristics:**

- 白浅蓝表面与深蓝文本
- 欢迎精致、工作页紧凑
- 独立宿主表面共享主题
- 真实内容和状态优先

依据：PRODUCT.md、OpenSpec 实施方案、skins/iter5 实际源码与生成顺序。64 张参考位于原工作目录 artifacts/pr146-all-ui-references-20260929；由用户指定，未执行随机 concept roll。coverage.json 是入口/证据映射，不是 64 页视觉通过证明；有限独立复核及修正结论以 artifacts/pr146-native-ui/finish-review.md 为准。本文件未做像素一比一或 comp-diff 成绩声明。

## Colors

Primary：i5-primary 是实色主操作，i5-blue 用于可点击文字与选中态，i5-fill 用于进度/选择标记，i5-on-accent 用于实色主操作文字。浅色三种蓝当前同值，但语义不能合并；深色的 blue/fill 改亮，primary/on-accent 保持浅色定义。

Neutral：i5-surface 是内容面，i5-bg 是冷浅蓝环境，i5-side 是侧边环境，i5-soft 是选择底色；i5-text、i5-secondary、i5-muted 分别承载正文、说明与弱信息，i5-line 建立分隔。ok/error/warning 为状态，indigo/purple/green/orange/pink/cyan/slate 为类型提示，不能替代文字状态。

前置 colors 使用 CSS 变量去掉开头两个连字符的原名；带 -dark 的条目对应 data-deep=true 的覆盖值，并非另造运行时变量。来源为 skin.css，生成器同时复制到 data-dam-theme 独立边界。

**The Shared Theme Rule.** 每个独立挂载或 portal 表面携带主题边界，不能依赖工作台恰好在场。

## Typography

正文使用前置 body 字体栈，无网络字体。标题层级为页面 headline、分区 title、正文 body、辅助 label；代码原文用 mono。数值使用 tabular-nums。工作台正文有 .005em 字距；字号表达式保留 --dam-user-scale，不把用户缩放烘焙成固定像素。

欢迎标题当前为 30px × 用户字号、700、1.3 行高，首步 32px；窄屏分别为 24px / 23px。欢迎说明为 15px × 用户字号、1.85 行高、最长 72ch，首步为 14px。它是当前组件事实；系统字体作为展示标题的处理尚不晋升为新页面的展示字体规范。

## Layout

**The Different Density Rule.** 共享色彩与控件语言，按欢迎、工作页和轻面板分别安排空间。

工作台：侧栏 208px、标题栏 44px、底栏 34px，主区 padding 20px 24px；统计条后接双列内容。欢迎窗口上限 1120px × 780px、四周预留 48px，侧栏 224px；正文独立滚动，底部操作占独立网格行。宿主设置复用字段布局，但嵌入容器正文滚动、保存区位于独立 flex 行；轻面板也以内容滚动加固定操作区组织。

工作控件 --i5-compact-control 为 34px，--i5-compact-gap 为 12px；欢迎按钮至少 44px。720px 以下欢迎改横向步骤导航，窗口宽高分别扣 16px / 24px；工作台改为 44px 标题栏、42px 菜单行、内容、34px 状态栏。基础侧栏在 viewport 900px 或 data-narrow 下抽屉化；不要只看单一断点。容器 780px 以下工作台双列合并，设置字段在容器 520px / viewport 600px 下堆叠，开关仍与标签并列；容器 600px 以下通用控件扩至 44px。窄屏与粗指针的尺寸仍需以最终选择器级联核对，不能声称每个控件都达到同一触控尺寸。

## Elevation & Depth

常规卡片 --i5-shadow 为 none，以描边、浅蓝选择面和内部分隔建立层级。浮层保留柔和阴影；共享规则对欢迎/轻面板施加 0 16px 48px color-mix(in srgb,var(--i5-text) 16%,transparent)，其 !important 优先于局部普通声明。部分工作主按钮仍使用渐变及微阴影，因此不制定“所有按钮必须纯色”或“完全无阴影”的禁令。完整片段及阴影在 sidecar。

欢迎换页淡入为 160ms ease-out；减少动态效果模式关闭动画、过渡和平滑滚动。加载状态的循环动画只表达等待，不提供虚构进度。

## Shapes

前置 rounded 保留原有圆角变量。常规卡片使用 i5-radius；工作台局部卡片、列表详情、设置分组采用 8px，轻面板外框 14px，欢迎 12px。这些是不同容器的现存取值，不需强制归一。边框主要为 1px i5-line，选中行通过浅蓝底与内侧色线强化。开关为胶囊轨道与圆形滑块。

## Components

按钮：工作台次操作使用内容面、描边与紧凑 padding；主操作保留代码中的蓝色渐变，欢迎/保存/轻面板的主操作使用 i5-primary 实色。轻主按钮与文字链接仍是现存变体。hover、选中、disabled 与 focus-visible 应保留；统一焦点为 2px i5-blue、offset 3px，disabled opacity .55。

输入：白色/深色内容面与细边，紧凑 padding，复用字号；保留输入、错误与重试路径。导航：选中项浅蓝底、蓝字、600 字重；工作台当前项取消旧竖条，记忆文件列表仍保留独立选中标记。标签用于来源/类型，不把静态标签变成交互按钮。卡片默认无阴影，设置卡片使用标题带和字段行。

轻面板记录：小型类型图标、标题、两行摘要与时间，记录可展开；底部两列次操作与整行主操作。这些组件不依赖工作台父节点。Iter5Surface 给 panel/dialogs/autocont 的 portal 自带 data-dam-theme 和 data-deep；Iter5HostSettings 保留独立嵌入/展开，生成器按 skin、tour、panel、settings、workbench、library、operations、secondary 的顺序合并 CSS。

插画：lib/skin-assets.js 的 hero.welcome 映射到 lib/assets/skin/slots/hero.native-folio-v1.png，深色为 hero.native-folio-dark-v1.png；分别由 OpenAI image_gen 基于 C01 / C62 生成透明 PNG，来源见 artifacts/pr146-native-ui/asset-manifest.json 与 dark-asset-manifest.json。empty.library 使用 empty.native-document-v1.png（浅深共用），其生成来源未在本次读取的清单中确认，不补造来源。图片只承载插画，标题、说明与按钮由真实组件渲染。旧 skins/iter5/README.md 的山水/内联 SVG 描述属于既有漂移，不据此覆盖当前路由。

sidecar 的组件为无 React 依赖的静态样式样本，变量不位于全局 :root，故样本内使用源码浅色字面值；交互伪类用于样式展示，不宣称具备宿主业务行为。色阶为面板预览合成 OKLCH，非新增生产 tokens。

## Do's and Don'ts

### Do:

- Do 复用语义变量、真实字段和现有可操作组件。
- Do 在独立宿主设置、轻面板及浅深主题中分别检查正文和操作区。
- Do 保留焦点轮廓、字号偏好、窄屏滚动与减少动态效果支持。

### Don't:

- Don't 将参考截图或图片中的文字当作可操作界面。
- Don't 将参考示例数字、共享样式或 coverage 映射当作全量验收。
