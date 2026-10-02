import { readdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

/**
 * 影响面预检（2026-10-02 用户要求：「跑之前看一下，能看出来哪儿会有变化、哪儿需要改」）。
 *
 * 全量回归一次约 75s；盲跑 259 个套件把「定位」成本推给了第二次运行。本模块只做只读推断。
 *
 * ★为什么用「依赖边」而不是「路径提及」或「符号提及」（两种都被实测否掉）：
 *   ① 按路径提及：205/259 命中 —— 绝大多数套件在注释里就写了 lib/index.js，等于没筛。
 *   ② 按 diff 符号提及：177 命中 —— diff 里必然有 current/member/conflict 这类通用词，
 *      它们在任何套件里都能命中。
 *   ③ 依赖边（本实现）：只看套件**是否真的 import / 读取**某个改动文件（字符串字面量里的
 *      路径），命中集小且可解释。
 *
 * 输出：
 *   changed —— 本次改动的受管源码（lib/tests/tools/python/skins 下的源码类文件）
 *   hit     —— 依赖这些改动文件的套件（附命中的文件）
 *   lock    —— **基线锁**套件（sha 哈希 / 路由计数 / 端点条数）。lib/index.js 或
 *             lib/client.js 一改就必须跑：锁的就是「文件一改就得跟着上移的常量」。
 *
 * 纪律：命中集只用于「先跑这批」，**不删任何套件**；全量仍由默认路径负责。
 */
const LOCK_RE = /createHash\('sha256'\)|sha16|registeredRoutes\.length|expected \d+ routes|基线守恒|端点条数/
const MANAGED_RE = /^(lib|tests|tools|python|skins)\//
const SOURCE_RE = /\.(mjs|cjs|js|json|py|css)$/

function git(root, args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }) }

function changedManaged(root) {
  return [...new Set(git(root, ['status', '--porcelain']).split('\n')
    .map((l) => l.slice(3).trim()).filter(Boolean)
    .map((p) => p.replace(/^"|"$/g, '').replace(/\\/g, '/'))
    .filter((p) => !p.endsWith('/') && MANAGED_RE.test(p) && SOURCE_RE.test(p)))]
}

/** 抽出套件正文里所有「看起来像本地文件路径」的字符串字面量。 */
function referencedPaths(src) {
  const out = new Set()
  const push = (s) => {
    if (typeof s !== 'string' || !s) return
    if (!/[./]/.test(s)) return
    if (/^(node:|https?:|data:)/.test(s)) return
    out.add(s.replace(/\\/g, '/'))
  }
  for (const m of src.matchAll(/from\s+'([^']+)'/g)) push(m[1])
  for (const m of src.matchAll(/from\s+"([^"]+)"/g)) push(m[1])
  for (const m of src.matchAll(/['"]([^'"]*?(?:lib|skins|tools|python)\/[^'"]+)['"]/g)) push(m[1])
  return [...out]
}

/** 把引用串解析为仓库相对路径（粗解析，允许 ./ ../ 与裸相对路径）。 */
export function resolveRef(ref, suiteRelDir) {
  if (!ref.startsWith('.')) return ref.replace(/^\.\//, '')
  const joined = path.posix.normalize(path.posix.join(suiteRelDir, ref))
  return joined
}

export function analyzeImpact({ root, smokeDir }) {
  const changed = changedManaged(root)
  const changedSet = new Set(changed)
  const suites = readdirSync(smokeDir).filter((n) => n.endsWith('.mjs')).sort()
  const hit = new Map()
  const lock = []
  for (const name of suites) {
    let src = ''
    try { src = readFileSync(path.join(smokeDir, name), 'utf8') } catch (_) { continue }
    const suiteRel = 'tests/smoke'
    const reasons = new Set()
    for (const ref of referencedPaths(src)) {
      const rel = resolveRef(ref, suiteRel)
      if (changedSet.has(rel)) reasons.add(rel)
      // 也接受「指向仓库根的相对路径」写法（如 new URL('../../lib/x.js') 已被上面归一）。
      const base = rel.replace(/^\.\.\//, '')
      if (changedSet.has(base)) reasons.add(base)
    }
    if (changedSet.has(suiteRel + '/' + name)) reasons.add(suiteRel + '/' + name)
    if (reasons.size) hit.set(name, [...reasons])
    if (LOCK_RE.test(src)) lock.push(name)
  }
  const coreTouched = changed.some((c) => c === 'lib/index.js' || c === 'lib/client.js')
  return { changed, hit, lock, coreTouched }
}

export { analyzeImpact as default }
