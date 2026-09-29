/** 读 G:\dsh_desktop 本地版本：asar 头解析（正确格式）+ 附带产物 */
import { readFileSync } from 'node:fs'

const ASAR = 'G:/dsh_desktop/resources/app.asar'
const b = readFileSync(ASAR)
console.log('asar 头魔数      :', b.readUInt32LE(0))
const jsonLen = b.readUInt32LE(12)
console.log('JSON 头长度      :', jsonLen)
const hdr = JSON.parse(b.slice(16, 16 + jsonLen).toString('utf8'))
console.log('顶层条目         :', Object.keys(hdr.files).join(', '))

const pick = (p) => {
  let cur = hdr.files
  for (const seg of p.split('/')) { if (!cur || !cur[seg]) return null; cur = cur[seg] }
  return cur
}
const readFileFromAsar = (p) => {
  const e = pick(p); if (!e || !e.offset) return null
  const off = 16 + jsonLen + Number(e.offset)
  return b.slice(off, off + Number(e.size)).toString('utf8')
}

const pkgTxt = readFileFromAsar('package.json')
if (pkgTxt) {
  const pkg = JSON.parse(pkgTxt)
  console.log('---- app package.json ----')
  for (const k of ['name', 'version', 'productName', 'description', 'homepage', 'author']) {
    if (pkg[k] !== undefined) console.log('  ' + k + ': ' + JSON.stringify(pkg[k]))
  }
  if (pkg.repository) console.log('  repository: ' + JSON.stringify(pkg.repository))
  if (pkg.build) console.log('  build.publish: ' + JSON.stringify(pkg.build.publish))
} else {
  console.log('未在 asar 内找到 package.json；可见顶层：')
  console.log(JSON.stringify(Object.keys(hdr.files), null, 1))
}
