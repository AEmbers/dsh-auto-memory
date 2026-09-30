import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { clientHarness, nodes, deferred, button } from '../lib/issue160-ui-harness.mjs'
const root = process.env.ISSUE160_ROOT || fileURLToPath(new URL('../..', import.meta.url))
const settle = runner => runner.settle()
const input = (tree, type) => nodes(tree, n => n.type === type)[0]
const event = value => ({ target: { value } })
const ruleView = { path: '/rules', revision: 'rev-a', items: [{text:'A',source:'user'},{text:'B',source:'user'}], preview:'- A\n- B' }

await test('1. GUI delete/update carry the original content and full-document revision', async () => {
  const h = clientHarness(root), pending = deferred()
  h.io(async () => ruleView, () => pending.promise)
  const r = h.runner(h.api.RulesEditPanel); r.render(); await settle(r)
  button(r.tree, h.api.t('rulesDelete')).props.onClick()
  assert.equal(h.requests[0].body.expect, 'A')
  assert.equal(h.requests[0].body.revision, 'rev-a')
  pending.resolve({error:'stale'}); await settle(r)
  button(r.tree,h.api.t('rulesEdit')).props.onClick(); r.render()
  input(r.tree,'textarea').props.onInput(event('changed')); r.render()
  button(r.tree,h.api.t('rulesSave')).props.onClick()
  assert.equal(h.requests.at(-1).body.expect,'A'); assert.equal(h.requests.at(-1).body.revision,'rev-a')
  r.unmount()
})

await test('2. rules add preserves failed drafts and newer input after late success', async () => {
  const h = clientHarness(root); let pending = deferred()
  h.io(async () => ruleView, () => pending.promise)
  const r = h.runner(h.api.RulesEditPanel); r.render(); await settle(r)
  for (const value of ['line1\nline2', 'x'.repeat(2001), 'server rejection', 'network failure']) {
    input(r.tree,'textarea').props.onInput(event(value)); r.render()
    button(r.tree,h.api.t('rulesAdd')).props.onClick(); r.render()
    assert.equal(input(r.tree,'textarea').props.value,value,'Draft survives pending submission')
    if(value==='network failure') pending.reject(Error('offline')); else pending.resolve({error:'invalid'})
    await settle(r); assert.equal(input(r.tree,'textarea').props.value,value)
    pending = deferred()
  }
  input(r.tree,'textarea').props.onInput(event('submitted')); r.render()
  button(r.tree,h.api.t('rulesAdd')).props.onClick(); r.render()
  input(r.tree,'textarea').props.onInput(event('newer')); r.render()
  pending.resolve({...ruleView,result:'ok'}); await settle(r)
  assert.equal(input(r.tree,'textarea').props.value,'newer')
  pending=deferred(); button(r.tree,h.api.t('rulesAdd')).props.onClick(); r.render()
  pending.resolve({...ruleView,result:'ok'}); await settle(r)
  assert.equal(input(r.tree,'textarea').props.value,'')
  // Input edited back to the same text is still a newer draft.
  pending=deferred();input(r.tree,'textarea').props.onInput(event('same'));r.render();button(r.tree,h.api.t('rulesAdd')).props.onClick();r.render()
  input(r.tree,'textarea').props.onInput(event('temporary'));r.render();input(r.tree,'textarea').props.onInput(event('same'));r.render()
  pending.resolve({...ruleView,result:'ok'});await settle(r);assert.equal(input(r.tree,'textarea').props.value,'same')
  r.unmount()
})

