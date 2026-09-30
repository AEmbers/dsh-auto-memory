import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, readFile, rm, open } from 'node:fs/promises'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { hostHarness } from '../lib/issue160-host-harness.mjs'
import { deferred } from '../lib/issue160-ui-harness.mjs'
// Fail closed against accidental network/model downloads, including baseline verification.
globalThis.fetch = async () => { throw Error('Network is forbidden in this regression suite') }
const root=process.env.ISSUE160_ROOT || fileURLToPath(new URL('../..',import.meta.url))
const { MemoryEngine, applyRuleEditPre }=await hostHarness(root)
const {MemoryDocumentStore}=await import(pathToFileURL(path.join(root,'lib/memory-writer.js')).href)
const {createPythonSetupPre}=await import(pathToFileURL(path.join(root,'lib/python-setup.js')).href)
const {buildPackPre}=await import(pathToFileURL(path.join(root,'lib/migrate-pack.js')).href)
const gui={requireExpect:true,requireRevision:true}
async function fixture(anchored=false) {
  const dir=await mkdtemp(path.join(tmpdir(),'issue160-rules-')),file=path.join(dir,'MEMORY.md')
  const engine=Object.create(MemoryEngine.prototype)
  engine.config={memoryAnchorEnabled:anchored};engine.resolvePaths=async()=>({userFile:file})
  if(anchored) engine._docStore=new MemoryDocumentStore({sidecarDir:path.join(dir,'index'),backupDir:path.join(dir,'backup')})
  return {engine,dir,file,async dispose(){await rm(dir,{recursive:true,force:true})}}
}
for(const anchored of [false,true]) await test(`1. ${anchored?'anchored':'raw'} rules reject stale indexes, duplicates, wrong paths, and commit-boundary races`,async()=>{
  const f=await fixture(anchored)
  try {
    await f.engine.writeFull(f.file,'- A\n- B\n')
    let view=await applyRuleEditPre(f.engine,'list')
    assert((await applyRuleEditPre(f.engine,'add',{text:'X'})).ok)
    const before=await readFile(f.file,'utf8')
    for(const op of ['update','remove']) {
      const result=await applyRuleEditPre(f.engine,op,{index:0,expect:'A',revision:view.revision,text:'changed'},gui)
      assert.equal(result.ok,false);assert.equal(await readFile(f.file,'utf8'),before)
    }
    await f.engine.writeFull(f.file,'- identical\n- identical\n- B\n')
    view=await applyRuleEditPre(f.engine,'list')
    await applyRuleEditPre(f.engine,'remove',{index:0,expect:'identical',revision:view.revision},gui)
    assert.equal((await applyRuleEditPre(f.engine,'remove',{index:0,expect:'identical',revision:view.revision},gui)).ok,false,'Duplicate text cannot validate a stale position')
    const other=path.join(f.dir,'other.md');await writeFile(other,await readFile(f.file))
    const current=await applyRuleEditPre(f.engine,'list');f.engine.resolvePaths=async()=>({userFile:other})
    assert.equal((await applyRuleEditPre(f.engine,'remove',{index:0,expect:'identical',revision:current.revision},gui)).ok,false,'Revision is path-scoped')
    f.engine.resolvePaths=async()=>({userFile:f.file})
    const original=f.engine.writeFull.bind(f.engine)
    let arrived=0,barrier=deferred()
    f.engine.writeFull=async(...args)=>{if(++arrived===2)barrier.resolve();await barrier.promise;return original(...args)}
    view=await applyRuleEditPre(f.engine,'list')
    const payload={index:0,expect:view.items[0].text,revision:view.revision}
    const results=await Promise.all([applyRuleEditPre(f.engine,'update',{...payload,text:'first'},gui),applyRuleEditPre(f.engine,'update',{...payload,text:'second'},gui)])
    assert.equal(results.filter(r=>r.ok).length,1,'Exactly one of two writers based on the same snapshot commits')
    f.engine.writeFull=original
    // Another primitive inserts a rule after apply's read but before protected writeFull.
    view=await applyRuleEditPre(f.engine,'list')
    f.engine.writeFull=async(...args)=>{await f.engine.appendText(f.file,'- external append');return original(...args)}
    assert.equal((await applyRuleEditPre(f.engine,'remove',{index:0,expect:view.items[0].text,revision:view.revision},gui)).ok,false)
    assert((await readFile(f.file,'utf8')).includes('external append'))
    f.engine.writeFull=original
    // An external editor changes bytes even later, while the replacement is fsynced.
    const store=anchored?f.engine.docStore:f.engine.rawDocStore
    store.atomicOptions.beforeRename=async()=>{await writeFile(f.file,'- manual edit\n')}
    view=await applyRuleEditPre(f.engine,'list')
    assert.equal((await applyRuleEditPre(f.engine,'remove',{index:0,expect:view.items[0].text,revision:view.revision},gui)).ok,false)
    assert.equal(await readFile(f.file,'utf8'),'- manual edit\n')
    store.atomicOptions={}
    // A Windows-style retry must recheck the digest after the backoff.
    let attempts=0
    store.fs={...fs,rename:async(from,to)=>{if(to===f.file&&++attempts===1){const e=Error('busy');e.code='EBUSY';throw e}return fs.rename(from,to)}}
    store.atomicOptions={renameDelays:[0,1],sleep:async()=>{await writeFile(f.file,'- manual retry edit\n')}}
    view=await applyRuleEditPre(f.engine,'list')
    assert.equal((await applyRuleEditPre(f.engine,'remove',{index:0,expect:view.items[0].text,revision:view.revision},gui)).ok,false)
    assert.equal(await readFile(f.file,'utf8'),'- manual retry edit\n')
    store.atomicOptions={};store.fs=fs
    await writeFile(f.file,'- manual edit\n')
    // Model tools still need expect only, with the original exact-content contract.
    assert.equal((await applyRuleEditPre(f.engine,'remove',{index:0},{requireExpect:true})).ok,false)
    assert.equal((await applyRuleEditPre(f.engine,'remove',{index:0,expect:'manual edit'},{requireExpect:true})).ok,true)
  } finally {await f.dispose()}
})

