# 皮肤库（skins/）

本目录是 dsh-auto-memory 的**皮肤库**：所有可用皮肤都以「一个子目录 = 一套皮肤」的形式放在这里，开发者通过 Pull Request 投稿。

> 完整开发指南：[docs/SKIN-GUIDE.md](../docs/SKIN-GUIDE.md)（三层 key 体系 / token 全表 / 验收纪律）

## 目录结构（一套皮肤）

```
skins/<皮肤名>/
  theme.json    ← 必需。token 定义（与 CSS 同源，单一事实）
  skin.css      ← 可选。追加样式规则（含 @import/外链会被整段拒绝）
  README.md     ← 可选。皮肤说明、作者、截图
```

## 内置皮肤

| 目录 | 显示名 | 状态 | 说明 |
|---|---|---|---|
| `classic/` | 正式版（经典） | 稳定 | 出厂默认（深色、信息密集）。theme.json 保持出厂值，**不要改**——它是所有皮肤的基线。 |
| `v4/` | 开发版（新款） | 开发中 | 按客户概念图实现的新皮肤，仍在开发。 |

## 投稿流程（PR）

1. Fork 本仓库，在 `skins/` 下新建 `<你的皮肤名>/`（名字用 `[\w.-]`，建议全小写）。
2. 写 `theme.json`：`schemaVersion: 1` + `tokens` 里覆盖你想改的键（**只写要改的**，其余继承）。
3. （可选）写 `skin.css`：只允许选择器以 `[data-dam-` 或 `[data-dam-skin-` 开头，禁止 `@import`/外链/`url(`。
4. 本地验证：把皮肤目录拷到 `~/.dsh/memory/skins/<皮肤名>/`，在插件 **设置 → 皮肤选择** 里选中它，确认无报错（面板会显示 token 合成层与告警）。
5. 提 PR 到本仓库 `skins/` 目录。评审看两件事：**验收纪律全绿**（见 SKIN-GUIDE §10）+ 不破坏既有 token 语义。

## 用户如何获取

- **在线**：插件 **设置 → 皮肤选择 → 从皮肤库获取（GitHub）**，填 `owner/repo`（默认 `Aik358/dsh-auto-memory`）→「列出皮肤」→ 填名字 →「安装」。
- **手动**：把皮肤目录拷到 `~/.dsh/memory/skins/<皮肤名>/` 即可（重启/重开设置页后出现在选择器里）。
- **团队**：把皮肤放到 `~/.dsh/memory/skins/team-<teamId>/`，它会作为团队层覆盖个人选择（团队 > 用户 > 内置）。

## 层级与优先级（宿主三层扫描，12 卷 §二）

```
团队层  ~/.dsh/memory/skins/team-<teamId>/     ← 最高
用户层  ~/.dsh/memory/skins/<name>/
内置层  skins/（随插件发布）                     ← 最低
```

后加载者胜出（逐 token 合成）；冲突会在皮肤中心面板给出提示，不静默。

## 安全与边界

- 安装路由 loopback-only；仓库坐标/皮肤名双正则；只抓 `theme.json` / `skin.css` / `README.md` 三个文件；单文件 ≤ 256KB。
- `skin.css` 含 `@import`/`http(s)://`/`url(` 一律整段拒绝（防外链与追踪）。
- 未知 `schemaVersion` 整包拒绝；单个非法 token 只忽略该项 —— **fail-closed，皮肤永远不能让插件不可用**。
