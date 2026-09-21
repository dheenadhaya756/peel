import { extract } from '../lib/engine/extract.ts'
import { score } from '../lib/engine/rubric.ts'
import { convert } from '../lib/generate/index.ts'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('fixtures/aurora-ui')
const facts = extract(root)
const before = score(facts)

const result = convert(facts, before, ['Button', 'Card'])

console.log('=== CONVERSION ===')
console.log('files       :', Object.keys(result.files).length)
console.log('stats       :', JSON.stringify(result.stats))
console.log('tokens      : primitive', result.tokens.filter(t=>t.tier==='primitive').length, '| semantic', result.tokens.filter(t=>t.tier==='semantic').length)
console.log()
console.log('--- file tree ---')
for (const f of Object.keys(result.files).sort()) console.log('  ', f)
console.log()
console.log('--- TODO(human) ---')
result.todos.forEach(t => console.log('  •', t))

// Write it out and re-score the OUTPUT — the before/after must be measured, not projected.
const out = path.resolve('data/test-output')
fs.rmSync(out, { recursive: true, force: true })
for (const [rel, body] of Object.entries(result.files)) {
  const p = path.join(out, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body)
}

const afterFacts = extract(out)
const after = score(afterFacts)
console.log()
console.log('=== MEASURED BEFORE / AFTER ===')
console.log(`composite   ${String(before.composite).padStart(3)}  ->  ${String(after.composite).padStart(3)}`)
console.log(`verdict     ${before.verdict.label}  ->  ${after.verdict.label}`)
for (let i = 0; i < before.axes.length; i++) {
  console.log(`  ${before.axes[i].label.padEnd(10)} ${String(before.axes[i].value ?? '—').padStart(3)}  ->  ${String(after.axes[i].value ?? '—').padStart(3)}`)
}
console.log('cap before  :', before.appliedCap?.id ?? 'none', '| after:', after.appliedCap?.id ?? 'none')
console.log('raw values  :', facts.rawValueTotal, '->', afterFacts.rawValueTotal)
console.log('open unions :', facts.components.filter(c=>c.openVariants.length).length, '->', afterFacts.components.filter(c=>c.openVariants.length).length)

// ---- visual book ----
import { buildVisualBook } from '../lib/generate/visualbook.ts'
const book = buildVisualBook({ facts, before, after, components: result.components, tokens: result.tokens, files: result.files, todos: result.todos })
fs.writeFileSync(path.join(out, 'visual-book.html'), book)
console.log()
console.log('visual book :', (book.length/1024).toFixed(1) + ' KB ->', path.join(out, 'visual-book.html'))