await test('1. deleting a sole anchored rule removes its orphan anchor and keeps unrelated IDs',async()=>{
  const f=await fixture(true)
  try{
    const a='mem_'+'a'.repeat(32),b='mem_'+'b'.repeat(32)
    await writeFile(f.file,`<!-- memory:${a} -->\n- A\n<!-- memory:${b} -->\n- B\n`)
    const view=await applyRuleEditPre(f.engine,'list')
    const result=await applyRuleEditPre(f.engine,'remove',{index:0,expect:'A',revision:view.revision},gui)
    assert(result.ok);assert.deepEqual(result.removedAnchors,[a])
    const text=await readFile(f.file,'utf8');assert(!text.includes(a));assert(text.includes(b))
  }finally{await f.dispose()}
})

await test('3. import rejects a same-path changed pack or target after preview, before any write',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'issue160-pack-')),engine=Object.create(MemoryEngine.prototype)
  let pack=buildPackPre({ws:'/source',files:{'MEMORY.md':'old content'},now:1}).pack
  engine._readPack=async()=>({ok:true,pack,warnings:[]})
  let existing={};engine._readExistingWorkspaceFiles=async()=>existing
  engine.projectDirOf=()=>path.join(dir,'target');engine._wsSummaryFile=()=>path.join(dir,'summary.json')
  let copies=0;engine.copyDir=async()=>{copies++}
  try{
    let preview=await engine.migrateInspect({packPath:'/pack',targetWs:'/target'})
    pack=buildPackPre({ws:'/source',files:{'MEMORY.md':'changed content'},now:2}).pack
    let result=await engine.migrateImport({packPath:'/pack',targetWs:'/target',previewToken:preview.previewToken})
    assert.equal(result.error,'preview-stale');assert.equal(copies,0)
    preview=await engine.migrateInspect({packPath:'/pack',targetWs:'/target',onConflict:'overwrite'})
    existing={'MEMORY.md':'target changed'}
    result=await engine.migrateImport({packPath:'/pack',targetWs:'/target',onConflict:'overwrite',previewToken:preview.previewToken})
    assert.equal(result.error,'preview-stale');assert.equal(copies,0)
    // Same byte count still means changed target content, not the same preview.
    preview=await engine.migrateInspect({packPath:'/pack',targetWs:'/target',onConflict:'overwrite'})
    existing={'MEMORY.md':'changed target'}
    result=await engine.migrateImport({packPath:'/pack',targetWs:'/target',onConflict:'overwrite',previewToken:preview.previewToken})
    assert.equal(result.error,'preview-stale')
    existing={}
    preview=await engine.migrateInspect({packPath:'/pack',targetWs:'/target'})
    result=await engine.migrateImport({packPath:'/pack',targetWs:'/target',previewToken:preview.previewToken})
    assert.equal(result.ok,true,'Unchanged inspected pack and target can be imported')
    assert.equal(await readFile(path.join(dir,'target','MEMORY.md'),'utf8'),'changed content')
  }finally{await rm(dir,{recursive:true,force:true})}
})

await test('5–6. deterministic transfer exposes pending progress; detect/reentry cannot overlap or change active state; cancel/retry/failure/ready',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'issue160-python-'))
  let pending=deferred(),calls=0,mode='cancel'
  const setup=createPythonSetupPre({dshHome:dir,download:async(url,target,progress,cancelled)=>{
    calls++;progress(20,100)
    if(target.endsWith('.onnx')) {
      await pending.promise
      if(cancelled())throw Error('cancelled')
      if(mode==='failure')throw Error('fake failure')
      const file=await open(target,'w');await file.truncate(101*1024*1024);await file.close()
    }else await writeFile(target,'{}')
  }})
  try{
    const download=setup.downloadModel()
    await Promise.resolve()
    assert.equal(setup.status().phase,'downloading');assert.equal(setup.status().dl.bytesDone,20)
    const detected=await setup.detect();assert.equal(detected.phase,'downloading','Detect is read-only during an active transfer')
    await setup.downloadModel();assert.equal(calls,1,'Reentry does not start another transfer')
    setup.cancelDownload();pending.resolve();await download
    assert.equal(setup.status().phase,'idle');assert.equal(setup.status().activeOperation,'')
    mode='failure';pending=deferred();const failing=setup.downloadModel();pending.resolve();await failing
    assert.equal(setup.status().phase,'error')
    mode='ready';pending=deferred();const ready=setup.downloadModel();pending.resolve();await ready
    assert.equal(setup.status().phase,'ready');assert.equal(setup.status().error,'');assert(setup.status().configOk)
    assert.equal(setup.status().activeOperation,'')
  }finally{await rm(dir,{recursive:true,force:true})}
})
