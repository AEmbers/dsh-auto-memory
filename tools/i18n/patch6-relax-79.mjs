/**
 * 放宽 l3-team §7.9：原断言写死「两处 teamTab（zh + en）」⇒ 加 ja 后恒红。
 * 原意是「每种语言都提供了 teamTab」——改为逐语言校验非空（语言数无关）。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const P = 'D:/dsh-auto-memory/tests/smoke/smoke-test-l3-team.mjs'
let s = readFileSync(P, 'utf8')

const OLD = `  eq(TEAM_LABELS.length, 2, '§7.9 ★i18n 两处 teamTab 都在（zh + en）')`
const NEW = `  // ★2026-09-28 放宽为**语言数无关**：原断言写死「两处（zh + en）」，加 ja 后恒红。
  //   原意是「每种语言都提供了 teamTab」，改为逐语言校验非空即可。
  ok(TEAM_LABELS.length >= 2 && TEAM_LABELS.every(function (v) { return typeof v === 'string' && v.length > 0 }),
    '§7.9 ★每种语言都提供 teamTab（语言数无关，实测 ' + TEAM_LABELS.length + ' 种：' + TEAM_LABELS.join(' / ') + '）')`

const n = s.split(OLD).length - 1
if (n !== 1) throw new Error('锚点命中 ' + n + ' 次（期望 1）')
s = s.replace(OLD, NEW)
writeFileSync(P, s)
console.log('§7.9 已放宽为语言数无关')
