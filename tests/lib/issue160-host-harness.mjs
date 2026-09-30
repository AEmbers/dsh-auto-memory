import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
export async function hostHarness(root) {
  const file=path.join(root,'lib',`.issue160-host-${process.pid}.mjs`)
  const source=readFileSync(path.join(root,'lib/index.js'),'utf8').replace(/\r\n/g,'\n')
    .replace('class MemoryEngine {','export class MemoryEngine {')
    .replace(/(?<!export )async function applyRuleEditPre\(/,'export async function applyRuleEditPre(')
  writeFileSync(file,source)
  try { return await import(pathToFileURL(file).href) } finally { unlinkSync(file) }
}