function migrationControls(h,r,native) {
  if(native) {
    const element=nodes(r.tree,n=>typeof n.type==='function'&&n.type.name==='Iter5Migration')[0]
    assert(element); return element.props
  }
  return { setPack(value){const field=nodes(r.tree,n=>n.type==='input'&&n.props.placeholder===h.api.t('migPickPack'))[0];field.props.onChange(event(value))},onPreview(){button(r.tree,h.api.t('migPreview')).props.onClick({type:'click',target:{}})},onApply(){button(r.tree,h.api.t('migApply')).props.onClick()},get plan(){return nodes(r.tree,n=>n.type==='button'&&n.props.children.flat(Infinity).includes(h.api.t('migApply'))).length?{}:null},setConflict(value){const labels={keep:'migConflictKeep',overwrite:'migConflictOverwrite',rename:'migConflictRename'};const btn=nodes(r.tree,n=>n.type==='button'&&n.props.children.some(c=>typeof c==='string'&&c.endsWith(h.api.t(labels[value]))))[0];btn.props.onClick()} }
}
for(const native of [false,true]) await test(`3. ${native?'Iter5':'classic'} migration binds preview, invalidates changed inputs and ignores late replies`,async()=>{
  const h=clientHarness(root);let pending=deferred()
  h.io(async()=>({}),async(url,body)=>url.includes('migrate-inspect')?pending.promise:{ok:true,targetWs:body.targetWs})
  const r=h.runner(native?h.api.Iter5Storage:h.api.StorageTab);r.render();await settle(r)
  migrationControls(h,r,native).setPack('/pack/a');r.render()
  migrationControls(h,r,native).onPreview();r.render()
  migrationControls(h,r,native).setPack('/pack/b');r.render()
  pending.resolve({ok:true,previewToken:'a-token',plan:{fromPath:'a',toPath:'/ws/a'}});await settle(r)
  assert.equal(migrationControls(h,r,native).plan,null,'Late A preview discarded after path changes')
  pending=deferred();migrationControls(h,r,native).onPreview();r.render()
  pending.resolve({ok:true,previewToken:'b-token',plan:{fromPath:'b',toPath:'/ws/a'}});await settle(r)
  assert(migrationControls(h,r,native).plan)
  migrationControls(h,r,native).setConflict('overwrite');r.render()
  assert.equal(migrationControls(h,r,native).plan,null,'Policy update invalidates old preview immediately')
  pending=deferred(); // New policy request already used prior resolved response: let its microtasks settle.
  await settle(r)
  if(!migrationControls(h,r,native).plan){migrationControls(h,r,native).onPreview();r.render();pending.resolve({ok:true,previewToken:'overwrite-token',plan:{}});await settle(r)}
  h.identity('session-b|/ws/b');r.render()
  assert.equal(migrationControls(h,r,native).plan,null,'Workspace switch invalidates preview')
  // Return to original workspace; a newly confirmed preview sends exactly its binding.
  h.identity('session-a|/ws/a');r.render();pending=deferred()
  migrationControls(h,r,native).onPreview();r.render();pending.resolve({ok:true,previewToken:'final-token',plan:{}});await settle(r)
  migrationControls(h,r,native).onApply();r.render();await settle(r)
  const sent=h.requests.find(x=>x.url.includes('migrate-import'))
  assert.deepEqual(sent.body,{packPath:'/pack/b',targetWs:'/ws/a',onConflict:'overwrite',previewToken:'final-token'})
  r.unmount()
})

await test('4. floating-tab navigation respects dirty guard before mutation; identity-scoped notes restore and cancel clears',async()=>{
  const h=clientHarness(root)
  h.io(async()=>({}),async()=>({}))
  h.api.controller.setPanelTab('notes')
  const page=h.runner(h.api.Iter5Page,{nonce:0});page.render();await settle(page)
  const rootEl=nodes(page.tree,n=>n.props.ref&&n.props['data-iter5']!==undefined)[0]||nodes(page.tree,n=>n.props.ref)[0]
  assert(rootEl)
  rootEl.props.ref.current={querySelector:()=>({}),setAttribute(){},clientWidth:1100,closest:()=>null}
  h.accept(false)
  h.api.controller.setPanelTab('calendar');page.render()
  assert.equal(h.api.controller.panelTab(),'notes','Cancel leaves shared tab unchanged')
  assert(nodes(page.tree,n=>n.props['data-i5-nav']==='library'&&n.props['aria-current']==='page').length)
  h.accept(true);h.api.controller.setPanelTab('calendar');page.render()
  assert.equal(h.api.controller.panelTab(),'calendar')
  assert.equal(h.confirms,2,'One confirmation per external navigation, no subscription loop')
  page.unmount()
  const note=h.runner(h.api.Iter5Note,{persistDraft:'workbench',onClose(){}});note.render()
  input(note.tree,'textarea').props.onChange(event('workspace A draft'));note.render();note.unmount()
  const restored=h.runner(h.api.Iter5Note,{persistDraft:'workbench',onClose(){}});restored.render()
  assert.equal(input(restored.tree,'textarea').props.value,'workspace A draft');restored.unmount()
  h.identity('other|/ws/b');const other=h.runner(h.api.Iter5Note,{persistDraft:'workbench'});other.render();assert.equal(input(other.tree,'textarea').props.value,'');other.unmount()
  h.identity('session-a|/ws/a');const cancel=h.runner(h.api.Iter5Note,{persistDraft:'workbench',onClose(){}});cancel.render()
  h.accept(false);button(cancel.tree,'取消').props.onClick();cancel.unmount()
  const retained=h.runner(h.api.Iter5Note,{persistDraft:'workbench',onClose(){}});retained.render();assert.equal(input(retained.tree,'textarea').props.value,'workspace A draft')
  h.accept(true);button(retained.tree,'取消').props.onClick();retained.unmount()
  const empty=h.runner(h.api.Iter5Note,{persistDraft:'workbench'});empty.render();assert.equal(input(empty.tree,'textarea').props.value,'');empty.unmount()
  // Verify the actual browser mounts a persistent note when its saved draft exists.
  const draft=h.runner(h.api.Iter5Note,{persistDraft:'workbench'});draft.render();input(draft.tree,'textarea').props.onChange(event('resume'));draft.unmount()
  h.io(async()=>[{}, {notesPath:'/notes'}])
  const browse=h.runner(h.api.Iter5Browse,{nonce:0});browse.render();await settle(browse)
  const child=nodes(browse.tree,n=>n.type===h.api.Iter5Note)[0]
  assert.equal(child?.props.persistDraft,'workbench');browse.unmount()
})

