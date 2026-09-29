# C 原生桌面复刻：实施中

## 权威状态

- PR #146 head：b5d5914ecd6e082f668925194962935431b1f0b5（开工时 gh 验证）。
- 实施分支：codex/iter5-ui-integration。
- 工作区：C:/Users/李云龙/.codex/worktrees/native-ui/dsh-auto-memory。
- 原始参考：C:/Users/李云龙/dsh-auto-memory/artifacts/pr146-all-ui-references-20260929/images。
- 64 项入口映射见 COVERAGE.md / coverage.json。全部完成仍未证明，首批实现已提交 dd242a0，尚未推送；全量复刻仍在进行。

## 已写入代码

欢迎九步桌面侧栏、移动步骤条、正文滚动、固定操作区；透明蓝色记忆册插画；两种设置入口共用字段布局；轻面板真实记录、文件预览、追加笔记与展开；工作台原生外壳和首页统计横栏、最近记录、会话信息与日程。

源文件新增于 skins/iter5/native-*，由 tools/build-iter5-skin.mjs 嵌入 lib/client.js。手写欢迎/面板入口保持 CRLF。旧 Iter5Home 已替换为 native-workbench.js 中同名组件，其他业务页仍需逐图对照。

## 当前验证

- 生成器 build/check、client/index 语法检查通过。
- smoke-test-iter5-skin.mjs 通过：包含草稿、即时设置、失败保存、取消、宿主重挂载、工作区迟到响应、欢迎 Hook 数量及九步导航、LF/CRLF 幂等。
- smoke-test-api-paths.mjs：4/4；smoke-test-water-window.mjs：50/50；smoke-test-ui-host-limits.mjs 通过。
- AGENTS 所列两个 `-pre` 测试文件在此 PR 中不存在，已使用实际无 `-pre` 文件。
- 共享入口冻结 SHA 因本轮明确修改欢迎与面板而更新，仍保留完整校验；未删断言。生成器 fixture 同步新增源文件。
- host-check.json：隔离真实 DSH 的 26 项检查通过，含欢迎 9 步 × 1440/390 布局边界、素材加载、Esc、轻面板挂载和展开。**这些不是全 UI 通过证据。**
- 当前截图是前两轮布局检查，尚未完成全量视觉评审。首次采集实际为深色，已用真实宿主主题控件重采浅色；文件名相同的旧截图已替换。后续欢迎首屏简短文案修改尚未重新截图。

## 继续执行

1. 重新读取当前 git diff 和真实宿主状态；当前宿主需要重启以确保读取最新 bundle（读取 pid 并核实 19388 listener 所有者，不能盲目杀进程）。
2. 完成首轮图片逐张检查；目前已查看 C01/C03/窄屏C03/宿主引擎与记忆/轻面板，其他截图未逐张视觉核验。不要把磁盘截图存在当成验收。
3. 继续核实原生欢迎 nav 圆角、正文尺寸；宿主窄设置的标签/控件分配仍需优化。宿主自带侧栏不属于插件改造范围。
4. 测试新版工作台外壳/首页。真实树项有“Iter5 隔离验收”，先展开它，进入“UI 集成隔离验收”会话，再打开记忆页。
5. 对照 C11–C26 与 C37–C58 逐项实施，验证 C59–C64，补全覆盖清单。包括不常用对话框、经典回退和可选画布，不能仅复用样式后标完成。
6. 新轻面板笔记的关闭/外部点击/会话切换草稿行为需专门检查；当前只有组件原有 beforeunload 和展开/打开工作台前确认，尚未证明关闭后保留。
7. 真实宿主全矩阵和完整回归与 b5d5914 同环境比较；按 impeccable 完成 detector、独立 finish reviewer 及 documenter（skill 明确授权这两个代理）；补 DESIGN.md 和 design.json，资源 provenance，包检查，提交推送现有 PR。

## 隔离宿主

DSH_HOME 为 %TEMP%/dsh-iter5-qa-20260928，19388。私有登录 URL 只在 %TEMP%/native-ui-host.log，禁止输出或提交。PID 在 host.pid，使用前需核实仍属于本测试进程。启动方式是 node 的全局 DSH lib/bin.js web --no-open --port 19388，后台隐藏窗口。

测试 profile 的 node_modules/@a9i5k4/dsh-auto-memory junction 已从原工作目录改指向本工作区，旧 junction 保存在同目录 `dsh-auto-memory.before-native-ui`。只改隔离 profile。任务完成后停自己的宿主并恢复此 junction；不得递归删除链接指向的源码目录。

