# Issue #162：诊断完整性修复与审计

基线：当前 upstream main `abd6d625b0b7e3ac2e364552b208db73734795c1`。
分支：`fix/issue162-truthful-degradation`，从基线独立建立。
未合入 issue160 分支；原 checkout、其本地工作与远端分支不参与本补丁。
仓库与 `.agents` 中未发现适用于此任务的 AGENTS.md / SKILL.md。

报告者机器的 session-query 根因未知。本修复不检查私人历史、不验证其机器，
不声称 descriptor 版本、迁移器或特定旧会话数导致故障。

## 行为与设计选择

- 会话检索区分：未提供能力、成功空结果、成功命中、宿主调用抛错、结果处理失败。
  只有实际失败记录 `session-search`，失败后继续尝试既有词法扫描。
- 保留返回数组与正命中时尾部说明的契约；用数组的本次 `diagnostic` 属性传递空命中说明。
  `scope=sessions` 与 `scope=all` 均消费说明；空命中不制造“历史会话命中”标题。
  成功结果不携带旧诊断；并发请求无共享的“最后一次检索错误”变量。
- 扫描说明来自本次计数与代码常量：最近优先、最多 80 次文件尝试、每文件头 160 帧 / 4MiB、
  原文件超过 16MiB 跳过、仅识别两种既有文件名。读取失败、空扫描、缺少解码器及正常预算截断
  分开呈现。扫描异常聚合为每次扫描至多一条 `session-scan`，不按文件刷屏。
- `decodeZstdFramesHead` 原来先纳入整帧再检查字节上限，失败帧不计帧数。
  现在用实际剩余 `maxOutputLength`，失败尝试也消耗帧预算；超出字节预算即停止。
  可选第四参数只返回本次 `failedFrames` / `limited` 观测，原三个参数与字符串返回值保留。
  正常头预算截断不会被登记为失败。
- `session-search` / `note-status` 接入实际 `_degradeSink.record(kind, reason)`。
  维持 `degrade_pre_v1`、累计 counts、200 条 recent、200 字 reason、读诊断时合并落盘及 quota schema。
  文件不在每次 recall 时刷写；打开/刷新诊断触发 `debugInfo()`，更新 `memory/degrade/latest.json`。
- 新路径的异常信息采用允许列表投影：异常类型及已知错误码；原 message/stack 全部删去。
  某些宿主仅在 message 中提供错误码，最多检查其前 2048 字符，只提取已知码。
  不调用未知值的 `toString`，不重复读取同一属性；有害 getter、同步或异步 sink 失败不会打断主流程。
- 诊断面板消费真实 debug 响应，展示相关失败次数、允许列表类型/码与 persisted。
  明示“本次运行累计历史”，恢复后保留历史不被误读成当前故障。原始 reason 不直接渲染。
- 状态变更使用严格读取：通用 `readTextSafe` 会把 IO 错误吞成空串，不能用这种空串触发
  陈旧 fallback 覆盖。状态写入失败不再无依据宣称“笔记已正常保存”。写盘之后的缓存/留痕失败
  则说明状态正文已写入；日志失败也进入原 `note-status` 台账。
  `memory_note` 外层已确认初次写入成功时，可以准确说明“笔记写入已完成，但状态变更未确认”。
- Python 语义臂的内层 catch 原来吞成 null，外层 selector 根本拿不到异常，故外层留痕不可达。
  现在在该内层 catch 记录一次既有 `semantic-arm`；保持 null 回退契约，成功空结果不记录。

## 方案取舍

| 备选 | 本次选择与理由 |
| --- | --- |
| 把原异常 message 写给模型 | 不采用。完整省略 message 比正则猜测私人正文更可靠；代价是详细根因仍需宿主自身诊断。 |
| 创建全新返回对象 | 不采用。数组调用方和既有正命中格式保留，诊断只附在当前返回值上。 |
| 用实例上的 lastError 传递空结果说明 | 不采用。容易污染恢复后的结果或并发请求。 |
| 每次失败立即刷台账到磁盘 | 不采用。沿用仓库读诊断驱动落盘机制，不新增热路径 IO/计时器。 |
| 全局改造所有 catch / sink | 不采用。本次只改直接证实的接线、真假状态与共享头解码预算缺陷。 |
| 状态读失败时继续用 fallback 覆盖 | 不采用。fail-soft 返回状态未确认，避免读异常导致陈旧内容写回。 |

