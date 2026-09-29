
import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'D:/dsh-auto-memory'
const FILE = path.join(ROOT, 'lib/index.js')
const DRY = process.argv.includes('--dry')

let text = fs.readFileSync(FILE, 'utf8')
const before = text.length
const beforeSha = (await import('node:crypto')).createHash('sha256').update(text).digest('hex').slice(0, 16).toUpperCase()

const PASS = []
const FAIL = []
function ck(name, cond, extra) { (cond ? PASS : FAIL).push(name + (extra ? ' :: ' + extra : '')) }

// ---------- 补丁点 1：import ----------
const IMP_ANCHOR = "import { createTeamMerge } from './team-merge.js'"
ck('1.0 找到 import 锚点', text.includes(IMP_ANCHOR))
const IMP_NEW = IMP_ANCHOR + "\r\n// ★Teamwork B12（37 卷 §1 第一必做项）：条目级「谁编辑了」旁挂索引。纯内存，落盘由原子写负责。\r\nimport { createTeamAttribution, TEAM_ATTRIBUTION_FILE } from './team-attribution.js'"
if (!text.includes('team-attribution.js')) text = text.replace(IMP_ANCHOR, IMP_NEW)

// ---------- 补丁点 2：实例化（挂在 _teamMerge 之后） ----------
const INST_ANCHOR = "        diag: (m) => diagThrottled('team-merge', m),\r\n      })"
ck('2.0 找到实例化锚点', text.includes(INST_ANCHOR))
const INST_NEW = INST_ANCHOR + "\r\n      // ★B12 · 37 卷 §1：归属旁挂索引。**落盘与 _teamMerge 同级**（数据目录 / team-attribution.json）。\r\n      //  · teamEnabled=false 时**根本不构造**（外层 if 已保证），且模块内部再短路一次（双保险）。\r\n      //  · onChange ⇒ 原子写：只在条目真变化时落盘，避免空写。\r\n      engine._teamAttributionPath = path.join(dshStateDir(), TEAM_ATTRIBUTION_FILE)\r\n      engine._teamAttribution = createTeamAttribution({\r\n        teamEnabled: engine.config.teamEnabled === true,\r\n        max: 2000,\r\n        onChange: function () { engine._teamAttributionDirty = true },\r\n      })"
if (!text.includes('engine._teamAttribution = createTeamAttribution')) text = text.replace(INST_ANCHOR, INST_NEW)

// ---------- 补丁点 3：fail-soft 置空 ----------
const NULL_ANCHOR = "      engine._teamMerge = null"
ck('3.0 找到 fail-soft 锚点', text.includes(NULL_ANCHOR))
if (!text.includes('engine._teamAttribution = null')) {
  text = text.replace(NULL_ANCHOR, NULL_ANCHOR + "\r\n      engine._teamAttribution = null\r\n      engine._teamAttributionPath = null\r\n      engine._teamAttributionDirty = false")
}

// ---------- 守恒 ----------
ck('C1 只增不减（长度增大）', text.length > before, `${before} -> ${text.length}`)
ck('C2 裸 LF 仍为 0', (text.match(/(?<!\r)\n/g) || []).length === 0)
ck('C3 import 恰好 1 处', (text.match(/from '\.\/team-attribution\.js'/g) || []).length === 1)
ck('C4 实例化恰好 1 处', (text.match(/createTeamAttribution\(/g) || []).length === 1)
ck('C5 锚点总数不减', (text.match(/data-dam-/g) || []).length >= 1185)

console.log('=== 补丁点检查 ===')
for (const p of PASS) console.log('  PASS ' + p)
for (const f of FAIL) console.log('  FAIL ' + f)
console.log(`\nbefore=${before} B  after=${text.length} B  delta=+${text.length - before}`)

if (DRY) {
  console.log('\n[dry] 未写盘。全绿=' + (FAIL.length === 0))
  console.log('\n=== ★dry 也跑到最后一条守恒断言（教训：dry 必须覆盖到末尾）===')
  process.exit(0)
}

if (FAIL.length) { console.error('\n有断言失败，拒绝写盘'); process.exit(1) }
fs.writeFileSync(FILE, text, 'utf8')
const after = fs.readFileSync(FILE, 'utf8')
const afterSha = (await import('node:crypto')).createHash('sha256').update(after).digest('hex').slice(0, 16).toUpperCase()
console.log(`\n[apply] 已写盘  ${before} -> ${after.length} B  sha ${beforeSha} -> ${afterSha}`)