运行 `NATIVE_CAPTURE=1 node artifacts/pr146-native-ui/host-check.cjs` 可采图（PowerShell 用环境变量赋值）。Playwright 从原工作目录 design-demos 的 node_modules 加载。测试只使用隔离数据，无生产凭据，无收费模型调用。完整模型端到端与团队远端权限仍未验证。

## 后续进展：记忆库与检索

C11–C14 的浏览、日志、反思和检索已在真实隔离会话中打开；新检索采用来源列表与详情双栏，按词法接口真实分组展示，不构造相关度或不存在的路径。原始返回全文保留。pages-check.json 的 12 项检查通过，包含真实词法查询、390px 布局和轻面板草稿关闭重开；浏览/日志/检索桌面及检索窄屏已视觉查看。完整跨页和深色矩阵仍待继续。

轻面板草稿采用进程内、会话/工作区隔离缓存，关闭重开恢复，确认放弃或成功保存清除；不写浏览器存储。组件回归同时覆盖身份隔离与成功清除。新入口源 SHA 仅因给 QuickPanel 添加身份 key 而更新，冻结断言保留。

当前 native-search.js/native-library.css 已进入生成器及 LF/CRLF 回归；所有上述专项回归和 build/check 通过。后续请继续 C15–C26、C37–C58 逐图实现，不重复已通过的同一检查，除非相关源码变化。当前宿主 PID 以 host.pid 及真实 listener 为准。

## 后续进展：接续、日程、技能、维护、团队与统计

新增 native-skills.js / native-storage.js / native-team.js / native-operations.css。接续主动作移至顶部，月历/事项成为日程主布局；技能采用可搜索列表与详情，原始 gated action React 节点继续承载审批、晋升、置顶和归属操作；存储来源改为真实表格，逐来源修复沿用宿主 act，索引未启用时禁用，危险删除单独着色；团队采用真实归属表格，成员/冲突/同步等完整旧工具在可展开区域保留；统计从原 StatsTab 生成 Iter5Stats，保留 15 秒轮询、全部三通路与详细图表、清理入口。

最新 operations-check.json 为 36 项真实宿主检查：九个工作页桌面与 390px 无主区域横向溢出/渲染异常，来源表格、技能布局、接续单一主动作、日程统计折叠和两个接续子页签。截图已查看桌面接续/日程/技能/维护/团队/统计/回顾/关系图，以及窄屏技能。其他窄屏截图还需逐张视觉检查。技能真实宿主目前是零数据，非空详情和动作复用目前只有组件测试，远端团队同样未验收。

**发现仍未解决的实际视觉问题：C21 工作区关系图沿用旧 WorkspaceGraph，画布内节点明显裁切且“适应”只是重置比例，下一轮需重做布局/真实适配；不得标此页完成。** C16/C17 子页签已实际打开但尚未完成参考图精细对照。C25/C26、C37–C58 与浅深/缩放/全回归/finish reviewer/documenter 仍待继续。

## 后续进展：关系图与独立白板

C21 裁切已解决：native-map.js 按所有真实主题计算径向布局，容器 ResizeObserver 计算适应比例，默认当前工作区，可切全部工作区；窄屏补完整主题文本列表，支持键盘选择和滚动平移。纯布局测试覆盖多工作区/多圈主题的全部边界，map-check.json 的 13 项真实宿主检查通过，桌面与390截图已查看。

C25/C26 的矩阵、卡片、工具条、侧栏已接入 native-secondary.css。真实验收发现宿主 data-width-handle(z-index 8) 透明拖柄遮挡节点，已将白板根限定为 z-index 9，并按宿主滚动区/输入框实测剩余高度，未改宿主拖柄或日常 profile。画布节点增加键盘语义，节点 pointerdown 不再被画布拖动捕获。boards-check.json 的 10 项真实检查通过：看板真实卡片/详情、可选画布真实节点/详情/键盘选择、容器不覆盖宿主输入框。测试仅临时启用隔离 profile 的 boardMode=graph，finally 已还原；可选画布开关仅隔离浏览器 localStorage，结束清除。

共享 DialogHost 添加 data-native-dialog / data-native-dialog-overlay 类型边界与标题字号，通知/欢迎返回保留轻提示形态，摘要/设置类浮层按内容宽度；自动接续确认样式同步。**这些弹窗的新样式目前只有源码与组件验证，尚未逐个真实触发验收；不得按 CSS 覆盖推定 C37–C58 完成。** 下一轮优先补 C37–C54 各入口和 C55–C64 的故障/深色/缩放矩阵，诊断还需结构化布局；随后全回归、设计 reviewer/documenter、打包和推送 PR。

