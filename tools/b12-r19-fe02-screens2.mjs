#!/usr/bin/env node
/** R19 · fe02 屏⑤–⑧（36 锚点）+ 15 个 f* i18n 双语 + 分色 CSS。 */
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
const JS = readFileSync(join(ROOT, 'tools/snippets/r19-screens-5-8.txt'), 'utf8');
const CSS = readFileSync(join(ROOT, 'tools/snippets/r19-css.txt'), 'utf8');
const I18N = readFileSync(join(ROOT, 'tools/snippets/r19-i18n.txt'), 'utf8').split('\n');
const ZH_ADD = I18N[0], EN_ADD = I18N[1];
const ANCH = {
  s5: ['skills','skill','skill-owner','skill-evidence','skill-steps','skill-approve','skill-reject','skill-edit'],
  s6: ['ledger','ledger-seg','ledger-chain','chain-node','chain-link','takeover'],
  s7: ['enable','server','id','member-name','sync-mode','sync-interval','scope-default','share-external','conflict-policy','attribution-show','skin-url','audit-show','test','test-result','leave'],
  s8: ['debug','debug-queue','debug-last','debug-errors','debug-cursor','debug-copy','debug-reset']
};
const NEED = Object.values(ANCH).reduce((a,b)=>a.concat(b), []);
const FKEYS = ['fTeamEnable','fTeamServer','fTeamId','fTeamMemberName','fTeamSyncMode','fTeamSyncInterval','fTeamScopeDefault','fTeamShareExternal','fTeamConflictPolicy','fTeamAttribution','fTeamSkin','fTeamAudit','fTeamTest','fTeamLeave'];
let bad = 0; const chk = (n, ok) => { console.log((ok?'  OK  ':'  NG  ')+n); if(!ok) bad++ };
console.log('B0=' + sha16(raw) + ' | ' + Buffer.byteLength(raw,'utf8') + 'B CRLF=' + cnt(raw,'\r\n'));
console.log('契约锚点（屏⑤–⑧）=' + NEED.length + ' | i18n 键=' + FKEYS.length);
chk('① JS 锚（L3-team:end）恰 1 行', cnt(raw, '    // ===================== L3-team:end =====================') === 1);
chk('② CSS 锚（dam-team:end）恰 1 行', cnt(raw, '      // ================= dam-team:end =================') === 1);
chk('③ zh i18n 锚（teamTab: 团队）恰 1 处', cnt(raw, "teamTab: '团队',") === 1);
chk('④ en i18n 锚（teamTab: Team）恰 1 处', cnt(raw, "teamTab: 'Team',") === 1);
chk('⑤ 幂等前置：data-dam-team-skills 不存在', cnt(raw, "'data-dam-team-skills'") === 0);
chk('⑥ 幂等前置：data-dam-team-debug 不存在', cnt(raw, "'data-dam-team-debug'") === 0);
chk('⑦ 幂等前置：fTeamEnable 不存在', cnt(raw, 'fTeamEnable') === 0);
chk('⑧ 片段零 ES6', !/=>/.test(JS) && !/\b(const|let)\s/.test(JS));
const ALLTXT = JS + CSS + ZH_ADD + EN_ADD;
const hslAll = ALLTXT.match(/hsla?\([^)]*\)/g) || [];
// ★度量口径取自权威扫描器（scan-appearance：只看裸 hex / 裸 rgba）。
// hsl 若含 var() 属「动态色」（契约 §5.3 逐字要求 hsl(var(--dam-team-actor-hue) 62% 52%)），不算裸色值。
chk('⑨a 零裸 hex', !/#[0-9a-fA-F]{3,8}\b/.test(ALLTXT));
chk('⑨b 零裸 rgba', !/\brgba?\(/.test(JS + CSS));
chk('⑨c hsl 全含 var()（动态色 ' + hslAll.length + ' 处）', hslAll.every((x) => x.indexOf('var(') !== -1));
chk('⑩ 片段零定时器', !/set(Interval|Timeout)\s*\(/.test(JS));
chk('⑪ 片段覆盖 36 锚点', NEED.every((n)=>new RegExp('data-dam-team-'+n+"'").test(JS)));
chk('⑫ i18n 片段含 ' + FKEYS.length + ' 键 × 2 段', FKEYS.every((k)=>ZH_ADD.includes(k+':') && EN_ADD.includes(k+':')));
if (bad) { console.error('基线失败 ' + bad); process.exit(1) }

let out = raw;
out = out.replace('      // ================= dam-team:end =================', CSS + '\r\n      // ================= dam-team:end =================');
out = out.replace('    // ===================== L3-team:end =====================', JS + '\r\n    // ===================== L3-team:end =====================');
out = out.replace("teamTab: '团队',", "teamTab: '团队'," + ZH_ADD);
out = out.replace("teamTab: 'Team',", "teamTab: 'Team'," + EN_ADD);
out = out.replace("h(TeamScreensR18, { team: team }))", "h(TeamScreensR18, { team: team }),\r\n        h(TeamScreensR19, { team: team }))");

bad = 0;
const GOT = NEED.filter((n)=>new RegExp('data-dam-team-'+n+"'").test(out));
chk('⑬ ★36 锚点全覆盖（' + GOT.length + '）', GOT.length === NEED.length);
chk('⑭ ★i18n 双语齐（zh+en 各 ' + FKEYS.length + '）', FKEYS.every((k)=>cnt(out, k+':') >= 2));
chk('⑮ ★既有值枚举锚点全在', ["'bar'","'tab'","'off'","'badge'","'settings-section'"].every((x)=>cnt(out, 'data-dam-team\': '+x) >= 1));
chk('⑯ ★计数锁 MEMORY_TABS() 调用数不变', (out.match(/(?<!function )MEMORY_TABS\(\)/g)||[]).length === 2 && (raw.match(/(?<!function )MEMORY_TABS\(\)/g)||[]).length === 2);
chk('⑰ ★data-dam-region 不增不减（' + cnt(raw,'data-dam-region') + '）', cnt(out,'data-dam-region') === cnt(raw,'data-dam-region'));
chk('⑱ 既有 L3/R18 函数未被吞（抽样 6）', ['function TeamTab','function TeamStatusBar','function TeamSyncStatusBar','function TeamConflictScreen','function fetchTeamState','function renderTeamSettings'].every((x)=>out.includes(x)));
chk('⑲ 新函数齐（6）', ['function TeamSkillsScreen','function TeamLedgerScreen','function TeamDebugPanel','function TeamScreensR19','function renderTeamSettings15','function teamActorHue'].every((x)=>out.includes(x)));
chk('⑳ 接线点恰 1 处', cnt(out, 'h(TeamScreensR19, { team: team })') === 1);
chk('㉑ 纯 CRLF', cnt(out,'\n') === cnt(out,'\r\n') && cnt(out,'\n') > 0);
chk('㉒ 尾部完整', out.endsWith('\r\n'));
const D = cnt(out,'\r\n') - cnt(raw,'\r\n');
chk('㉓ CRLF 增量合理（+' + D + '）', D > 100 && D < 400);
console.log('B1=' + sha16(out) + ' | ' + Buffer.byteLength(raw,'utf8') + ' -> ' + Buffer.byteLength(out,'utf8'));
if (bad) { console.error('NG ' + bad); process.exit(1) }
if (!APPLY) { console.log('（--dry 完成，未写盘）'); process.exit(0) }
copyFileSync(SRC, SRC + '.bak-r19-' + Date.now());
writeFileSync(SRC, out, 'utf8');
console.log('已写盘（含备份）');