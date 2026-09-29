/**
 * 审计：结构层三层锚点「配置可写 ↔ DOM 有节点」差集（活接口 / 死接口）。
 *
 * 判据来源：56 卷 §二「客户能做的 5 件事」+ §四「结构层 25%：13 屏逐个打三层锚点」。
 * 用法：node tools/audit-layout-interfaces.mjs   （只读，零副作用）
 *
 * ★已知留白（非缺口，有意为之 —— 见 docs/teamwork-impl/106-R32结构层活接口审计.md §三）：
 *   `chart-legend` —— schema 声明了该 slot，但前端**故意不注入** `data-dam-slot`:
 *   其 existingAnchor `data-dam-legend-dot` 属**死锚点**（CSS 有 display/size 规则、JS 零生产者），
 *   一旦按 schema 挂属性就会**激活那些 CSS** ⇒ 破坏 62 卷 §二「零视觉变化」纪律。
 *   ⇒ 本工具把它列为「已知留白」白名单，与「真死接口」区分开。
 */
import { readFileSync } from 'node:fs'
import { LAYOUT_REGIONS, LAYOUT_SLOTS, LAYOUT_BLOCK_KINDS } from 'file:///D:/dsh-auto-memory/lib/layout-config.js'

// ★支持环境变量覆盖仓库根（只读审计用途，同时使**负路径**可测：指向一份变异副本即可）。
const ROOT = process.env.DAM_ROOT || 'D:/dsh-auto-memory'
const CL = readFileSync(ROOT + '/lib/client.js', 'utf8')
/** 已知留白白名单（有据、非缺口）—— 见本文件头注释。 */
const KNOWN_PENDING = { slots: ['chart-legend'] }

/** 抓取某属性的**字面量**取值（只认 'attr': 'value' 形态，避免注释污染）。 */
function valuesOf(attr) {
  const re = new RegExp("'" + attr + "'\\s*:\\s*'([^']*)'", 'g')
  const out = new Set()
  let m
  while ((m = re.exec(CL)) !== null) m[1].split(/[\s,]+/).forEach((x) => { if (x) out.add(x) })
  return out
}

const dom = {
  region: valuesOf('data-dam-region'),
  slot: valuesOf('data-dam-slot'),
  block: valuesOf('data-dam-block'),
}
const cfg = { region: LAYOUT_REGIONS, slot: LAYOUT_SLOTS, block: LAYOUT_BLOCK_KINDS }

let bad = 0
for (const layer of ['region', 'slot', 'block']) {
  const lists = cfg[layer], doms = dom[layer]
  const dead = lists.filter((x) => !doms.has(x))
  const extra = [...doms].filter((x) => lists.indexOf(x) < 0).sort()
  const known = KNOWN_PENDING[layer + 's'] || []
  const real = dead.filter((x) => known.indexOf(x) < 0)
  console.log('== ' + layer + ' ==')
  console.log('  配置可写 ' + lists.length + ' 个 / DOM 有节点 ' + doms.size + ' 个')
  console.log('  已知留白 = ' + JSON.stringify(known.filter((x) => dead.indexOf(x) >= 0)))
  console.log('  ★真死接口 = ' + JSON.stringify(real))
  console.log('  反向（DOM 有但配置不可写）= ' + JSON.stringify(extra))
  if (real.length || extra.length) bad++
  console.log('')
}
console.log(bad === 0
  ? 'ALL GREEN —— 三层锚点：除已知留白外，配置可写集合与 DOM 节点集合**双向对齐**'
  : 'FAIL —— 存在真死接口或反向多余锚点，共 ' + bad + ' 层'
  )
process.exit(bad === 0 ? 0 : 1)