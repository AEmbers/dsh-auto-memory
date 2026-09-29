#!/usr/bin/env node
/** R23 · 皮肤中心前端接线（SkinCenterPanel + SkinSlotRows + 取数单飞）。 */
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
const JS = readFileSync(join(ROOT, 'tools/snippets/r23-skin-center.txt'), 'utf8');
const CSS = readFileSync(join(ROOT, 'tools/snippets/r23-css.txt'), 'utf8');
const MEND = '    // ===================== S2-skin:end =====================';
let bad = 0; const chk = (n, ok) => { console.log((ok ? '  OK  ' : '  NG  ') + n); if (!ok) bad++ };
console.log('B0=' + sha16(raw) + ' | ' + Buffer.byteLength(raw, 'utf8') + 'B CRLF=' + cnt(raw, '\r\n'));
chk('① ★JS 锚（S2-skin:end）恰 1 行', cnt(raw, MEND) === 1);
chk('② ★片段不自带 end 标记（R21 教训）', cnt(JS, 'S2-skin:end') === 0);
chk('③ CSS 锚（dam-skin:end）恰 1 行', cnt(raw, '      // ================= dam-skin:end =================') === 1);
chk('④ 幂等前置：SkinCenterPanel 不存在', cnt(raw, 'function SkinCenterPanel') === 0);
chk('⑤ 幂等前置：useSkinCenter 不存在', cnt(raw, 'function useSkinCenter') === 0);
chk('⑥ 片段零 ES6', !/=>/.test(JS) && !/\b(const|let)\s/.test(JS));
chk('⑦ ★纪律一：片段零路径字面量', !/\.png|\.webp|assets\//.test(JS));
chk('⑧ 片段零裸色', !/#[0-9a-fA-F]{3,8}\b/.test(JS) && !/\brgba?\(/.test(JS));
chk('⑨ 片段零新增定时器', !/set(Interval|Timeout)\s*\(/.test(JS));
chk('⑩ ★复用既有 useTick（不造新钩子）', cnt(JS, 'useTick()') === 1 && cnt(raw, 'function useTick') === 1);
chk('⑪ ★不新增路由（片段内无 API. 新键）', !/API\.[a-zA-Z]+\s*=\s*'/.test(JS));
if (bad) { console.error('基线失败 ' + bad); process.exit(1) }

let out = raw;
out = out.replace(MEND, JS + '\r\n' + MEND);
out = out.replace('      // ================= dam-skin:end =================', CSS + '\r\n      // ================= dam-skin:end =================');
// ③ 把两个新组件挂进设置页皮肤分区（在既有预览卡之前，保持追加式）
const A3 = '          h(SkinSection, null),';
if (cnt(out, A3) !== 1) { console.error("锚③不唯一 " + cnt(out, A3)); process.exit(1) }
out = out.replace(A3, '          h(SkinCenterPanel, null),\r\n          h(SkinSlotRows, null),\r\n' + A3);

bad = 0;
chk('⑫ ★end 标记仍恰 1 处', cnt(out, MEND) === 1);
chk('⑬ ★两组件各 1 定义 + 1 调用', cnt(out, 'function SkinCenterPanel') === 1 && cnt(out, 'h(SkinCenterPanel,') === 1 && cnt(out, 'function SkinSlotRows') === 1 && cnt(out, 'h(SkinSlotRows,') === 1);
// ★期望值由**片段自身**派生（纪律三：不写死）：片段里 apiGet(API.state) 出现几次，产物就应 +几次。
const ADDED = cnt(JS, 'apiGet(API.state)');
chk('⑭ ★取数走既有 state（skinCenter 键 1 处读取 + apiGet 增量=' + ADDED + '）', cnt(out, 'd.skinCenter') === 1 && ADDED >= 1 && cnt(out, 'apiGet(API.state)') === cnt(raw, 'apiGet(API.state)') + ADDED);
chk('⑮ ★零新路由', cnt(out, 'API.skinCenter') === 0);
chk('⑯ 计数锁 MEMORY_TABS() 不变', (out.match(/(?<!function )MEMORY_TABS\(\)/g) || []).length === 2);
chk('⑰ region/block 锚不增不减', cnt(out, 'data-dam-region') === cnt(raw, 'data-dam-region') && cnt(out, 'data-dam-block') === cnt(raw, 'data-dam-block'));
chk('⑱ ★皮肤挂载点不引入 block 锚', !/data-dam-block/.test(JS) && !/data-dam-kind/.test(JS));
chk('⑲ 既有皮肤组件未被吞', ['function SkinImg','function SkinSection','function SkinSlot','function SkinEmpty','function SkinHero','function SkinBackdrop','function SkinSyncIllust'].every((x) => out.includes(x)));
chk('⑳ 设置页既有结构未被吞', out.includes('section(\'skin\', sectionLabels.skin,') && out.includes('section(\'about\', sectionLabels.about,'));
chk('㉑ 纯 CRLF', cnt(out, '\n') === cnt(out, '\r\n') && cnt(out, '\n') > 0);
chk('㉒ 尾部完整', out.endsWith('\r\n'));
const D = cnt(out, '\r\n') - cnt(raw, '\r\n');
chk('㉓ CRLF 增量合理（+' + D + '）', D > 60 && D < 300);
console.log('B1=' + sha16(out) + ' | ' + Buffer.byteLength(raw, 'utf8') + ' -> ' + Buffer.byteLength(out, 'utf8'));
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r23-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');