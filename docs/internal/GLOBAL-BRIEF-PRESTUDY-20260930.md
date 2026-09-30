# 全局简报（Global Briefing）预研 —— 切回 DSH 时自动注入「其他 agent 的新动态」

> 技术储备 · 2026-09-30 · 等拍板，未动任何代码。
> 需求（用户原话转述）：现在经常多个 agent 协作，能否在切回 DSH 开始对话的时候，自动看别的 agent 记忆文档的新变化、commit 的新提交，塞进 prompt 让 DSH 对话对全局信息更清楚。

---

## 1. 需求拆解

| 要素 | 内容 | 判定 |
| --- | --- | --- |
| 何时 | 「切回 DSH 开始对话」≈ 暂离回归 + 新会话首轮 | 现成信号：`lastActiveAt` 暂离判定（index.js:8974-8984）+ `agent/session-start` |
| 看什么 ① | 其他 agent 记忆文档的**新变化**（增/改） | 缺口：外部源有 mtime 无水位（见 §3） |
| 看什么 ② | **git 新提交**（工作区仓库） | 缺口：全仓零 git 读取能力（见 §3） |
| 怎么给 | **塞进 prompt**，让对话对全局信息更清楚 | 现成缝：动态快照 otherDynamic pushPart（index.js:7043-7105） |
| 语义 | 是「简报」不是「搬运」——headline + 可 read 的路径，模型按需下钻 | 与插件既有「链接模式」纪律一致 |

「别的 agent」在本机语境下有四种形态，须分开设计：

- **A. 同机其他 DSH 工作区**：`~/.dsh/memory/workspaces/<bucket>/` 下的 MEMORY.md / 日志 / 交接账本——别的 DSH 会话（另一个项目/窗口）沉淀的记忆；
- **B. 同机其他 AI 工具**：ZCode 记忆（`~/.zcode/...`）、CLAUDE.md、Codex/AGENTS.md、Kimi/TRAE 规则——`ExternalMemory` 已枚举的 13 类源；
- **C. git 提交**：任何 agent（包括人）对工作区仓库的新 commit；
- **D. 远程团队**（team 线）：跨机器的 agent 记忆同步——**本预研不覆盖**（team 线自身尚未接线，见 §3 缺口 4），列为 P2。

## 2. 结论先行

**可行，且大部分缝已就位**：注入缝、预算账、暂离触发、外部源枚举、水位先例、原子落盘惯例全是现成的。真正的缺口只有三个：**增量水位检测**（mtime 采了不比）、**内容摘要段构造**（`injectionText()` 是死代码）、**git 读取管道**（全仓零 git）。建议按 §6 的 P0/P1/P2 分期，P0 ≈ 150-220 行。

## 3. 现状盘点

### 3.1 可复用能力（全部 file:line 已核实）

1. **注入缝与预算账**：`renderMemoryDynamic` 的 `pushPart(bucket, kind, …)` 分桶 + 优先级 + `injectBudgetChars` 逐段贪心（index.js:7043-7105）；分区注册表 `PROMPT_SECTION_KEYS_PRE_V1`（13 段，index.js:958-974）+ 必须段子集 `PROMPT_SECTION_MUST_PRE_V1`（:979）。
2. **暂离回归触发样板**：欢迎回来段就是「条件 + 一次性语气段」的现成挂点（index.js:7092-7096）；暂离判定用全局 lastActive（跨工作区统揽，:8974-8984），活动戳只在真实 agent turn-stopping 刷新（:13771）——后台沉淀不误触。
3. **外部源枚举 + 逐源开关**：`ExternalMemory.discover()`（index.js:11608 起）产出每文件 path/size/mtime，13 源键（DEFAULT_CONFIG.externalSources，:726-741）+ `externalInjectionChars` 预算键（:724）；3 分钟内存 TTL（:11609）。
4. **水位/游标先例**：team-pull 的 `since` 游标「整批成功才前进」（lib/team-pull.js:48、188-189）；环形 JSONL 内容指纹游标 `createJsonlTailCursorPre`（lib/jsonl-tail-cursor.js）可复用为「只交付一次」判重核。
5. **持久化小状态惯例**：config-io 原子写（lib/config-io.js:94、145）+ `~/.dsh/memory/*.json` 小状态文件先例（recall-stats.json / cont-seq.json / workspaces-summary.json）。
6. **工作区批量读取**：`readWorkspaceMemory`（index.js:8080）、`listAllWorkspaceLogs`（:9121）、跨区扫描（:7780-7790）、`discoverWorkspaces`（:8038）。
7. **team 注入仲裁器（休眠中）**：`team-inject` 的 low/normal/must 贪心占位已接进 renderMemoryDynamic 记账（index.js:7119-7126），但候选数组无生产者（:12716）——P2 可作简报段的落点之一。

### 3.2 缺口清单