最新宿主进程由 host.pid 记录，日志仍仅在 %TEMP%/native-ui-host.log；使用前核实监听者。本轮运行的组件 smoke 和生成器幂等通过；全量 smoke 尚未重跑。共享入口冻结 SHA 因 DialogHost 类型标记与 WbgNode 键盘/拖动修复更新，原冻结断言保留。

## 后续进展：设置内诊断入口

C45 的 DebugCenter 按真实现有字段分为运行环境、记忆与整理、诊断日志、服务与接口、文件内容检查五组；保留原刷新、探针及扫描行为，没有添加参考图中未实现的日志导出/连接测试。桌面 label/value 行与390堆叠布局已实现。日志元数据不存在时明确显示无法读取，避免空分组。共享手写冻结 SHA 因本次明确授权的结构调整更新，断言保留。

diagnostics-check.json 的5项真实隔离宿主检查通过：五分组、真实字段、桌面与390无横向溢出、无运行异常。两张截图已查看，但截图仅捕获设置滚动区的部分内容，尚非完整C45验收；最后添加的缺失日志提示仅语法/组件验证，需下一轮最终截图确认。诊断检查第一次被宿主延迟出现的API配置对话框遮挡，重跑通过正常“稍后配置”关闭，没有强制点击或修改宿主。

本轮组件smoke、生成器check和语法检查通过。尚未推送；其他弹窗、完整深色/缩放/回归与设计finish流程仍待完成。当前宿主仍运行，PID以host.pid和listener一致性核实，最后缺失日志提示修改尚未重启载入。新诊断QA脚本在diagnostics-check.cjs。

## 后续进展：编辑器、安装与迁移入口

C37 项目笔记改为完整编辑区域，明确真实目标路径、追加语义和取消；不新增参考图里的虚构标题/用户偏好写入能力。C38 日程统一为原生居中表单，保持实际支持的单一时间、优先级、地点/提醒备注字段，未添加后端不支持的结束时间与编辑操作。Iter5Dialog 修正首焦点到可编辑输入，Tab 只遍历可见可用控件。

C46/C47 由 Iter5Migration 承载真实导出和差异预览，新增/覆盖逐行展示、整包冲突策略与重写详情；切换策略重新请求宿主计划、更换包清空旧预览。宿主会将内容相同文件计入 willWrite，界面明确解释，不能从 additions=0 推断不写入。C48 删除改为展示 filePath/memoryId 的原生确认弹窗，取消不发请求，确认调用既有删除与三联动路径。C49 模型/三轴思考强度和 C50 目录回退选择器改为统一弹窗，保留实际目录/模型来源与设置草稿。

C41 初始化卡调整为原生白色布局，仍待真实触发验收。C42 引擎安装卡与 C43 Python 四阶段检查获得独立样式边界，保留既有检测/安装流程，未按参考图捏造文件级进度、Python版本下拉或完成率。

editors-check.json 本轮 28 项通过：桌面/390笔记、日程、模型、目录回退、Python；日程真实新增/删除往返；真实 .dam-pack 导出和预览；导入预览取消、删除取消均无执行请求；JS已就绪和Python检测。截图已逐张查看。仅对原生目录选择器不可用做浏览器响应注入，目录列表仍来自真实宿主；此项不能证明系统选择器成功。没有应用迁移包、没有实际删除记忆、没有调用模型、没有安装Python依赖或再次下载模型。Python入口临时切换的三个引擎字段在finally恢复。

截图名 editor-note-*, editor-calendar-*, migration-export, migration-preview-*, delete-confirm, model-picker-*, path-browser-fallback-*, engine-install-ready, python-install-*。设置中长向导/预览需要真实滚动，单张截图可能只显示可见部分，不当作全长验收。最后模型辅助文字对比和选中样式已重截图。共享手写入口仅新增Python样式标记，冻结SHA更新为3668e9e63af4e42698c1905335ec27192094cb94b145077af5af54e1ca3e135b。

组件smoke包含迁移换策略重算/换包清预览/删除确认行为并通过；migrate-pack 52/52、safe-import25/25、migrate-host-wiring24/24、ui-host-limits通过，生成器check、两个入口语法和diffcheck通过。仍未跑全量smoke。待继续C16/C17精细对照，C39/C40自动接续、C41触发、C44更新、C51经典、C52–C58通知/状态、C62–C64实际深色，以及最后全矩阵与finish流程。未推送PR。
