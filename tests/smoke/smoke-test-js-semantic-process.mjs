#!/usr/bin/env node
/**
 * #156: real child-process boundary and lifecycle, with a tiny offline fake peer.
 * No transformers install/model download/native sharp reproduction is required.
 * Run on Linux AND Windows; a different PID is essential (threads are insufficient).
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createJsSemanticEnginePre, probeJsSemanticAssets } from '../../lib/semantic-js.js'
import { createJsSemanticProcessPre } from '../../lib/semantic-js-process.js'

const root = mkdtempSync(path.join(tmpdir(), 'js semantic 空格-'))
const oldHome = process.env.DSH_HOME
process.env.DSH_HOME = path.join(root, 'home')
const pluginDir = path.join(root, 'pkg', 'lib')
const peerDir = path.join(root, 'pkg', 'node_modules', '@huggingface', 'transformers')
const modelsDir = path.join(root, 'models')
const controlFile = path.join(root, 'control.json')
const logFile = path.join(root, 'calls.jsonl')
const engines = []
let passed = 0
function check(condition, message) { assert.ok(condition, message); passed++; console.log('  ok - ' + message) }
function control(value = {}) { writeFileSync(controlFile, JSON.stringify(value)) }
function logs() { return existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [] }
function clean(text) { return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 1200) }
function vectorFor(text) {
  let value = 0
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) % 384
  const vector = new Float32Array(384)
  vector[value] = 1
  return vector
}
function alive(pid) { try { process.kill(pid, 0); return true } catch (_) { return false } }
async function until(predicate, message, limit = 10000) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > limit) throw new Error(message)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
function make(overrides = {}) {
  const engine = createJsSemanticEnginePre({
    pluginDir, modelsDirCandidates: [modelsDir], peerDirCandidates: [peerDir],
    startupTimeoutMs: 5000, requestTimeoutMs: 1000, degradedRetryMs: 250,
    ...overrides,
  })
  engines.push(engine)
  return engine
}
async function recovered(engine, previousPid) {
  await until(() => Date.now() - engine.status().degradedAt >= engine.status().degradedRetryMs, 'cooldown did not end')
  const value = await engine.embedQuery('recovered')
  check(value instanceof Float32Array && engine.status().workerPid !== previousPid, 'cooldown starts a fresh healthy process')
}

mkdirSync(pluginDir, { recursive: true })
mkdirSync(peerDir, { recursive: true })
mkdirSync(path.join(modelsDir, 'multilingual-e5-small', 'onnx'), { recursive: true })
writeFileSync(path.join(modelsDir, 'multilingual-e5-small', 'onnx', 'model_quantized.onnx'), 'test-only asset')
control()
writeFileSync(path.join(peerDir, 'package.json'), JSON.stringify({
  name: '@huggingface/transformers', version: '0.0.0-test', type: 'module', main: './index.js',
  exports: { '.': './index.js' },
}))
writeFileSync(path.join(peerDir, 'index.js'), [
  "import { appendFileSync, readFileSync } from 'node:fs'",
  'const logFile = ' + JSON.stringify(logFile),
  'const controlFile = ' + JSON.stringify(controlFile),
  "const record = (value) => appendFileSync(logFile, JSON.stringify({pid:process.pid,...value}) + '\\n')",
  "const controls = () => JSON.parse(readFileSync(controlFile, 'utf8'))",
  "globalThis.DAM_TEST_TRANSFORMERS_PID = process.pid",
  "record({kind:'import'})",
  'export const env = {}',
  'const vectorFor = ' + vectorFor.toString(),
  'export async function pipeline(task, model, options) {',
  "  record({kind:'pipeline',task,model,options,env:{...env}})",
  "  if (env.allowRemoteModels !== false || env.allowLocalModels !== true) throw new Error('remote models were not disabled')",
  "  if (controls().initError) { const e = new Error('fixture ERR_DLOPEN_FAILED'); e.code = 'ERR_DLOPEN_FAILED'; throw e }",
  "  if (controls().initHang) return new Promise(() => {})",
  '  return async (text, options) => {',
  "    record({kind:'embed',text,options})",
  "    if (text.includes('__crash__')) process.exit(17)",
  "    if (text.includes('__disconnect__')) { process.disconnect(); return new Promise(() => {}) }",
  "    if (text.includes('__hang__')) return new Promise(() => {})",
  "    if (controls().badDimension) return {data: new Float32Array(3)}",
  "    if (controls().zeroVector) return {data: new Float32Array(384)}",
  '    return {data: vectorFor(text)}',
  '  }',
  '}',
].join('\n'))

try {
  const engine = make()
  check(!engine.status().ready && engine.status().workerPid === null, 'creation/status are lazy and do not spawn')
  probeJsSemanticAssets(pluginDir, [peerDir])
  check(logs().length === 0 && globalThis.DAM_TEST_TRANSFORMERS_PID === undefined, 'asset probing never imports transformers')
  const text = '  a  \n b ' + 'x'.repeat(1300)
  const [query, passages] = await Promise.all([engine.embedQuery(text), engine.embedPassages(['first', 'second'])])
  const pid = engine.status().workerPid
  check(Number.isInteger(pid) && pid !== process.pid, 'transformers runs in a different OS process')
  check(globalThis.DAM_TEST_TRANSFORMERS_PID === undefined && logs().every((row) => row.pid === pid), 'host never evaluates the peer')
  check(logs().filter((row) => row.kind === 'import').length === 1, 'concurrent initialization shares one worker')
  check(query instanceof Float32Array && query.length === 384 && passages.every((v) => v instanceof Float32Array), 'advanced IPC preserves Float32Array values')
  assert.deepEqual(query, vectorFor('query: ' + clean(text)))
  assert.deepEqual(passages, ['first', 'second'].map((t) => vectorFor('passage: ' + t)))
  check(true, 'e5 prefixes, whitespace cleaning and 1200-character cap are preserved')
  const boundary = 'x'.repeat(1199) + ' y'
  assert.deepEqual(await engine.embedQuery(boundary), vectorFor('query: ' + clean(boundary)))
  assert.deepEqual(await engine.embedPassages([boundary]), [vectorFor('passage: ' + clean(boundary))])
  check(logs().some((row) => row.text === 'query: ' + 'x'.repeat(1199) + ' ')
    && logs().some((row) => row.text === 'passage: ' + 'x'.repeat(1199) + ' '),
    'IPC bounding preserves a normalized space at the 1200-character boundary')
  const pipeline = logs().find((row) => row.kind === 'pipeline')
  check(pipeline.env.allowRemoteModels === false && pipeline.env.localModelPath === modelsDir
    && pipeline.task === 'feature-extraction' && pipeline.model === 'multilingual-e5-small'
    && pipeline.options.dtype === 'q8', 'model setup stays local, offline and q8')
  check(logs().filter((row) => row.kind === 'embed').every((row) =>
    row.options.pooling === 'mean' && row.options.normalize === true && row.options.truncation === true), 'inference flags are unchanged')
  const many = Array.from({ length: 130 }, (_, i) => 'batch ' + i)
  assert.deepEqual(await engine.embedPassages(many), many.map((t) => vectorFor('passage: ' + t)))
  check(true, 'passage batches above IPC limit retain all vectors in order')
  const concurrent = await Promise.all(['one', 'two', 'three'].map((t) => engine.embedQuery(t)))
  assert.deepEqual(concurrent, ['one', 'two', 'three'].map((t) => vectorFor('query: ' + t)))
  check(true, 'concurrent requests receive the corresponding response')

  const miv = 'idx_pre_' + 'a'.repeat(32)
  const records = [{ memoryId: 'a', text: 'alpha' }, { memoryId: 'b', text: 'beta' }]
  const first = await engine.rank({ memoryIndexVersion: miv, records }, 'alpha')
  const passageCalls = () => logs().filter((row) => row.kind === 'embed' && row.text.startsWith('passage: ')).length
  const before = passageCalls()
  const cached = await engine.rank({ memoryIndexVersion: miv, records }, 'alpha')
  check(first.scores instanceof Map && JSON.stringify([...first.scores]) === JSON.stringify([...cached.scores])
    && passageCalls() === before, 'rank Map contract and miv cache survive process isolation')
  const grown = await engine.rank({ memoryIndexVersion: 'idx_pre_' + 'b'.repeat(32),
    records: records.concat({ memoryId: 'c', text: 'gamma' }) }, 'alpha')
  check(grown.scores.size === 3 && passageCalls() === before + 1 && engine.status().lastEmbedded === 1,
    'host incremental hash cache embeds only the new passage')

  const failed = await Promise.allSettled([engine.embedQuery('__crash__'), engine.embedQuery('pending after crash')])
  check(failed.every((result) => result.status === 'rejected') && !engine.status().ready
    && Boolean(engine.status().degraded), 'worker crash rejects every pending request and clears readiness')
  await assert.rejects(engine.embedQuery('during cooldown'))
  check(engine.status().degradedRetries === 0, 'cooldown prevents an immediate restart storm')
  await until(() => !alive(pid), 'crashed child remains alive')
  await recovered(engine, pid)
  check(engine.status().degradedRetries === 1 && engine.status().degraded === '', 'successful retry clears degraded status')

  const idlePid = engine.status().workerPid
  process.kill(idlePid, 'SIGKILL')
  await until(() => !engine.status().ready && Boolean(engine.status().degraded), 'idle crash left stale ready status')
  check(engine.status().workerPid === null, 'an idle worker crash also invalidates readiness')
  await recovered(engine, idlePid)
  await assert.rejects(engine.embedQuery('__disconnect__'))
  check(!engine.status().ready && /disconnected|exited/.test(engine.status().degraded), 'IPC disconnect is terminal and diagnosed')

  const timeoutEngine = make({ requestTimeoutMs: 150 })
  await timeoutEngine.embedQuery('warm')
  const timeoutPid = timeoutEngine.status().workerPid
  const timedOut = await Promise.allSettled([timeoutEngine.embedQuery('__hang__'), timeoutEngine.embedQuery('queued')])
  check(timedOut.every((result) => result.status === 'rejected') && /timed out/.test(timeoutEngine.status().degraded),
    'wedged worker times out and rejects its entire pending queue')
  await until(() => !alive(timeoutPid), 'timed-out child remains alive')
  await recovered(timeoutEngine, timeoutPid)

  const queueClient = createJsSemanticProcessPre({ pluginDir, modelsDir, peerDirs: [peerDir], requestTimeoutMs: 5000 })
  try {
    await queueClient.initialize()
    const queued = Array.from({ length: 64 }, () => queueClient.embedQuery('__hang__'))
    const settledQueue = Promise.allSettled(queued)
    await assert.rejects(queueClient.embedQuery('overflow'), { code: 'JS_SEMANTIC_WORKER_BUSY' })
    check(queueClient.status().pending === 64 && !queueClient.status().stopped,
      'queue rejects its 65th request without terminating accepted work')
    queueClient.dispose()
    check((await settledQueue).every((result) => result.status === 'rejected'),
      'disposing a full queue rejects all accepted requests')
  } finally { queueClient.dispose() }

  const disposeEngine = make()
  await disposeEngine.embedQuery('warm')
  const disposePid = disposeEngine.status().workerPid
  const beforeHang = logs().length
  const outstanding = disposeEngine.embedQuery('__hang__').then(() => false, () => true)
  await until(() => logs().slice(beforeHang).some((row) => row.text === 'query: __hang__'), 'pending work did not enter worker')
  disposeEngine.dispose()
  disposeEngine.dispose()
  check(await outstanding, 'dispose rejects an in-flight request and is idempotent')
  await assert.rejects(disposeEngine.embedQuery('after dispose'))
  check(await disposeEngine.rank({ memoryIndexVersion: miv, records }, 'after dispose') === null
    && disposeEngine.status().workerPid === null && !disposeEngine.status().ready, 'disposed engine cannot respawn or return rank results')
  await until(() => !alive(disposePid), 'disposed child remains alive')
  disposeEngine._resetForTest()
  await disposeEngine.embedQuery('after reset')
  check(disposeEngine.status().workerPid !== disposePid, 'test reset releases the old worker and can initialize a new one')

  control({ initHang: true })
  const initEngine = make()
  const initStart = logs().length
  const initializing = initEngine.embedQuery('first').then(() => false, () => true)
  await until(() => logs().slice(initStart).some((row) => row.kind === 'pipeline'), 'initialization did not enter worker')
  const initPid = initEngine.status().workerPid
  initEngine.dispose()
  check(await initializing, 'dispose during initialization rejects immediately')
  control()
  await assert.rejects(initEngine.embedQuery('must stay disposed'))
  check(!initEngine.status().ready, 'late initialization cannot resurrect a disposed engine')
  await until(() => !alive(initPid), 'initializing child remains alive')

  control({ initHang: true })
  const startupTimeout = make({ startupTimeoutMs: 1000 })
  await assert.rejects(startupTimeout.embedQuery('first'))
  check(/timed out/.test(startupTimeout.status().degraded), 'startup has a bounded timeout')
  control({ initError: true })
  const loadFailure = make()
  await assert.rejects(loadFailure.embedQuery('first'), /ERR_DLOPEN_FAILED/)
  check(/ERR_DLOPEN_FAILED/.test(loadFailure.status().degraded), 'native/model startup errors retain their actual cause')
  for (const mode of ['badDimension', 'zeroVector']) {
    control({ [mode]: true })
    const bad = make()
    await assert.rejects(bad.embedQuery('first'))
    check(!bad.status().ready && Boolean(bad.status().degraded), 'self-test rejects ' + mode)
  }
  control()
  const noModel = make({ modelsDirCandidates: [path.join(root, 'missing-models')] })
  await assert.rejects(noModel.embedQuery('x'), /model asset missing/)
  check(noModel.status().workerPid === null, 'missing model fails before spawning')

  // A host with an idle worker must exit naturally; its child must not become an orphan.
  const helper = path.join(root, 'host.mjs')
  writeFileSync(helper, 'import { createJsSemanticEnginePre } from '
    + JSON.stringify(new URL('../../lib/semantic-js.js', import.meta.url).href) + '\n'
    + 'const engine = createJsSemanticEnginePre(' + JSON.stringify({ pluginDir, modelsDirCandidates: [modelsDir], peerDirCandidates: [peerDir] }) + ')\n'
    + "await engine.embedQuery('host lifetime')\nconsole.log(engine.status().workerPid)\n")
  const hostResult = await new Promise((resolve, reject) => {
    const host = spawn(process.execPath, [helper], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = '', errors = ''
    const timer = setTimeout(() => { host.kill('SIGKILL'); reject(new Error('idle worker prevented host exit')) }, 10000)
    host.stdout.on('data', (chunk) => { output += chunk })
    host.stderr.on('data', (chunk) => { errors += chunk })
    host.on('error', (error) => { clearTimeout(timer); reject(error) })
    host.on('close', (code) => { clearTimeout(timer); resolve({ code, output, errors }) })
  })
  check(hostResult.code === 0, 'idle worker does not keep its host alive: ' + hostResult.errors)
  const orphanPid = Number(hostResult.output.trim())
  check(Number.isInteger(orphanPid) && orphanPid > 0, 'lifetime fixture initialized a real worker')
  await until(() => !alive(orphanPid), 'worker survived parent exit')
  check(true, 'parent exit terminates its child')

  const hostSource = readFileSync(new URL('../../lib/semantic-js.js', import.meta.url), 'utf8')
  const bridgeSource = readFileSync(new URL('../../lib/semantic-js-process.js', import.meta.url), 'utf8')
  check(!hostSource.includes("import('@huggingface/transformers')") && !bridgeSource.includes("import('@huggingface/transformers')")
    && !bridgeSource.includes("from 'node:worker_threads'"), 'host path has no direct transformer import or thread-only fallback')
  check(logs().filter((row) => row.kind === 'import').every((row) => row.pid !== process.pid), 'all peer imports stayed outside the test host')
} finally {
  for (const engine of engines) engine.dispose()
  if (oldHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = oldHome
  // SIGKILL is asynchronous; wait before deleting fixture files on Windows.
  await new Promise((resolve) => setTimeout(resolve, 100))
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}
console.log('[js-semantic-process] pass=' + passed)
