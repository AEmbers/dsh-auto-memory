import { readFileSync } from 'node:fs'

const s = readFileSync('D:/dsh-auto-memory/lib/client.js', 'utf8')
const a = s.indexOf('var CHANGELOG = {')
const b = s.indexOf("'3.1.7':", a)
const block = s.slice(a, b)
console.log(block)
console.log('---LEN---', block.length)
