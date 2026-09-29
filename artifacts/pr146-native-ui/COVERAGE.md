# C 原生桌面 UI 逐页实施表

基线 b5d5914。此表只记录本轮状态，旧 PR 验收不代表新布局已通过。

| 参考 | 页面 | 组件/入口 | 本轮状态 |
|---|---|---|---|
| C01 | 欢迎使用 | DialogHost / TOUR_STEPS | implemented-awaiting-final-host-review |
| C02 | 核心能力 | DialogHost / TOUR_STEPS | implemented-awaiting-final-host-review |
| C03 | 记忆快照 | DialogHost / TOUR_STEPS | implemented-awaiting-final-host-review |
| C04 | 日常体验 | DialogHost / TOUR_STEPS | implemented-awaiting-final-host-review |
| C05 | 每日助理 | DialogHost / TOUR_STEPS | implemented-awaiting-final-host-review |
| C06 | 外部记忆 | DialogHost / TOUR_STEPS | implemented-awaiting-final-host-review |
| C07 | 检索引擎 | DialogHost / TOUR_STEPS | implemented-awaiting-final-host-review |
| C08 | 唤起与固化 | DialogHost / TOUR_STEPS | implemented-awaiting-final-host-review |
| C09 | 欢迎完成 | DialogHost / TOUR_STEPS | implemented-awaiting-final-host-review |
| C10 | 工作台 | Iter5Home | implemented-awaiting-final-host-review |
| C11 | 记忆库·浏览 | Iter5Browse | implemented-awaiting-full-matrix |
| C12 | 记忆库·日志 | Iter5History (logs) | implemented-awaiting-full-matrix |
| C13 | 记忆库·反思 | Iter5History (reflections) | implemented-awaiting-full-matrix |
| C14 | 记忆库·检索 | Iter5Search | implemented-awaiting-full-matrix |
| C15 | 接续·当前任务 | Iter5Handoff | implemented-awaiting-full-matrix |
| C16 | 接续·白板 | PlanTab | pending-page-comparison |
| C17 | 接续·外部来源 | Iter5External | pending-page-comparison |
| C18 | 日程 | Iter5Calendar | implemented-awaiting-full-matrix |
| C19 | 技能 | Iter5Skills | implemented-awaiting-full-matrix |
| C20 | 唤起回顾 | Iter5Recall | implemented-awaiting-full-matrix |
| C21 | 工作区关系 | Iter5Workspaces | implemented-awaiting-full-matrix |
| C22 | 存储与维护 | Iter5Storage | implemented-awaiting-full-matrix |
| C23 | 团队协作 | TeamTab | implemented-awaiting-full-matrix |
| C24 | 统计 | StatsTab | implemented-awaiting-full-matrix |
| C25 | 白板看板 | KanbanView | implemented-awaiting-full-matrix |
| C26 | 白板画布·可选入口 | WhiteboardGraphView | implemented-awaiting-full-matrix |
| C27 | 工作台设置·引擎 | Iter5Settings / engine | implemented-awaiting-final-host-review |
| C28 | 工作台设置·记忆 | Iter5Settings / memory | implemented-awaiting-final-host-review |
| C29 | 工作台设置·外观与目录 | Iter5Settings / appearance | implemented-awaiting-final-host-review |
| C30 | 工作台设置·行为与维护 | Iter5Settings / behavior | implemented-awaiting-final-host-review |
| C31 | DSH记忆设置·引擎 | Iter5HostSettings / engine | implemented-awaiting-final-host-review |
| C32 | DSH记忆设置·记忆 | Iter5HostSettings / memory | implemented-awaiting-final-host-review |
| C33 | DSH记忆设置·外观与目录 | Iter5HostSettings / appearance | implemented-awaiting-final-host-review |
| C34 | DSH记忆设置·行为与维护 | Iter5HostSettings / behavior | implemented-awaiting-final-host-review |
| C35 | 轻面板·概览 | Iter5QuickPanel | implemented-awaiting-final-host-review |
| C36 | 轻面板·展开分区 | MemoryPanel / MemoryTabBody | implemented-awaiting-final-host-review |
| C37 | 追加笔记编辑区 | Iter5Note | implemented-awaiting-final-host-review |
| C38 | 日程新增与编辑 | Iter5Calendar / Iter5Dialog | pending-page-comparison |
| C39 | 自动接续确认 | AutoContinueHost | pending-page-comparison |
| C40 | 接续执行进度 | AutoContinueHost | pending-page-comparison |
| C41 | 记忆中枢初始化 | DialogHost / workbench | pending-page-comparison |
| C42 | 内置模型安装与下载 | DialogHost / semantic install | pending-page-comparison |
| C43 | 高级Python环境配置 | SettingsPage / Python setup | pending-page-comparison |
| C44 | 版本与更新说明 | DialogHost / update | pending-page-comparison |
| C45 | 诊断与调试中心 | DebugCenter | pending-page-comparison |
| C46 | 记忆导出 | Iter5Storage / export | pending-page-comparison |
| C47 | 记忆导入预览 | Iter5Storage / import | pending-page-comparison |
| C48 | 危险操作确认 | window.confirm (native host behavior retained) | pending-page-comparison |
| C49 | 模型与思考强度选择 | model picker (verify exact component) | pending-page-comparison |
| C50 | 目录选择 | settings path browser (verify exact component) | pending-page-comparison |
| C51 | 经典模式与回退 | MemoryPageView / MemoryTabBody | pending-page-comparison |
| C52 | 暂离返回提示 | Greeting drawer / DialogHost | pending-page-comparison |
| C53 | 阶段总结 | DialogHost / summary | pending-page-comparison |
| C54 | 插件通知 | DialogHost / notice | pending-page-comparison |
| C55 | 空数据状态 | Iter5Empty | pending-page-comparison |
| C56 | 加载状态 | Loading | pending-page-comparison |
| C57 | 读取失败与重试 | Iter5Error | pending-page-comparison |
| C58 | 权限不足状态 | existing permission/unavailable feedback | pending-page-comparison |
| C59 | 窄屏工作台 | Iter5Page | implemented-awaiting-final-host-review |
| C60 | 窄屏展开记忆设置 | Iter5HostSettings | implemented-awaiting-final-host-review |
| C61 | 窄屏轻面板 | Iter5QuickPanel | implemented-awaiting-final-host-review |
| C62 | 深色欢迎页 | DialogHost / welcomeTour | implemented-awaiting-final-host-review |
| C63 | 深色记忆设置 | Iter5HostSettings | implemented-awaiting-final-host-review |
| C64 | 深色轻面板 | Iter5QuickPanel | implemented-awaiting-final-host-review |
