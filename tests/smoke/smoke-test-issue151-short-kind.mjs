/**
 * Issue #151: short L0 summaries must not regain log kind metadata during growth.
 * Pure Node assertions, inline fixtures only; no host, network, or filesystem writes.
 */
import assert from 'node:assert/strict'
import { extractL0Pre, buildL0IndexPre, L0_DEFAULTS } from '../../lib/l0-extract.js'

let pass = 0, fail = 0
const t = (name, fn) => { try { fn(); pass++ } catch (e) { fail++; console.error('FAIL ' + name + ': ' + e.message) } }
const kinds = ['fact', 'rule', 'preference', 'todo']
const samples = [
  ['one character', '无'],
  ['short word', '待办'],
  ['below minChars', '甲'.repeat(L0_DEFAULTS.minChars - 1)],
  ['at minChars', '乙'.repeat(L0_DEFAULTS.minChars)],
  ['long entry', '全插件版本核查并升级：仅 auto-memory 落后'],
]

// Cover both tag/timestamp orders already supported by the initial extraction path.
for (const kind of kinds) {
  for (const [label, content] of samples) {
    t(kind + ': ' + label + ' stays clean in both prefix orders', () => {
      const lines = [
        '- 12:00 [kind:' + kind + '] ' + content,
        '- [kind:' + kind + '] 12:00 ' + content,
      ]
      for (const line of lines) {
        assert.deepEqual(extractL0Pre(line), { l0: content, source: 'firstSentence' })
      }
    })
  }
}

t('growth strips metadata from every line, preserving LF and CRLF boundaries', () => {
  const lines = [
    '- 09:01 [kind:fact] 完成。',
    '* [kind:todo] 09:02 待办。',
    '+ 09:03 [kind:rule] 每次修改都必须保留完整回归证据',
    '- 09:04 [kind:preference] 不应继续拼接',
  ]
  for (const eol of ['\n', '\r\n']) {
    assert.deepEqual(extractL0Pre(lines.join(eol)), {
      l0: '完成。待办。每次修改都必须保留完整回归证据',
      source: 'firstSentence',
    })
  }
})

t('growth strips metadata from subsequent sentence parts', () => {
  const line = '- 12:00 [kind:fact] 无；[kind:todo] 待办；[kind:rule] 每次修改都必须保留完整回归证据'
  assert.equal(extractL0Pre(line).l0, '无。待办。每次修改都必须保留完整回归证据')
})

t('a sufficiently long first sentence does not grow into later entries', () => {
  const content = '已经完成全部插件版本核查并保留完整回归证据'
  const line = '- 12:00 [kind:fact] ' + content + '。\n- 12:01 [kind:todo] 后续待办'
  assert.equal(extractL0Pre(line).l0, content)
})

t('growth still obeys maxChars after stripping metadata', () => {
  const line = '- 12:00 [kind:fact] 无。\n- 12:01 [kind:todo] ' + '甲'.repeat(30)
  const r = extractL0Pre(line, { maxChars: 16 })
  assert.equal(r.l0, '无。' + '甲'.repeat(13) + '…')
  assert.equal(r.l0.length, 16)
})

t('short untagged content, ordinary brackets, and unknown kinds are preserved', () => {
  for (const content of ['无', '[附录A] 无', '[kind:other] 无']) {
    assert.equal(extractL0Pre('- 12:00 ' + content).l0, content)
  }
})

t('buildL0IndexPre uses clean short summaries without changing body metadata', () => {
  const bodies = kinds.map((kind) => '- 12:00 [kind:' + kind + '] 无')
  const ids = ['a', 'b', 'c', 'd'].map((c) => 'mem_' + c.repeat(32))
  const doc = bodies.map((body, i) => '<!-- memory:' + ids[i] + ' -->\n' + body).join('\n')
  const rows = buildL0IndexPre(doc, { layer: 'log' })
  assert.equal(rows.length, kinds.length)
  for (let i = 0; i < rows.length; i++) {
    assert.equal(rows[i].id, ids[i])
    assert.equal(rows[i].l0, '无')
    assert.equal(rows[i].chars, 1)
    assert.equal(rows[i].bodyChars, bodies[i].length)
    assert.equal(rows[i].source, 'firstSentence')
    assert.equal(rows[i].layer, 'log')
    assert.equal(rows[i].status, 'current')
  }
  assert.deepEqual(buildL0IndexPre(doc, { layer: 'log' }), rows)
})

console.log('[issue151-short-kind] pass=' + pass + ' fail=' + fail)
if (fail) process.exit(1)
