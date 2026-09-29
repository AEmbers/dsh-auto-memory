#!/usr/bin/env node
/** R21 · 6 槽位真实页面挂载（12 卷 §二/§四）。三处挂载：refine 空态 / hub 技能空态 / stats 空态 + hero。 */
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
const JS = readFileSync(join(ROOT, 'tools/snippets/r21-skin-mount.txt'), 'utf8');
const CSS = readFileSync(join(ROOT, 'tools/snippets/r21-css.txt'), 'utf8');
let bad = 0; const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ };
console.log('B0=' + sha16(raw) + ' | ' + Buffer.byteLength(raw, 'utf8') + 'B CRLF=' + cnt(raw, '\r\n'));
chk('① JS 锚（S2-skin:end）恰 1 行', cnt(raw, '    // ===================== S2-skin:end =====================') === 1);
chk('② CSS 锚（dam-skin:end）恰 1 行', cnt(raw, '      // ================= dam-skin:end =================') === 1);
chk('③ 幂等前置：SkinSlot 不存在', cnt(raw, 'function SkinSlot') === 0);
chk('④ 幂等前置：dam-skin-slot 不存在', cnt(raw, "'data-dam-skin-slot'") === 0);
chk('⑤ refine 空态锚恰 1', cnt(raw, "h('div', { style: { opacity: .65 } }, t('refineEmpty'))") === 1);
chk('⑥ hub 空态锚恰 1', /h\('div', \{ 'data-dam-content': '' \}, t\('hubSkillsEmpty'\)\)/.test(raw));
chk('⑦ stats 空态锚恰 1', cnt(raw, "if (!data.enabled) return h(Card, { title: t('statsTitle') }, h('div', { style: { opacity: .75 } }, t('statsEmpty')))") === 1);
chk('⑧ 片段零 ES6', !/=>/.test(JS) && !/\b(const|let)\s/.test(JS));
chk('⑨ ★纪律一：片段零路径字面量', !/\.png|\.webp/.test(JS));
chk('⑩ 片段/CSS 零裸色', !/#[0-9a-fA-F]{3,8}\b/.test(JS + CSS) && !/\brgba?\(/.test(JS + CSS) && !/\bhsla?\(/.test(JS + CSS));
chk('⑪ 片段零定时器', !/set(Interval|Timeout)\s*\(/.test(JS));
chk('⑫ ★旧锚三处在 raw 中可定位', ['refineEmpty', 'hubSkillsEmpty', 'statsEmpty'].every((k) => cnt(raw, "t('" + k + "')") >= 1));
if (bad) { console.error('基线失败 ' + bad); process.exit(1) }

let out = raw;
// ① 新段插在 S2-skin:end 之前
out = out.replace('    // ===================== S2-skin:end =====================', JS + '\r\n    // ===================== S2-skin:end =====================');
// ② CSS 段
out = out.replace('      // ================= dam-skin:end =================', CSS + '\r\n      // ================= dam-skin:end =================');
// ③ 三处真实挂载（保留原文案，只在文案前追加图 —— 追加式，零删除）
out = out.replace("if (!data.length) return h('div', { style: { opacity: .65 } }, t('refineEmpty'))",
  "if (!data.length) return h('div', { style: { opacity: .65 } }, h(SkinEmpty, { slot: 'empty.recall', size: skinSlotSize('empty.recall') }, t('refineEmpty')))");
out = out.replace("h('div', { 'data-dam-content': '' }, t('hubSkillsEmpty'))",
  "h('div', { 'data-dam-content': '' }, h(SkinEmpty, { slot: 'empty.library', size: skinSlotSize('empty.library') }, t('hubSkillsEmpty')))");
out = out.replace("return h(Card, { title: t('statsTitle') }, h('div', { style: { opacity: .75 } }, t('statsEmpty')))",
  "return h(Card, { title: t('statsTitle') }, h('div', { style: { opacity: .75 } }, h(SkinEmpty, { slot: 'empty.timeline', size: skinSlotSize('empty.timeline') }, t('statsEmpty'))))");

bad = 0;
chk('⑬ ★三处挂载真落地（SkinEmpty 调用 = 3）', cnt(out, 'h(SkinEmpty,') === 3);
chk('⑭ ★原文案全在（refine/hub/stats）', ['refineEmpty', 'hubSkillsEmpty', 'statsEmpty'].every((k) => cnt(out, "t('" + k + "')") >= 1));
chk('⑮ ★hero 挂载表达存在', cnt(out, 'h(SkinHero,') >= 1 || out.includes('function SkinHero'));
chk('⑯ ★纪律一：新段零路径字面量', !/\.png|\.webp/.test(out.slice(out.indexOf('R21 皮肤视觉重构 A'), out.indexOf('// ===================== S2-skin:end'))));
chk('⑰ ★计数锁 MEMORY_TABS() 不变', (out.match(/(?<!function )MEMORY_TABS\(\)/g) || []).length === 2 && (raw.match(/(?<!function )MEMORY_TABS\(\)/g) || []).length === 2);
chk('⑱ ★data-dam-region 不增不减', cnt(out, 'data-dam-region') === cnt(raw, 'data-dam-region'));
chk('⑲ 既有皮肤组件未被吞', ['function SkinImg', 'function SkinSection', 'function skinAssetUrl', 'var SKIN_SLOT_KEYS'].every((x) => out.includes(x)));
chk('⑳ 新函数齐（4）', ['function SkinSlot', 'function SkinEmpty', 'function SkinHero', 'function skinSlotSize'].every((x) => out.includes(x)));
chk('㉑ 纯 CRLF', cnt(out, '\n') === cnt(out, '\r\n') && cnt(out, '\n') > 0);
chk('㉒ 尾部完整', out.endsWith('\r\n'));
const D = cnt(out, '\r\n') - cnt(raw, '\r\n');
chk('㉓ CRLF 增量合理（+' + D + '）', D > 40 && D < 200);
console.log('B1=' + sha16(out) + ' | ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(out, 'utf8'));
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r21-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');