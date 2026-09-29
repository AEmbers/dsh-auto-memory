/**
 * r26-cross-layer E3 基线放行（第二步：仅补注释演进说明）。
 * 第一步（基线值替换）已在上一轮生效 —— 本脚本幂等。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const F = 'D:/dsh-auto-memory/tests/smoke/smoke-test-r26-cross-layer.mjs'
const AX = 'D:/dsh-auto-memory/lib/index.js'
const ok = (c, m) => { if (!c) throw new Error('断言失败: ' + m) }

const now = createHash('sha256').update(readFileSync(AX)).digest('hex').slice(0, 16).toUpperCase()
let s = readFileSync(F, 'utf8')

// 1) 基线值（幂等）
ok(s.includes("'" + now + "'"), 'E3 基线值尚未指向当前 index.js（第一步未生效）')
ok(!s.includes("'52580CC7DA6C8490'"), '旧基线值仍在')
console.log('E3 基线值 = ' + now + '（已生效）')

// 2) 注释演进说明（幂等）
const MARK = '// ★2026-09-28 基线演进 R47→R48'
if (s.includes(MARK)) {
  console.log('E3 注释演进说明已存在，跳过')
} else {
  // 锚点无行首缩进（实测原文如此）
  const CM = '// ★2026-09-28 基线演进 R44→R46：新增 skin-library-fetch 路由（用户第 1 大点·皮肤库机制，见 HANDBOOK §5.1）。'
  const n = s.split(CM).length - 1
  ok(n === 1, 'E3 注释锚点命中 ' + n + ' 次（期望 1）')
  s = s.replace(CM, CM + '\n// ★2026-09-28 基线演进 R47→R48：修「一键接续漂到别的工作区」——handoffPanelData 的刷新目标不再跨工作区磁盘回退（原 recentSessionIdFallback 会返回别的工作区的会话，致新会话落到错误 Workspace）。')
  writeFileSync(F, s)
  console.log('E3 注释演进说明已补')
}

// 3) 自检
const t = readFileSync(F, 'utf8')
ok(t.includes(MARK), '注释未写入')
ok(t.includes("'" + now + "'"), '基线值丢失')
console.log('完成')