## 完整文件清单

1. `lib/index.js`：会话/状态路径、说明消费、真实 sink 接线、Python 内层失败留痕。
2. `lib/diagnostic-error.js`：允许列表异常投影与安全 sink 调用。
3. `lib/subagent-gc.js`：实际头帧/字节限制及本次截断观测。
4. `lib/client.js`：共享 DebugCenter 的相关台账投影；未改生成皮肤块。
5. `tests/smoke/smoke-test-issue162-diagnostic-integrity.mjs`：25 项产线方法行为回归。
6. `tests/smoke/smoke-test-session-search-fallback.mjs`：移除编造的事故归因、使用 v3 正常夹具，
   增强真 sink/空扫描说明断言，保留说明变异检查。
7. `tests/smoke/smoke-test-g3-note-status-wire.mjs`：接线守卫适配真实 catch/写盘状态，
   方法边界代替任意 4000 字符截取，增加保存阶段区分断言。
8. `tests/smoke/smoke-test-r26-cross-layer.mjs`：精确 index 哈希更新及依据，仍检查整文件。
9. `tests/smoke/smoke-test-iter5-skin.mjs`：共享诊断 UI 的精确经典区哈希更新及依据。
10. `docs/internal/ISSUE162-DIAGNOSTIC-REVIEW.md`：本审计与设计复核材料。
11. `README.md`：诊断刷新驱动快照持久化的英文用户说明。
12. `README.zh-CN.md`：同一机制的中文用户说明。

## 行为证据与可复现检查

新增套件从真实生产源码抽取方法及回调执行，真实使用 sink、状态解析器、读写/持久化和 zstd 解码器。
只在宿主、文件错误和 UI hooks 等边界使用确定性夹具；不启动 DSH，不调用模型/付费 API。
`debugInfo()` 的实际返回经真实 DebugCenter 组件（轻量 hooks/createElement 壳）消费，
同时断言磁盘 counts/recent/quota 与 persisted。它不是 Windows 桌面端 E2E。

| 失败模式 | 新套件中的行为回归 |
| --- | --- |
| 缺失能力混同成功空结果 | missing capability / missing method / empty / hit |
| 编造宿主成因、真实记录丢失 | thrown host query + true counters/recent + no v2 data |
| 空兜底消失、恢复/并发污染 | empty fallback / recovery / concurrent requests / scope=all |
| 扫描失败误当未命中 | decoder unavailable / directory absent / IO denied / per-file failure |
| 失败文件绕过 80 上限、巨文件先读后跳 | attempt cap / mtime order / pre-read size skip |
| 解码输出超过说明预算 | real frame & byte budgets / budget truncation is not failure |
| 留痕报错遮盖原错误 | throwing/rejecting/getter sinks / throwing scanner / note sink failure |
| 异常泄露路径、凭证、正文或多行注入 | malicious error projection / bounded prefix / changing getters |
| 状态失败虚报成功或陈旧 fallback 写回 | status write/read failure / persisted-vs-audit/post-save failure |
| 外层 catch 的状态提示泄露原异常 | real memory_note callback |
| 台账面板不可见或落盘失败隐身 | real debugInfo / persistence / real DebugCenter render |
| 台账变成无限历史或重复登记 | retention/eviction / once-per-call / aggregated scan failure |
| Python 内层吞错使外层诊断不可达 | real _pySemanticRank sidecar exception / empty / success |

初次修复的 21 项套件全部通过；对原 upstream 基线运行当时同一套件，20 项失败，1 项通过。
那 1 项是独立新异常投影 helper 的防御性测试；基线红例不是缺模块/语法失败。
既有 session fallback、G3、degrade、subagent GC 与皮肤生成检查一并保留。

最终提交验证命令（结果以最终交付/CI 的 exact SHA 为准）：

```sh
node tests/smoke/smoke-test-issue162-diagnostic-integrity.mjs
node tools/run-smoke.mjs --jobs=1 --timeout=90000 \
  --exclude=-live --exclude=m79-feature-v2 --exclude=m710-fv2-emit --exclude=c4-fresh-install
node tools/build-iter5-skin.mjs --check
git diff --check
```

