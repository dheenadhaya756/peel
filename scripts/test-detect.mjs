import { extract } from '../lib/engine/extract.ts'
import { score } from '../lib/engine/rubric.ts'
import path from 'node:path'
const root = path.resolve(process.argv[2])
const f = extract(root)
console.log('located   :', f.locatedReason)
console.log('components:', f.components.length)
f.components.slice(0, 18).forEach(c =>
  console.log(`   ${c.name.padEnd(22)} props:${String(c.props.length).padStart(2)} axes:[${Object.keys(c.variants).join(',')}] raw:${String(c.rawValues.length).padStart(3)} exported:${c.exported}`))
if (f.components.length > 18) console.log(`   … ${f.components.length - 18} more`)
console.log('degraded  :', f.degraded, f.degradedReason ?? '')
const s = score(f)
console.log('score     :', s.composite, s.verdict.label)