await test('5–6. pending Python download reports progress, renders/debounces cancel, handles idle race, terminal states and remount',async()=>{
  const h=clientHarness(root);let status={phase:'idle',venvOk:true,depsOk:true,modelReady:false,dl:{}}, pending=deferred(), delayed=null
  h.io(async url=>{if(url.includes('status')&&delayed){const value=delayed;delayed=null;return value.promise}return status},url=>url.includes('cancel')?Promise.resolve(status):pending.promise)
  const r=h.runner(h.api.PySetupWizard);r.render();await settle(r)
  button(r.tree,h.api.t('pyWizDownload')).props.onClick();r.render();await settle(r)
  assert(h.timerCount>0,'Polling starts before POST resolves')
  await h.tick();await settle(r)
  assert(h.timerCount>0,'Startup idle GET cannot stop pending download observation')
  status={...status,phase:'downloading',activeOperation:'model',dl:{bytesDone:50,bytesTotal:100}}
  await h.tick();await settle(r)
  assert(nodes(r.tree,n=>n.type==='span'&&n.props.children.includes('50%')).length)
  const cancel=button(r.tree,h.api.t('pyWizCancel'));assert.equal(cancel.props.disabled,false)
  cancel.props.onClick();cancel.props.onClick();r.render();await settle(r)
  assert.equal(h.requests.filter(x=>x.url.includes('cancel')).length,1)
  assert.equal(button(r.tree,h.api.t('pyWizCancel')).props.disabled,true)
  delayed=deferred();const stale=delayed;await h.tick()
  pending.resolve({...status,phase:'idle',activeOperation:''});await settle(r)
  stale.resolve({...status,phase:'downloading'});await settle(r)
  assert.equal(nodes(r.tree,n=>n.type==='button'&&n.props.children.includes(h.api.t('pyWizCancel'))).length,0,'Old GET cannot resurrect completed operation')
  r.unmount();assert.equal(h.timerCount,0)
  status={...status,phase:'downloading',activeOperation:'model'}
  const reentry=h.runner(h.api.PySetupWizard);reentry.render();await settle(reentry)
  assert(h.timerCount>0);assert.equal(button(reentry.tree,h.api.t('pyWizRedetect')).props.disabled,true)
  status={...status,phase:'error',activeOperation:'',error:'failed'};await h.tick();await settle(reentry);assert.equal(h.timerCount,0)
  reentry.unmount()
  // A new instance may retry after error; ready is terminal and clears its timer.
  status={...status,phase:'idle',error:''};pending=deferred()
  const retry=h.runner(h.api.PySetupWizard);retry.render();await settle(retry)
  button(retry.tree,h.api.t('pyWizDownload')).props.onClick();retry.render()
  pending.resolve({...status,phase:'ready',modelReady:true,configOk:true});await settle(retry)
  assert.equal(h.timerCount,0);retry.unmount()
})

await test('5. terminal status releases a pending POST, permits retry, and discards its late response',async()=>{
  const h=clientHarness(root);let status={phase:'idle',venvOk:true,depsOk:true,dl:{}},old=deferred(),next=deferred(),current=old
  h.io(async()=>status,()=>current.promise)
  const r=h.runner(h.api.PySetupWizard);r.render();await settle(r)
  button(r.tree,h.api.t('pyWizDownload')).props.onClick();r.render();await settle(r)
  status={...status,phase:'downloading',activeOperation:'model'};await h.tick();await settle(r)
  status={...status,phase:'idle',activeOperation:''};await h.tick();await settle(r)
  assert.equal(h.timerCount,0,'Terminal observation ends polling even if POST has not returned')
  current=next;button(r.tree,h.api.t('pyWizDownload')).props.onClick();r.render();await settle(r)
  status={...status,phase:'downloading',activeOperation:'model',dl:{bytesDone:70,bytesTotal:100}};await h.tick();await settle(r)
  old.resolve({phase:'ready',modelReady:true});await settle(r)
  assert(button(r.tree,h.api.t('pyWizCancel')),'Old POST cannot overwrite retry progress')
  assert(nodes(r.tree,n=>n.type==='span'&&n.props.children.includes('70%')).length)
  r.unmount();next.resolve({phase:'ready',modelReady:true});await settle(r);assert.equal(h.timerCount,0)
})

