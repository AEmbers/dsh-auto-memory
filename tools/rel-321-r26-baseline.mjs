/**
 * r26-cross-layer E3 基线放行：`lib/index.js` sha16 基线 → 本次新值。
 *
 * ★这不是「改绿」，是遵守该锁自己的约定：E3 的语义是
 *   「除**显式登记**的改动外，index.js 任何其他改动仍会被本锁抓住」——
 *   每次有意改动都要更新基线并写明理由（该文件注释里已有 R44→R46 的同款先例）。
 *   本轮改动**只有一处语义点**（见下），且已被 git diff 核实为 8 增 2 删。
 *
 * 放行理由：修「一键接续漂到别的工作区」的宿主半边 ——
 *   handoffPanelData 的刷新目标原先取 `currentSessionId() || recentSessionIdFallback()`，
 *   后者**跨所有工作区**扫 ~/.dsh/sessions/ 取全局最新 mtime、只返回裸 sessionId（不含工作区），
 *   于手动接续时可能把别的工作区的会话当刷新目标。改为「带了 sessionId 就用它，否则退回内存态」，
 *   并**移除跨工作区磁盘回退**（拿不到就返回空串，由客户端如实报告）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const F = 'D:/dsh-auto-memory/tests/smoke/smoke-test-r26-cross-layer.mjs'
const ok = (c, m) => { if (!c) throw new Error('断言失败: ' + m) }

let s = readFileSync(F, 'utf8')
const AX = 'D:/dsh-auto-memory/lib/index.js'
const now = createHash('sha256').update(readFileSync(AX)).digest('hex').slice(0, 16).toUpperCase()
const OLD = '52580CC7DA6C8490'

ok(s.split(OLD).length - 1 === 1, 'E3 旧基线锚点不是恰 1 次')
ok(now !== OLD, '基线未变化（index.js 没改？）')

// 1) 基线值 + 标签更新（保持单行结构）
s = s.replace(
  "eq(createHash('sha256').update(IX).digest('hex').slice(0, 16).toUpperCase(), '" + OLD + "', 'E3 ★宿主 lib/index.js 基线守恒（sha16 = R46 基线；R44→R47 放行 = 皮肤库路由 + teamE2E 重复键清理 + #142 保护面补真（childIds/liveSessionIds），理由见上）')",
  "eq(createHash('sha256').update(IX).digest('hex').slice(0, 16).toUpperCase(), '" + now + "', 'E3 ★宿主 lib/index.js 基线守恒（sha16 = R48 基线；R47→R48 放行 = 修「一键接续漂到别的工作区」宿主半边：handoffPanelData 不再跨工作区回退刷新目标，理由见上）')"
)
ok(s.includes("'" + now + "'"), 'E3 基线值未更新')

// 2) 注释补一行演进说明（照该文件既有体例）
const CM = '  // ★2026-09-28 基线演进 R44→R46：新增 skin-library-fetch 路由（用户第 1 大点·皮肤库机制，见 HANDBOOK §5.1）。'
ok(s.split(CM).length - 1 === 1, 'E3 注释锚点不是恰 1 次')
s = s.replace(CM, CM + '\n  // ★2026-09-28 基线演进 R47→R48：修「一键接续漂到别的工作区」——handoffPanelData 的刷新目标不再做跨工作区磁盘回退（原 recentSessionIdFallback 会返回别的工作区的会话）。')

ok(new RegExp(now).test(s), '写入后自检失败')
writeFileSync(F, s)
console.log('E3 基线已放行：' + OLD + ' → ' + now)