1. **无增量检测**：外部源 mtime 采了只用于排序，从不与持久化水位比较；重启即丢基线（index.js:11609、11547）。
2. **内容注入通路缺失**：带内容摘要的 `injectionText()` 全仓零调用（死代码，index.js:11694，已核实）；当前外部段每轮只注入「源名 + 绝对路径」指针行（:7062-7076）。
3. **git 能力为零**：全 lib/ 无任何 git log/commit 读取；child_process 仅 pnpm/npm 自更新与 python sidecar 两用（index.js:15744、13621）；team-project-map 的 git remote 钩子未接线（lib/team-project-map.js:82）。
4. **team 同步是未接线的脚手架**：outbox 零 enqueue、pull 无 fetchJson 无调度（index.js:12757-12776）——D 形态（远程 agent）要依赖它，但 P1 不依赖。
5. **欢迎缺一次性语义**：无持久化的「已欢迎过」标记；简报需要「每次回归只交付一次」的确定语义（§5）。
6. **工作区总览不读交接账本**：`readWorkspaceMemory` 只读日志 + MEMORY.md 头部（index.js:8080-8094）——简报要覆盖账本需自补扫描（账本恰是「别的 agent 干到哪了」最浓缩的载体）。

## 4. 设计方案：水位驱动的「全局简报」段

### 4.1 核心循环

```
每轮 renderMemoryDynamic（或 15s 心跳）做「便宜检查」（只 stat，零内容读取）:
  对每个启用的源: stat 目标文件/`git rev-parse HEAD` 的开销 vs 水位
  有任何新变化 ──→ 组装简报草稿（此时才读内容）→ 暂存 state.draft
                  ──→ 下一次 pushPart 注入草稿 → 注入真实发生后推进水位（原子落盘）
  无新变化 ──→ 零字节、零注入（段不出现）
```

**便宜检查的开销**：外部源 ~13 源 × stat；DSH 桶按 `workspaces-summary.json` 的已知桶列表 stat；git 一次 `rev-parse HEAD`（P1）。全部毫秒级、无 LLM、无网络（S9 纪律不破）。

### 4.2 源清单（P1 范围）

| 源 | 检测目标 | 简报内容（headline 级） | 水位 |
| --- | --- | --- | --- |
| A. DSH 其他工作区桶 | MEMORY.md / 近 5 天日志 / `handoff-*.md` 的 mtime | 「工作区 <名>：账本 ×1、日志 ×3 有更新 → 绝对路径」**不引内容** | 每文件 mtime |
| B. 其他 AI 工具记忆 | ExternalMemory 13 源的 md 文件 mtime | 「ZCode 记忆：N 个文件有更新 → 绝对路径」 | 每源最新 mtime |
| C. git 新提交（P1） | cwd 仓库 `git log --oneline -n 8 <lastSeenSha>..HEAD` | 短 SHA + subject + 相对时间，预算内截断 | lastSeen 短 SHA |

### 4.3 隐私与安全边界（承重设计，非可选）

- **链接模式，不灌内容**：A/B 类只报「哪里变了 + 绝对路径」，全文由模型用 read 按需取——与 external-memory 段现行纪律完全一致。理由是硬的：**其他工作区的记忆文件里可能存有凭据**（用户级 MEMORY.md 的既有惯例即如此），任何内容级摘录都可能把密钥带进另一个 agent 的 prompt。
- git subject 天然是 headline 级，但**提交前过一遍密钥模式过滤**（`ghp_/github_pat_/npm_/sk-/AKIA` 等命中即整行替换为 `[redacted]`），防止 commit message 里带密钥的场景。
- git 命令**只读**（log/rev-parse），`execFile` + timeout + 失败熔断（连续 N 次失败即静默停用本源，与 sidecar 看门狗同纪律）；无 `.git` ⇒ 静默跳过、零字节。

### 4.4 落点选择：新分区键（推荐） vs 欢迎槽拼接

| | 方案 A：新 PROMPT_SECTION 键 `global-brief`（推荐） | 方案 B：拼进 welcome-title/body 槽 |
| --- | --- | --- |
| 开关粒度 | 独立开关 + 独立预算（「一切皆开关」纪律的正统落点） | 无独立开关，跟暂离阈值绑定 |
| 触发 | 回归 + 新会话首轮（可分开配） | 只有暂离回归（新会话首轮覆盖不了） |
| 改动面 | PROMPT_SECTION_KEYS +1；client 镜像 DEFAULT_PROMPT_LAYERS_CLIENT 同步（**逐字一致纪律**）；设置页「注入分区」+1 开关；守卫 | 几乎零新键，但欢迎段语义被污染（寒暄 + 简报混装） |
| 估行数 | 约 +60（键/镜像/设置页） | 约 +10 |

**推荐 A**：B 省的行数会在「新会话首轮也想拿到简报」这个核心诉求上还回去，且混装违反「分区可关」的既有架构。P10 判据（「内容/行为」段、关掉不破坏结构）完全满足。

### 4.5 缓存纪律分析（为什么不动前缀缓存）