await test('6. cancel action is rendered in step four during a busy transfer and is debounced independently',async()=>{
  const h=clientHarness(root),status={phase:'downloading',activeOperation:'model',dl:{bytesDone:5,bytesTotal:10}},pending=deferred()
  h.io(async()=>status,()=>pending.promise)
  const r=h.runner(h.api.PySetupWizard);r.render();await settle(r)
  const cancel=button(r.tree,h.api.t('pyWizCancel'));assert.equal(cancel.props.disabled,false)
  cancel.props.onClick();cancel.props.onClick();r.render();assert.equal(h.requests.length,1)
  r.unmount();assert.equal(h.timerCount,0);pending.resolve(status);await settle(r)
})

await test('4. interrupted note submission clears only the successfully saved identity draft',async()=>{
  const h=clientHarness(root);let pending=deferred()
  h.io(async()=>({}),()=>pending.promise)
  const r=h.runner(h.api.Iter5Note,{persistDraft:'panel'});r.render();input(r.tree,'textarea').props.onChange(event('submitted'));r.render()
  r.tree.props.onSubmit({preventDefault(){}});r.unmount()
  const next=h.runner(h.api.Iter5Note,{persistDraft:'panel'});next.render();input(next.tree,'textarea').props.onChange(event('newer'));next.render()
  pending.resolve({result:'ok'});await settle(r);next.unmount()
  const retained=h.runner(h.api.Iter5Note,{persistDraft:'panel'});retained.render();assert.equal(input(retained.tree,'textarea').props.value,'newer');retained.unmount()
  pending=deferred();const submitted=h.runner(h.api.Iter5Note,{persistDraft:'panel'});submitted.render();submitted.tree.props.onSubmit({preventDefault(){}});submitted.unmount()
  pending.resolve({result:'ok'});await settle(submitted)
  const empty=h.runner(h.api.Iter5Note,{persistDraft:'panel'});empty.render();assert.equal(input(empty.tree,'textarea').props.value,'');empty.unmount()
})

for(const native of [false,true]) await test(`7. ${native?'Iter5':'classic'} snapshot gap saves/reloads zero and preserves blank/invalid drafts`,async()=>{
  const h=clientHarness(root);let config={snapshotMinGapRounds:7},fail=false
  h.io(async url=>url.includes('/config')?{config:{...config}}:{},async(url,body)=>{if(fail)throw Error('failed');config={...config,...body};return {config:{...config}}})
  const component=native?h.api.Iter5Settings:h.api.SettingsPage
  const field=tree=>{const row=nodes(tree,n=>n.props['data-i5-field']===h.api.t('fSnapGap')||n.props['data-dam-settings-row']!==undefined&&nodes(n,x=>x.type==='label'&&x.props.children.includes(h.api.t('fSnapGap'))).length)[0];return nodes(row,n=>n.type==='input')[0]}
  const r=h.runner(component);r.render();await settle(r)
  assert.equal(field(r.tree).props.value,7)
  field(r.tree).props.onChange(event('0'));r.render();assert.equal(field(r.tree).props.value,0)
  button(r.tree,'保存更改').props.onClick();await settle(r)
  assert.equal(config.snapshotMinGapRounds,0);r.unmount()
  const reload=h.runner(component);reload.render();await settle(reload);assert.equal(field(reload.tree).props.value,0)
  field(reload.tree).props.onChange(event('nonsense'));reload.render();assert.equal(field(reload.tree).props.value,0)
  field(reload.tree).props.onChange(event(''));reload.render();assert.equal(field(reload.tree).props.value,'')
  fail=true;button(reload.tree,'保存更改').props.onClick();await settle(reload);assert.equal(field(reload.tree).props.value,'','Failed save keeps blank draft')
  fail=false;button(reload.tree,'保存更改').props.onClick();await settle(reload);assert.equal(config.snapshotMinGapRounds,5)
  reload.unmount()
})
