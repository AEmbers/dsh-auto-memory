#!/usr/bin/env node
/**
 * R18 · fe02 八屏契约补完 A（屏①–④）。
 *
 * 权威：docs/teamwork-impl/frontend/02-团队版前端契约.md（448 行）§2/§3/§4/§5.1 + §8.1 追加式 + §8.3 三条自证。
 * 形态裁定：新增锚点一律用契约逐字的独立属性名 data-dam-team-<name>；
 *           既有 24 个值枚举锚点（data-dam-team="xxx"）保留不动。
 *
 * 三条不变量（工具内硬断言）：① 追加式（锚点前的字节逐字节不变）② 零 ES6 ③ 零字面色值。
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'lib', 'client.js')
const APPLY = process.argv.includes('--apply')
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16).toUpperCase()
const raw = readFileSync(SRC, 'utf8')
const JS = readFileSync(join(ROOT, 'tools', 'snippets', 'r18-screens-1-4.txt'), 'utf8');
const CSS = readFileSync(join(ROOT, 'tools', 'snippets', 'r18-css.txt'), 'utf8');

// fe02 屏①–④ 锚点清单（逐屏抄自契约表，不凭记忆）
const ANCHORS = {
  screen1: ['statusbar', 'state', 'queue', 'lastsync', 'conflict-badge', 'pause'],
  screen2: ['members', 'member', 'member-self', 'presence', 'presence-dot', 'member-filter'],
  screen3: ['filterbar', 'filter-author', 'filter-source', 'filter-sync', 'badge', 'badge-scope'],
  screen4: ['conflicts', 'conflict', 'conflict-head', 'diff', 'diff-local', 'diff-remote', 'diff-line', 'verdict', 'verdict-keep-local', 'verdict-keep-remote', 'verdict-merge', 'verdict-ask'],
};
const NEED = Object.values(ANCHORS).reduce((a, b) => a.concat(b), []);

/* ── 锚点定位（全部由源码派生）──────────────────────────────── */
const JS_ANCHOR = '    // ===================== L3-team:end =====================';
const CSS_ANCHOR = '      // ================= dam-team:end =================';
const WIRE_ANCHOR = 'h(ConflictCenter, { items: [] }))';
let bad = 0;
const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ };
const cnt = (s, sub) => s.split(sub).length - 1;
console.log('B0 = ' + sha16(raw) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' | CRLF ' + cnt(raw, '\r\n'));
console.log('契约锚点需求（屏①–④）= ' + NEED.length + ' 个');
chk('① JS 锚（L3-team:end）恰 1 行', cnt(raw, JS_ANCHOR) === 1);
chk('② CSS 锚（dam-team:end）恰 1 行', cnt(raw, CSS_ANCHOR) === 1);
chk('③ 接线锚（ConflictCenter 空 items）恰 1 处', cnt(raw, WIRE_ANCHOR) === 1);
// ★幂等前置：对「进入脚本时的原始快照」判定
chk('④ 幂等前置：data-dam-team-statusbar 尚不存在', cnt(raw, 'data-dam-team-statusbar') === 0);
chk('⑤ 幂等前置：data-dam-team-conflicts 尚不存在', cnt(raw, 'data-dam-team-conflicts') === 0);
// 片段自身质量（三条不变量）
chk('⑥ 片段零 ES6（无 => / const / let）', !/=>/.test(JS) && !/\b(const|let)\s/.test(JS));
chk('⑦ 片段零字面色值', !/#[0-9a-fA-F]{3,8}/.test(JS + CSS) && !/\brgba?\(/.test(JS + CSS) && !/\bhsla?\(/.test(JS + CSS));
chk('⑧ CSS 片段零 setInterval/setTimeout（契约 §2）', !/set(Interval|Timeout)\s*\(/.test(JS));
const META = NEED.filter((n) => new RegExp('data-dam-team-' + n + "'").test(JS));
chk('⑨ 片段覆盖全部 ' + NEED.length + ' 个契约锚点（实测 ' + META.length + '）', META.length === NEED.length);
if (bad) { console.error('基线失败 ' + bad); process.exit(1) }

/* ── 组装（三处插入，互不重叠）────────────────────────────── */
let out = raw;
out = out.replace(CSS_ANCHOR, CSS + '\r\n' + CSS_ANCHOR);
out = out.replace(JS_ANCHOR, JS + '\r\n' + JS_ANCHOR);
out = out.replace(WIRE_ANCHOR, 'h(ConflictCenter, { items: [] }),\r\n        h(TeamScreensR18, { team: team }))');

/* ── 落盘前断言 ──────────────────────────────────────────── */
bad = 0;
const after = out;
const GOT = NEED.filter((n) => new RegExp('data-dam-team-' + n + "'").test(after));
chk('⑩ ★契约锚点全覆盖 ' + GOT.length + '/' + NEED.length + '（新增 ' + cnt(after, 'data-dam-team-statusbar') + ' 处 statusbar）', GOT.length === NEED.length);
chk('⑪ ★追加式：既有 24 个值枚举锚点全在', ["'bar'", "'tab'", "'off'", "'badge'", "'conflict-center'", "'settings-section'", "'attr-row'"].every((x) => cnt(after, 'data-dam-team\': ' + x) >= 1));
// ★度量口径取自权威实现（面板守卫 L43 的负向后视正则），不手写数字（第 3/10 条纪律）
const TABS_RE = /(?<!function )MEMORY_TABS\(\)/g;
const tabsOf = (s) => (s.match(TABS_RE) || []).length;
chk('⑫ ★计数锁：MEMORY_TABS() 调用数 ' + tabsOf(raw) + ' -> ' + tabsOf(after) + '（面板守卫口径）', tabsOf(after) === tabsOf(raw) && tabsOf(raw) === 2);
// ★结构锚守恒：从原始快照派生基线（13 是唯一区域名数，不是全文出现数）
chk('⑬ ★data-dam-region 出现数不增不减（' + cnt(raw, 'data-dam-region') + '）', cnt(after, 'data-dam-region') === cnt(raw, 'data-dam-region'));
chk('⑬b ★data-dam-slot 不降（' + cnt(raw, 'data-dam-slot') + ' -> ' + cnt(after, 'data-dam-slot') + '）', cnt(after, 'data-dam-slot') >= cnt(raw, 'data-dam-slot'));
chk('⑭ 既有 L3 函数未被吞（抽样 5）', ['function TeamStatusBar', 'function TeamBadge', 'function ConflictCenter', 'function useTeamTick', 'function TeamTab'].every((x) => after.includes(x)));
chk('⑮ 新函数齐（6 个）', ['function TeamSyncStatusBar', 'function TeamMembersScreen', 'function TeamFilterBar', 'function TeamBadgeScoped', 'function TeamConflictScreen', 'function TeamScreensR18'].every((x) => after.includes(x)));
chk('⑯ 接线点恰 1 处', cnt(after, 'h(TeamScreensR18, { team: team })') === 1);
chk('⑰ 裸 LF = 0（仍纯 CRLF）', cnt(after, '\n') === cnt(after, '\r\n'));
chk('⑱ 尾部完整', after.endsWith('\r\n'));
const D = cnt(after, '\r\n') - cnt(raw, '\r\n');
const N = cnt(JS, '\n') - 1 + 1;
chk('⑲ CRLF 增量 = 新增行数（实测 +' + D + '）', D > 60 && D < 260);
console.log('B1 = ' + sha16(after) + ' | bytes ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(after, 'utf8'));
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r18-' + Date.now());
writeFileSync(SRC, after, 'utf8');
console.log('已写盘（含备份）');