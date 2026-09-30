import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clientHarness, nodes, button, deferred } from '../lib/issue160-ui-harness.mjs'
import { hostHarness } from '../lib/issue160-host-harness.mjs'

const root = process.env.ISSUE160_ROOT || fileURLToPath(new URL('../..', import.meta.url))
const { MemoryEngine, applyRuleEditPre } = await hostHarness(root)
const event = value => ({ target: { value } })
const areas = r => nodes(r.tree, n => n.type === 'textarea')
const buttons = (h, r, key) => nodes(r.tree, n => n.type === 'button' && n.props.children.flat(Infinity).includes(h.api.t(key)))
async function fixture(text = '- A\n- B\n') {
  const dir = await mkdtemp(path.join(tmpdir(), 'rule-drafts-')), file = path.join(dir, 'MEMORY.md')
  await writeFile(file, text)
  const engine = Object.create(MemoryEngine.prototype)
  engine.config = { memoryAnchorEnabled: false }; engine.resolvePaths = async () => ({ userFile: file })
  const h = clientHarness(root)
  let hostWork
  const apply = body => (hostWork = applyRuleEditPre(engine, body.op, body, { requireExpect: true, requireRevision: true }))
  const initial = await applyRuleEditPre(engine, 'list')
  let responseWork
  const setPost = handler => h.io(null, (url, body) => (responseWork = handler(url, body)))
  h.io(async () => initial); setPost((_url, body) => apply(body))
  const r = h.runner(h.api.RulesEditPanel); r.render(); await r.settle()
  return { h, r, engine, apply, file, setPost, async replyDone() { await responseWork; await r.settle() }, async hostDone() { await hostWork; await r.settle() }, async dispose() { r.unmount(); await rm(dir, { recursive: true, force: true }) } }
}
function edit(f, index, text) {
  const clicked = buttons(f.h, f.r, 'rulesEdit')[index]
  const rows = () => nodes(f.r.tree, n => n.props['data-dam-rule'] !== undefined)
  const rowIndex = rows().findIndex(row => nodes(row, n => n === clicked).length)
  clicked.props.onClick(); f.r.render()
  nodes(rows()[rowIndex], n => n.type === 'textarea')[0].props.onInput(event(text)); f.r.render()
}
async function add(f, text) {
  areas(f.r).at(-1).props.onInput(event(text)); f.r.render()
  button(f.r.tree, f.h.api.t('rulesAdd')).props.onClick(); f.r.render(); await f.replyDone()
}

await test('own add cannot turn an A draft into a plausible, host-accepted edit of new X', async () => {
  const f = await fixture()
  try {
    edit(f, 0, 'A-prime'); await add(f, 'X')
    const save = button(f.r.tree, f.h.api.t('rulesSave'))
    // Even a retained handler invoked despite disabled must not manufacture X's binding.
    save.props.onClick(); f.r.render(); await f.hostDone()
    assert.equal(await readFile(f.file, 'utf8'), '- X\n- A\n- B\n')
    assert(areas(f.r).some(n => n.props.value === 'A-prime'), 'Unsaved text remains available')
    assert(!f.h.requests.some(x => x.body.op === 'update' && x.body.expect === 'X' && x.body.text === 'A-prime'))
    // This is why the component, rather than just request field presence, needs a fix:
    // the host legitimately accepts all three plausible fields when a UI rebinds intent.
    const view = await applyRuleEditPre(f.engine, 'list')
    assert.equal((await f.apply({ op:'update', index:0, expect:'X', revision:view.revision, text:'explicit X edit' })).ok, true)
  } finally { await f.dispose() }
})

await test('multiple identical-text drafts survive own insertion without positional or text rebinding', async () => {
  const f = await fixture('- same\n- same\n- B\n')
  try {
    edit(f, 0, 'first occurrence'); edit(f, 0, 'second occurrence')
    await add(f, 'same')
    assert.deepEqual(areas(f.r).filter(n => n.props.rows === 3).map(n => n.props.value), ['first occurrence', 'second occurrence'])
    for (const save of buttons(f.h, f.r, 'rulesSave')) save.props.onClick()
    await f.hostDone()
    assert.equal(await readFile(f.file, 'utf8'), '- same\n- same\n- same\n- B\n')
    assert.equal(areas(f.r).filter(n => n.props.rows === 3).length, 2)
  } finally { await f.dispose() }
})

