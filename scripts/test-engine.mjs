import { extract } from '../lib/engine/extract.ts'
import { score, LAYER_LABEL } from '../lib/engine/rubric.ts'
import path from 'node:path'

const root = path.resolve('fixtures/aurora-ui')
const facts = extract(root)

console.log('=== FACTS ===')
console.log('package      :', facts.packageName, '| private:', facts.private)
console.log('exports map  :', facts.hasExports, '| agentDocs:', facts.hasAgentDocs, '| types:', facts.hasTypes)
console.log('components   :', facts.components.length, '->', facts.components.map(c => c.name).join(', '))
console.log('degraded     :', facts.degraded, facts.degradedReason ?? '')
console.log('tokens       :', facts.tokens.length, '| semantic:', facts.tokens.filter(t=>t.tier==='semantic').length, '| primitive:', facts.tokens.filter(t=>t.tier==='primitive').length)
console.log('cascade      : layers[', facts.cssLayers.join(',') || 'none', '] layered:', facts.layeredSelectors, 'unlayered:', facts.unlayeredSelectors)
console.log('raw values   :', facts.rawValueTotal)
console.log('knowledge    :', JSON.stringify(facts.knowledgeFiles))
console.log()
for (const c of facts.components) {
  console.log(`  ${c.name.padEnd(8)} exported:${String(c.exported).padEnd(5)} props:${String(c.props.length).padEnd(3)} axes:[${Object.keys(c.variants).join(',')}] defaults:${JSON.stringify(c.defaultVariants)} open:[${c.openVariants.join(',')}] raw:${c.rawValues.length}`)
}

const sc = score(facts)
console.log()
console.log('=== SCORE ===')
console.log('composite   :', sc.composite, '(uncapped', sc.uncapped + ')')
console.log('cap applied :', sc.appliedCap ? `${sc.appliedCap.id} @ ${sc.appliedCap.cap} — ${sc.appliedCap.reason}` : 'none')
console.log('verdict     :', sc.verdict.label, '—', sc.verdict.headline)
console.log('counts      :', JSON.stringify(sc.counts))
for (const a of sc.axes) console.log(`  ${a.label.padEnd(10)} ${String(a.value ?? '—').padStart(3)}  (w ${a.weight}, scored ${a.scored}, unscored ${a.unscored})`)
console.log()
console.log('=== FAILING CHECKS ===')
for (const c of sc.checks.filter(c => c.status === 'fail')) {
  console.log(`  ${c.layer} ${c.severity.padEnd(5)} ${c.title}`)
  for (const e of c.evidence.slice(0,2)) console.log(`        ${e.file}${e.line ? ':'+e.line : ''}  ${e.excerpt.slice(0,90)}`)
}
console.log()
console.log('=== LADDER (points per hour) ===')
for (const r of sc.ladder.slice(0, 8)) console.log(`  ${String(r.perHour).padStart(5)}  ${r.hours}h  +${r.points}  ${r.title}`)