动态快照走 `systemPrompt.context()` 以 user-role 追加在**历史尾部**（index.js:13860-13862），每轮本来就是新增后缀，不回写旧消息 ⇒ 前缀缓存天然不破。简报段只在这一轮的后缀里多几百字，且「无新变化就不出现」⇒ 静默期零增量。唯一要遵守的是**段内不放假稳定时间戳**（教训：秒级时间戳击穿前缀缓存的旧案）；简报内容只在真有新变化时变，天然合规。

### 4.6 一次性交付语义

- 水位文件 `~/.dsh/memory/global-brief.json`（config-io 原子写），结构 `{ version, sources: { <srcId>: { kind, lastMtime|lastSha, seenAt } }, draft? }`。
- **首见建基线**：水位缺失的源第一次只记录不注入——否则新装用户会被一次性灌进全部历史变化（直接判死刑的细节）。
- **交付后推进**：草稿注入发生（pushPart 真实带上）后才推进水位；预算裁剪导致没带上 ⇒ 草稿保留下一轮再试（at-least-once，宁可重复不可丢失；模型侧无感）。
- 崩溃安全：水位与草稿同一 JSON，原子写，写失败 fail-soft 留旧值（最多重复注入一次简报，无害）。

## 5. 触发语义（拍板点 ②的默认建议）

- **暂离回归**：沿用 `awayMinutes`（回归第一轮注入）——用户原话的直接对应。
- **新会话首轮**：`agent/session-start` 后本会话第一次 renderMemoryDynamic 也注入——「切回 DSH 开始对话」常常是开新会话而非回归旧会话，只做回归会漏掉一半场景。
- 两处共用同一条「有无新变化」判定与同一份水位 ⇒ 没有变化时两处都静默。
- 无人值守：**保留注入但剥离寒暄**（与 welcome 相反）——无人值守任务恰恰更需要全局信息，简报是信息不是寒暄；这是与 welcome 剥离纪律的**有意分歧**，需拍板确认。

## 6. 分期与工作量

| 期 | 内容 | 估行数（lib + 接线 + 守卫） |
| --- | --- | --- |
| **P0 最小可信版** | `global-brief.js` 纯函数（水位对比 + 草稿构造 + headline 渲染 + 密钥过滤）；源 = A（DSH 桶，含账本）+ B（外部 md 源）；触发 = 回归 + 新会话首轮；落点 = 方案 A 新分区键全套接线；3 个配置键（`globalBriefEnabled` 默认 false / `globalBriefChars` 默认 1200 / 源细分子开关）；水位落盘 | ≈ 220-280 |
| **P1 +git** | C 源：execFile 只读 git 管道 + 熔断 + lastSeenSha 水位 + subject 过滤；多仓库留到 P2 | ≈ +80-120 |
| **P2 +远程** | team 通道补生产者（outbox.enqueue / pull 调度 / fetchJson），team-pull 下行条目作为简报候选经 team-inject 仲裁；GUI 弹窗联动（检出变化时提示打开记忆窗口）；多仓库/子模块 | ≈ +150-250 |

守卫清单（每期必备）：纯函数水位对比表驱动用例（首见建基线 / 交付后推进 / 预算裁剪保留草稿 / 无变化零字节）；密钥过滤反例；§7.3 CRLF 与 client 镜像逐字一致锁；PROMPT_SECTION 子集断言。

## 7. 纪律与风险

1. **client 镜像逐字一致**：新增 `snapshotGlobalBriefTitle/Body` 须与 `DEFAULT_PROMPT_LAYERS_CLIENT` 双侧同步（既有硬纪律，漂移=设置页显示与实际注入不符）。
2. **预算挤占**：简报是 normal 级，不得挤占 must（规则/白板更新请求）；`globalBriefChars` 独立预算，与 `injectBudgetChars` 走同一记账。
3. **fail-soft**：任何源失败只静默跳过该源（diag 留痕），绝不阻塞注入主链；git 不可用/无仓库 = 源不存在。
4. **多 agent 并发写水位**：同机多 DSH 实例会争写 global-brief.json——原子写保证不损坏，但可能互推水位造成漏报；P0 接受（同机多实例同时在线是少数场景），P2 可按 workspaceKey 分片水位。
5. **本预研未动任何代码**；实施前需 §8 拍板。

## 8. 开放问题（等拍板）

1. **agent 边界**：P1 只做 A（DSH 其他工作区）+ B（同机其他 AI 工具）+ C（git）？D（远程团队）留 P2？（建议：是）
2. **触发**：回归 + 新会话首轮双触发？（建议：是）；无人值守下保留简报（有意偏离 welcome 的剥离纪律）？（建议：保留）
3. **git 范围**：P1 只做 cwd 单仓库？（建议：是）
4. **内容深度**：维持「headline + 绝对路径」链接模式，不做内容摘录？（建议：是，凭据风险硬约束；若要账本「下一步」行级摘要，须配密钥模式过滤，放 P1.5）
5. **默认开关**：`globalBriefEnabled` 出厂默认 false（测试期惯例）还是 true？（建议：false，与自动接续同惯例，验证满意后翻回）