CI 配置本身排除的 6 项：fresh-download-live、peer-probe-live、team-minio-live、
m79-feature-v2、m710-fv2-emit、c4-fresh-install。前三项需要真实网络/服务；后三项需要
本地模型/发布包等产物。排除不是通过。仓库无独立通用 eslint/package build 脚本，
执行 lib/tools 的 Node 语法检查和既有 generator `--check`；不发布 release。

## 父代理复审后的有限修正

父代理对初次 head `503a8835e0042106fea625231c7755a90977ab6d` 复审发现两个遗漏，
确定性夹具确认意见成立；新增 4 组行为回归对该提交为 0/4 通过，修正后完整新套件为 25/25。

- 同一会话的两种文件名分别 stat，只选最新可 stat 的常规文件；mtime 相等优先 v3。
  一个候选 stat 出错保留另一个可用候选，并进入本次聚合失败；普通 ENOENT 是正常的缺失候选。
  仍然每会话最多读取一个文件，80 次尝试及 16MiB 预读取限制保留。
  选中文件在 stat 后读取失败仍可能发生，不用陈旧候选掩盖失败。
- 共享私有单帧解析器检查头、块、校验尾的结构边界；公共 scanner 的健康帧数组 API 不变，
  损坏尾部停止定位并保留完整前缀。head decoder 每次解析前先检查帧/字节预算，
  预算内不可定位的损坏尾部记一次 failedFrames；预算外内容既不解析，也不声称有损坏。
  可恢复命中继续返回；说明将“无可解码头部”改为“头部解码失败”，避免有前缀时措辞失实。
- 中英文 README 及真实诊断面板明确 `latest.json` 在诊断刷新时更新，沿用原持久化时机。

| 复审失败模式 | 新回归的直接证据 |
| --- | --- |
| 旧名遮住新 v3 / stat 一个失败隐藏另一候选 | stale old no-hit + newer v3 hit；反向更新；相等时间；两种候选各自 stat 抛错 |
| 有效前缀 + 垃圾尾静默 / 4 字节 magic 抛 RangeError | 两种尾部均保留前缀；预算内 failedFrames=1；公共 scanner/full decoder 兼容 |
| 超过头预算仍读取损坏内容 | maxFrames=1、精确 maxBytes、零预算均为 limited=true / failedFrames=0 |
| 截断头/块/校验及非法块类型 | 保留前缀并只计一次观测失败 |
| 损坏尾部让词法命中丢失或未留痕 | 实际词法方法仍返回命中，真实 session-scan 计数为 1 |

选择共享单帧解析器而非复制两套 scanner，避免边界校验漂移；未改变公共导出签名，
未尝试在未知结构坏尾中猜测新的帧起点。完整合法帧的解压失败仍消耗一次预算并可继续下一帧。
精确源码哈希守卫随这两处产线调整及 UI 文案更新，仍校验整文件/完整经典区域。

## 审计范围与保留的限制

审查：全仓 `_degrade*` 名称/初始化、record API、会话 fallback 的全部消费者、状态方法/工具外层、
`degrade.js` schema/留存/合并落盘、`debugInfo` 和共享 DebugCenter、语义 selector/内层 catch、
共享 head 解码器、既有源码守卫及生成器。
未发现另一个 `_degradePre` 类拼错变量；修复后的会话与状态路径不依赖它。
同一次宿主错误仅记录一次 `session-search`；扫描 IO 失败是不同阶段的聚合事件，不是重复登记。

未在本任务扩大处理的既有问题：其他 semantic/evidence/l0 台账调用仍可能记录原 message；
其他 diag/host debug 面的异常清洗也不构成本次全局保证。Python sidecar 的非抛出失败帧仍返回 null，
未在本任务重定义其协议分类。相关行可从 `record('semantic-arm'` / `record('evidence-arm'` /
`record('l0-sync'` 和 `_pySemanticRank` 定位。本补丁不声称仓库所有日志都已脱敏或所有故障都可观测。

实际宿主 session-query 根因、Windows/Electron 环境、真模型运行与真实浏览器视觉未验证。
词法 fallback 是部分扫描，不支持未列出的会话日志文件名；文件枚举不是整个文件树的时间预算，
扫描会同步执行。预算补丁不构成“Node zstd 永不崩溃”的保证。
既有状态 read/modify/write 的跨请求事务竞争也未在本任务设计新的锁。
后续父代理仍需审查完整 pushed diff；本代理自审与 CI 不替代该复核。
