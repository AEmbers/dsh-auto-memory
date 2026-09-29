// tools/verify-layout-schema.mjs
// L2 布局 schema 验收器（B12 · 前端结构层）
// 依据：docs/teamwork-impl/28-B12前端拟合第二轮素材.md §3（region 7 / slot 18 / blockKind 10 / authorSurface 5）
//       docs/teamwork-impl/37-B12开工必读清单.md §3.1-3.3（命名纪律）
// 纪律：CR-10 —— 真读文件、真断言返回值、每条验收带负路径、输出可复算物理量、全绿才 exit 0。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const SCHEMA_PATH = path.join(REPO, 'docs', 'teamwork-impl', 'frontend', 'layout-schema-v1.json');
const ANCHORS_PATH = path.join(REPO, 'docs', 'teamwork-impl', 'frontend', '_gen', 'anchors.json');

// 28 卷 §3.2 / §3.3 的原始名单（逐字抄录，用于「不许改名」的守恒断言）
const EXPECTED_REGIONS = ['page', 'float', 'page-nav', 'settings', 'dialog', 'sidebar-entry', 'overlay'];
const EXPECTED_SLOTS = ['head', 'actions', 'nav', 'summary', 'list', 'timeline', 'board', 'graph',
  'calendar', 'detail', 'chart', 'stats-row', 'badge', 'hint', 'form', 'footer', 'empty', 'chart-legend'];
const EXPECTED_BLOCK_KINDS = ['badge', 'list', 'timeline', 'chart', 'stat', 'actions', 'form', 'prose', 'media', 'empty'];
const EXPECTED_AUTHOR_SURFACE = ['reorder', 'resize', 'visibility', 'aesthetics', 'imagery'];
const WILDCARD = '*';