await test('retained delete handlers keep their original revision even with identical new head text', async () => {
  const f = await fixture('- same\n- B\n')
  try {
    const oldDelete = buttons(f.h, f.r, 'rulesDelete')[0]
    await add(f, 'same')
    oldDelete.props.onClick(); await f.hostDone()
    assert.equal(await readFile(f.file, 'utf8'), '- same\n- same\n- B\n')
  } finally { await f.dispose() }
})

await test('update success retires only its submitted version and preserves newer and unrelated drafts', async () => {
  const f = await fixture(), pending = deferred()
  try {
    edit(f, 0, 'submitted'); edit(f, 0, 'B draft')
    let result
    f.setPost(async (_url, body) => { result = await f.apply(body); return pending.promise })
    buttons(f.h, f.r, 'rulesSave')[0].props.onClick(); f.r.render()
    areas(f.r)[0].props.onInput(event('temporary')); f.r.render()
    areas(f.r)[0].props.onInput(event('submitted')); f.r.render()
    await f.hostDone(); pending.resolve(result); await f.r.settle()
    assert.deepEqual(areas(f.r).filter(n => n.props.rows === 3).map(n => n.props.value), ['submitted', 'B draft'])
    assert.equal(await readFile(f.file, 'utf8'), '- submitted\n- B\n')
  } finally { await f.dispose() }
})

await test('successful update removes only the unchanged submitted draft', async () => {
  const f = await fixture()
  try {
    edit(f, 0, 'A saved'); edit(f, 0, 'B unsaved')
    buttons(f.h, f.r, 'rulesSave')[0].props.onClick(); f.r.render(); await f.hostDone()
    assert.deepEqual(areas(f.r).filter(n => n.props.rows === 3).map(n => n.props.value), ['B unsaved'])
    assert.equal(await readFile(f.file, 'utf8'), '- A saved\n- B\n')
  } finally { await f.dispose() }
})

await test('remove response preserves drafts opened and typed while the request is in flight', async () => {
  const f = await fixture(), pending = deferred()
  try {
    let result
    f.setPost(async (_url, body) => { result = await f.apply(body); return pending.promise })
    buttons(f.h, f.r, 'rulesDelete')[0].props.onClick(); f.r.render()
    edit(f, 1, 'B while deleting A')
    await f.hostDone(); pending.resolve(result); await f.r.settle()
    assert(areas(f.r).some(n => n.props.value === 'B while deleting A'))
    button(f.r.tree, f.h.api.t('rulesSave')).props.onClick(); await f.hostDone()
    assert.equal(await readFile(f.file, 'utf8'), '- B\n')
  } finally { await f.dispose() }
})

await test('post-commit reorder or workspace path change leaves editable conflict drafts, never reanchored saves', async () => {
  for (const movePath of [false, true]) {
    const f = await fixture()
    try {
      edit(f, 0, 'A intent')
      let target = f.file
      f.setPost(async (_url, body) => {
        if (body.op !== 'add') return f.apply(body)
        await f.apply(body)
        if (movePath) { target = path.join(path.dirname(f.file), 'other.md'); f.engine.resolvePaths = async () => ({ userFile:target }) }
        await writeFile(target, '- B\n- X\n- A\n')
        return applyRuleEditPre(f.engine, 'list')
      })
      await add(f, 'X')
      const save = button(f.r.tree, f.h.api.t('rulesSave'))
      save.props.onClick(); await f.hostDone()
      assert.equal(await readFile(target, 'utf8'), '- B\n- X\n- A\n')
      const field = areas(f.r).find(n => n.props.value === 'A intent')
      assert(field); field.props.onInput(event('retained newer intent')); f.r.render()
      assert(areas(f.r).some(n => n.props.value === 'retained newer intent'))
    } finally { await f.dispose() }
  }
})

await test('cancel/reopen during pending save cannot clear a new draft and conflicts cancel individually', async () => {
  const f = await fixture(), pending = deferred()
  try {
    edit(f, 0, 'submitted'); edit(f, 0, 'other')
    let result
    f.setPost(async (_url, body) => { result = await f.apply(body); return pending.promise })
    buttons(f.h, f.r, 'rulesSave')[0].props.onClick(); f.r.render()
    buttons(f.h, f.r, 'rulesCancel')[0].props.onClick(); f.r.render()
    edit(f, 0, 'reopened')
    await f.hostDone(); pending.resolve(result); await f.r.settle()
    assert.deepEqual(areas(f.r).filter(n => n.props.rows === 3).map(n => n.props.value).sort(), ['other','reopened'])
    buttons(f.h, f.r, 'rulesCancel')[0].props.onClick(); f.r.render()
    assert.equal(areas(f.r).filter(n => n.props.rows === 3).length, 1)
  } finally { await f.dispose() }
})
