# skins/v4 · 客户要的新款皮肤（10 屏）

- **立包**：2026-09-27，第三方判定 Agent 按 [115 章程](../../docs/teamwork-impl/115-新UI皮肤层施工章程.md) + [12 卷接口契约](../../docs/teamwork-research/12-前端皮肤接口契约.md) 施工。
- **形态**：12 卷 §二 皮肤包（theme.json + skin.css + skin.js + assets/）。
- **视觉判据**：`C:\Users\JH Z\Desktop\美术资源参考图\*.png`（10 张，1448×1086，sha 前缀见 concept/_ref-paths.json）。
- **结构参照**：`docs/teamwork-research/skin/index.html`（10 个 data-page：home/library/recall/timeline/calendar/mindmap/external/handoff/welcome/settings）。
- **数据源**：只用既有接口（115 §3 表），零新路由。
- **纪律**：本体零改动（除 12 卷 §九 所需的有限接线点，全部成对标记）；fail-closed 回经典；零构建零依赖。
- **进度**：批次 1 骨架已立；批次 2 十屏未开工。

## 撤销方式

整包删除 `skins/v4/` 即回经典（包内无本体侵入；本体侧接线点见交付回执清单，均带 `/* dam-skin:begin/end */` 标记）。