let pass = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS  ' + name + (detail ? '  [' + detail + ']' : '')); }
  else { fails.push(name); console.log('FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
  return ok;
}

console.log('== dam-l2-layout/v1 验收 ==');
console.log('schema : ' + SCHEMA_PATH);
console.log('anchors: ' + ANCHORS_PATH);

// ---------- 0. 真读文件 ----------
const schemaBuf = fs.readFileSync(SCHEMA_PATH);
const schemaText = schemaBuf.toString('utf8');
const anchorsBuf = fs.readFileSync(ANCHORS_PATH);

let schema = null;
try { schema = JSON.parse(schemaText); } catch (e) { /* 下面断言报红 */ }
check('0.1 layout-schema-v1.json 存在且可 JSON.parse', schema !== null, schema ? 'ok' : 'parse failed');

let anchors = null;
try { anchors = JSON.parse(anchorsBuf.toString('utf8')); } catch (e) { /* 下面断言报红 */ }
check('0.2 anchors.json 真读并 JSON.parse（非源码字符串匹配）',
  Array.isArray(anchors) && anchors.length > 0, anchors ? anchors.length + ' anchors' : 'parse failed');

if (!schema || !Array.isArray(anchors)) {
  console.log('\n致命：前置读取失败，终止。');
  process.exit(1);
}

// ---------- 1. 计数锁 ----------
check('1.0 顶层 $schema === "dam-l2-layout/v1"', schema['$schema'] === 'dam-l2-layout/v1', String(schema['$schema']));
check('1.1 顶层 version === 1', schema.version === 1, String(schema.version));
check('1.2 regions 恰 7 个', Array.isArray(schema.regions) && schema.regions.length === 7,
  'got ' + (Array.isArray(schema.regions) ? schema.regions.length : 'n/a'));
check('1.3 slots 恰 18 个', Array.isArray(schema.slots) && schema.slots.length === 18,
  'got ' + (Array.isArray(schema.slots) ? schema.slots.length : 'n/a'));
check('1.4 blockKinds 恰 10 个', Array.isArray(schema.blockKinds) && schema.blockKinds.length === 10,
  'got ' + (Array.isArray(schema.blockKinds) ? schema.blockKinds.length : 'n/a'));
check('1.5 authorSurface 恰 5 项', schema.authorSurface && typeof schema.authorSurface === 'object'
  && !Array.isArray(schema.authorSurface) && Object.keys(schema.authorSurface).length === 5,
  'got ' + (schema.authorSurface ? Object.keys(schema.authorSurface).length : 'n/a'));

// ---------- 2. 名单守恒（证明没编名字） ----------
const sameSet = (a, b) => a.length === b.length && a.slice().sort().join('|') === b.slice().sort().join('|');
check('2.1 region 名单与 28 卷 §3.2 逐字一致',
  sameSet((schema.regions || []).map(r => r.name), EXPECTED_REGIONS));
check('2.2 slot 名单与 28 卷 §3.3 逐字一致',
  sameSet((schema.slots || []).map(s => s.name), EXPECTED_SLOTS));
check('2.3 blockKinds 名单与 28 卷 §3.4 逐字一致',
  sameSet(schema.blockKinds || [], EXPECTED_BLOCK_KINDS));
check('2.4 authorSurface 键名与 28 卷 §3.6 逐字一致',
  sameSet(Object.keys(schema.authorSurface || {}), EXPECTED_AUTHOR_SURFACE));

// ---------- 3. 唯一性 ----------
const regionNames = (schema.regions || []).map(r => r.name);
const slotNames = (schema.slots || []).map(s => s.name);
check('3.1 region name 唯一', new Set(regionNames).size === regionNames.length,
  regionNames.length + ' names / ' + new Set(regionNames).size + ' unique');
check('3.2 slot name 唯一', new Set(slotNames).size === slotNames.length,
  slotNames.length + ' names / ' + new Set(slotNames).size + ' unique');
const blockKindSet = new Set(schema.blockKinds || []);
check('3.3 blockKind 唯一', blockKindSet.size === (schema.blockKinds || []).length);

// ---------- 4. 结构字段类型 ----------
check('4.1 每个 region 具备 name/part/order/desc 四字段',
  (schema.regions || []).every(r => typeof r.name === 'string' && (r.part === null || typeof r.part === 'string')
    && typeof r.order === 'number' && typeof r.desc === 'string' && r.desc.length > 0));
check('4.2 每个 slot 具备 name/region/part/order/existingAnchor 五字段',
  (schema.slots || []).every(s => typeof s.name === 'string' && typeof s.region === 'string'
    && (s.part === null || typeof s.part === 'string') && typeof s.order === 'number'
    && 'existingAnchor' in s && (s.existingAnchor === null || typeof s.existingAnchor === 'string')));
check('4.3 every authorSurface 项含 label/how/source 说明',
  Object.keys(schema.authorSurface || {}).every(k => {
    const v = schema.authorSurface[k];
    return v && typeof v.label === 'string' && typeof v.how === 'string' && typeof v.source === 'string';
  }));

// ---------- 5. region 引用有效性（含负路径证明） ----------
const regionNameSet = new Set(regionNames);
const badRegions = (schema.slots || []).filter(s => s.region !== WILDCARD && !regionNameSet.has(s.region));
check('5.1 每个 slot.region 都落在 regions 名单内（或 * 通配）',
  badRegions.length === 0, badRegions.length ? 'bad: ' + badRegions.map(s => s.name + '->' + s.region).join(',') : '18/18 ok');

// ★ 负路径：把第一个 slot 的 region 改成不存在的名字 ⇒ 同一判据必须报红
const mutated = JSON.parse(schemaText);
mutated.slots[0].region = '__no_such_region__';
const mutSet = new Set(mutated.regions.map(r => r.name));
const mutBad = mutated.slots.filter(s => s.region !== WILDCARD && !mutSet.has(s.region));
check('5.2 [负路径] 写错 region 名必须被同一判据捕获（否则判据恒真）',
  mutBad.length === 1 && mutBad[0].name === mutated.slots[0].name,
  'mutated slot=' + mutated.slots[0].name + ' detected=' + mutBad.length);

// ---------- 6. existingAnchor 与真实锚点比对 ----------
const anchorNames = new Set(anchors.map(a => a.name));
const withAnchor = (schema.slots || []).filter(s => typeof s.existingAnchor === 'string');
const missing = withAnchor.filter(s => !anchorNames.has(s.existingAnchor));
check('6.1 所有非 null existingAnchor 都在 anchors.json 中真实存在',
  missing.length === 0, withAnchor.length + ' 个非空锚点，缺失 ' + missing.length
    + (missing.length ? ' -> ' + missing.map(s => s.existingAnchor).join(',') : ''));
check('6.2 existingAnchor 覆盖率 = 18/18（28 卷名单无空锚）',
  withAnchor.length === schema.slots.length, withAnchor.length + '/' + schema.slots.length);

// ★ 负路径：造一个不存在的锚点 ⇒ 同一判据必须报红
const ghost = 'data-dam-no-such-anchor-zzz';
check('6.3 [负路径] 伪造锚点必须被同一判据捕获',
  !anchorNames.has(ghost), 'ghost present in anchors.json = ' + anchorNames.has(ghost));

// ★ 负路径：锚点前缀纪律 data-dam-*
check('6.4 [负路径] 锚点名全部以 data-dam- 前缀（命名纪律）',
  withAnchor.every(s => s.existingAnchor.startsWith('data-dam-')));

// ---------- 7. 命名纪律（37 卷 §3.1-3.3） ----------
const parts = [].concat((schema.regions || []).map(r => r.part), (schema.slots || []).map(s => s.part))
  .filter(p => p !== null);
check('7.1 part 全部为裸值（不含 - 连接成 "plugin-part" 形态之外的非法字符）',
  parts.every(p => /^[a-z][a-z0-9-]*$/.test(p)), parts.join(','));
check('7.2 float region 的 part 不是官方已占用的 panel（37 卷 §3.2 定案自造 am-panel）',
  (schema.regions || []).find(r => r.name === 'float')?.part === 'am-panel');

// ---------- 8. 物理量 ----------
const sha = crypto.createHash('sha256').update(schemaBuf).digest('hex');
const sha16 = sha.slice(0, 16);
const anchorsSha16 = crypto.createHash('sha256').update(anchorsBuf).digest('hex').slice(0, 16);
console.log('\n== 可复算物理量 ==');
console.log('schema  bytes      : ' + schemaBuf.length);
console.log('schema  sha256[:16]: ' + sha16);
console.log('schema  sha256     : ' + sha);
console.log('anchors bytes      : ' + anchorsBuf.length);
console.log('anchors sha256[:16]: ' + anchorsSha16);
console.log('anchors 条数       : ' + anchors.length);
console.log('regions 计数       : ' + (schema.regions || []).length);
console.log('slots   计数       : ' + (schema.slots || []).length);
console.log('blockKinds 计数    : ' + (schema.blockKinds || []).length);
console.log('authorSurface 计数 : ' + Object.keys(schema.authorSurface || {}).length);
console.log('existingAnchor 覆盖: ' + withAnchor.length + '/' + (schema.slots || []).length);
const byRegion = {};
for (const s of schema.slots) byRegion[s.region] = (byRegion[s.region] || 0) + 1;
console.log('slot 分布 by region: ' + JSON.stringify(byRegion));

console.log('\n== 结果 ==');
console.log('PASS ' + pass + ' / FAIL ' + fails.length);
if (fails.length) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }
console.log('ALL GREEN（exit 0）');
process.exit(0);
