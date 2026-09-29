# vendor/dsh-graph

来源: https://github.com/miuzel/dsh-graph (tag v0.11.0, commit 6809942a...)
搬入裁定: WB-GRAPH-DECISIONS-20260914.md §E B4 (2026-09-16, 用户拍板「MIT 允许直接搬过来接管看板层」)。
许可: MIT (dsh-graph-host/LICENSE, Copyright (c) 2026 miuzel) — 搬代码合法, 保留 LICENSE 原文。
边界: MRAgent 无 LICENSE 的零复制约束不变; 本 vendor 只含 dsh-graph。
激活: 默认关闭 (boardMode=legacy)。profile cordis.patch.yml 加 insert 行 + boardMode=new 才接线 (需用户重启 dsh web)。