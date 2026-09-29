#!/usr/bin/env node
/** R22 · bg.mindmap（导图画布背景）+ illust.sync（同步状态条）+ 深浅色自动跟随（53 卷）。 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'lib', 'client.js');
const APPLY = process.argv.includes('--apply');
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16).toUpperCase();
const cnt = (s, x) => s.split(x).length - 1;
const raw = readFileSync(SRC, 'utf8');
const JS = readFileSync(join(ROOT, 'tools/snippets/r22-skin-mount-b.txt'), 'utf8');
const CSS = readFileSync(join(ROOT, 'tools/snippets/r22-css.txt'), 'utf8');
const MEND = '    // ===================== S2-skin:end =====================';
let bad = 0; const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ };
console.log('B0=' + sha16(raw) + ' | ' + Buffer.byteLength(raw, 'utf8') + 'B CRLF=' + cnt(raw, '\r\n'));
chk('① ★JS 锚（S2-skin:end）恰 1 行', cnt(raw, MEND) === 1);
chk('② ★片段不自带 end 标记（R21 遗留教训）', cnt(JS, 'S2-skin:end') === 0);
chk('③ CSS 锚（dam-skin:end）恰 1 行', cnt(raw, '      // ================= dam-skin:end =================') === 1);
chk('④ 幂等前置：SkinBackdrop 不存在', cnt(raw, 'function SkinBackdrop') === 0);
chk('⑤ 幂等前置：useDeepTheme 不存在', cnt(raw, 'function useDeepTheme') === 0);
chk('⑥ 导图画布锚恰 1', cnt(raw, "'data-dam-graph': ''") === 1);
chk('⑦ 同步条锚恰 1', cnt(raw, "'data-dam-team': 'bar'") === 1);
chk('⑧ 片段零 ES6', !/=>/.test(JS) && !/\b(const|let)\s/.test(JS));
chk('⑨ ★纪律一：片段零路径字面量', !/\.png|\.webp/.test(JS));
chk('⑩ 片段零裸色', !/#[0-9a-fA-F]{3,8}\b/.test(JS) && !/\brgba?\(/.test(JS) && !/\bhsla?\(/.test(JS));
chk('⑪ 片段零定时器（用 MutationObserver 非定时器）', !/set(Interval|Timeout)\s*\(/.test(JS));
if (bad) { console.error('基线失败 ' + bad); process.exit(1) }

let out = raw;
// ① 新段插在唯一 MEND 之前（片段不带标记 ⇒ 不产生第二处）
out = out.replace(MEND, JS + '\r\n' + MEND);
// ② CSS
out = out.replace('      // ================= dam-skin:end =================', CSS + '\r\n      // ================= dam-skin:end =================');
// ③ bg.mindmap 挂到导图画布（首位子节点 ⇒ 作为背景层）
out = out.replace("return h('div', { 'data-dam-graph': '',", "return h('div', { 'data-dam-graph': '',");
out = out.replace("        h('svg', { viewBox: '0 0 ' + width + ' ' + height,",
  "        h(SkinBackdrop, { slot: 'bg.mindmap' }),\r\n        h('svg', { viewBox: '0 0 ' + width + ' ' + height,");
// ④ illust.sync 挂到同步状态条（首位子节点）
out = out.replace("        h('span', { 'data-dam-team': 'member' }, who),",
  "        h(SkinSyncIllust, {}),\r\n        h('span', { 'data-dam-team': 'member' }, who),");

bad = 0;
chk('⑫ ★end 标记仍恰 1 处', cnt(out, MEND) === 1);
chk('⑬ ★bg.mindmap 真实挂载（SkinBackdrop 调用 = 1）', cnt(out, 'h(SkinBackdrop,') === 1);
chk('⑭ ★illust.sync 真实挂载（SkinSyncIllust 调用 = 1）', cnt(out, 'h(SkinSyncIllust,') === 1);
chk('⑮ ★背景层可交互穿透（pointerEvents none）', out.includes("pointerEvents: 'none'"));
chk('⑯ ★深色底 token（53 卷可读性前提）', out.includes('dam-bg-deep'));
chk('⑰ ★深浅色自动跟随（readHostDeep + useDeepTheme）', cnt(out, 'function readHostDeep') === 1 && cnt(out, 'function useDeepTheme') === 1);
chk('⑱ ★fail-safe：拿不到主题 ⇒ 回浅色', /function readHostDeep[\s\S]{0,400}return false/.test(out));
chk('⑲ 计数锁 MEMORY_TABS() 不变', (out.match(/(?<!function )MEMORY_TABS\(\)/g) || []).length === 2);
chk('⑳ data-dam-region / block 锚不增不减', cnt(out, 'data-dam-region') === cnt(raw, 'data-dam-region') && cnt(out, 'data-dam-block') === cnt(raw, 'data-dam-block'));
chk('㉑ 既有皮肤组件未被吞', ['function SkinImg', 'function SkinSection', 'function SkinSlot', 'function SkinEmpty', 'function SkinHero'].every((x) => out.includes(x)));
chk('㉒ 既有导图/同步条结构未被吞', ["h('svg', { viewBox", "'data-dam-team': 'member'", "'data-dam-team': 'synced'"].every((x) => out.includes(x)));
chk('㉓ 纯 CRLF', cnt(out, '\n') === cnt(out, '\r\n') && cnt(out, '\n') > 0);
chk('㉔ 尾部完整', out.endsWith('\r\n'));
const D = cnt(out, '\r\n') - cnt(raw, '\r\n');
chk('㉕ CRLF 增量合理（+' + D + '）', D > 40 && D < 200);
console.log('B1=' + sha16(out) + ' | ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(out, 'utf8'));
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r22-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');