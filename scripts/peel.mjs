#!/usr/bin/env node
/**
 * Peel, headless.
 *
 *   node scripts/peel.mjs <github-url | local-path | file.zip> [options]
 *
 *     --components Button,Card   which to convert (default: the two worst)
 *     --out <dir>                output directory (default: ./agent-ready)
 *     --score-only               audit and stop, write nothing
 *     --json                     machine-readable output
 *
 * Writes nothing until the audit is printed, and never touches the input.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// The engine is TypeScript; Node 24 strips types, but the imports are extensionless,
// so a resolve hook is needed to find them the way the bundler does.
const { register } = await import('node:module')
register(pathToFileURL(path.join(APP, 'scripts', 'ts-resolve.mjs')).href)

const { extract } = await import(pathToFileURL(path.join(APP, 'lib/engine/extract.ts')).href)
const { score } = await import(pathToFileURL(path.join(APP, 'lib/engine/rubric.ts')).href)
const { convert } = await import(pathToFileURL(path.join(APP, 'lib/generate/index.ts')).href)
const { buildVisualBook } = await import(pathToFileURL(path.join(APP, 'lib/generate/visualbook.ts')).href)
const { ingestGithub, ingestLocal, ingestZip } = await import(pathToFileURL(path.join(APP, 'lib/ingest/index.ts')).href)

/* ------------------------------------------------------------------- args */

const argv = process.argv.slice(2)
if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
  console.log(`
peel — score a design system for agent readiness, convert it, prove it

  node scripts/peel.mjs <github-url | local-path | file.zip> [options]

    --components Button,Card   which components to convert
    --out <dir>                output directory (default ./agent-ready)
    --score-only               audit and stop
    --json                     machine-readable
`)
  process.exit(0)
}

const input = argv[0]
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
}
const has = (name) => argv.includes(`--${name}`)

const outDir = path.resolve(flag('out', './agent-ready'))
const asJson = has('json')

const log = (...a) => { if (!asJson) console.log(...a) }

/* ----------------------------------------------------------------- ingest */

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'peel-'))
const srcDir = path.join(scratch, 'source')

let label = input
if (/^https?:\/\/|github\.com/.test(input)) {
  log(`fetching ${input} …`)
  const r = await ingestGithub(input, srcDir)
  label = r.name
  log(`  ${r.files} source files`)
} else if (/\.zip$/i.test(input)) {
  const r = await ingestZip(new Uint8Array(fs.readFileSync(input)), srcDir, path.basename(input))
  label = r.name
  log(`  ${r.files} source files from ${path.basename(input)}`)
} else {
  const abs = path.resolve(input)
  if (!fs.existsSync(abs)) { console.error(`No such path: ${abs}`); process.exit(1) }
  const r = ingestLocal(abs, srcDir)
  label = r.name
  log(`  ${r.files} files from ${abs}`)
}

/* ------------------------------------------------------------ audit + score */

const facts = extract(srcDir)
const before = score(facts)

const bar = (n) => {
  const filled = Math.round((n ?? 0) / 10)
  return '█'.repeat(filled) + '░'.repeat(10 - filled)
}

if (!asJson) {
  console.log()
  console.log(`  ${facts.packageName}`)
  console.log(`  ${facts.locatedReason}`)
  if (facts.locatedCandidates.length) {
    console.log(`  also in the tree: ${facts.locatedCandidates.map((c) => `${c.name} (${c.components})`).join(', ')}`)
  }
  console.log()
  console.log(`  ${before.verdict.label.toUpperCase()} — ${before.composite}/100`)
  console.log(`  ${before.verdict.headline}`)
  console.log(`  ${before.verdict.meaning}`)
  console.log()
  for (const a of before.axes) {
    console.log(`  ${a.label.padEnd(10)} ${bar(a.value)}  ${String(a.value ?? '—').padStart(3)}   ${a.question}`)
  }
  if (before.appliedCap) {
    console.log()
    console.log(`  capped at ${before.appliedCap.cap} — ${before.appliedCap.reason} (uncapped ${before.uncapped})`)
  }
  if (facts.degraded) {
    console.log(`  DEGRADED READ — ${facts.degradedReason}. Affected checks report unscored, not pass.`)
  }

  console.log()
  console.log(`  FINDINGS  ${before.counts.blockers} blocker · ${before.counts.fail} failing · ${before.counts.pass} passing · ${before.counts.unscored} unscored`)
  console.log()
  for (const c of before.checks.filter((x) => x.status === 'fail')) {
    console.log(`  ${c.layer} ${c.severity.padEnd(5)} ${c.title}`)
    const e = c.evidence[0]
    if (e) console.log(`             ${e.file}${e.line ? `:${e.line}` : ''}  ${e.excerpt.slice(0, 84)}`)
  }

  if (before.ladder.length) {
    console.log()
    console.log('  WHAT TO DO FIRST   (ranked by points bought per hour)')
    console.log()
    for (const r of before.ladder.slice(0, 6)) {
      console.log(`  ${String(r.perHour).padStart(5)}  ${String(r.hours).padStart(4)}h  +${String(r.points).padStart(4)}  ${r.title}`)
    }
  }
  console.log()
}

if (has('score-only')) {
  if (asJson) console.log(JSON.stringify({ facts, before }, null, 2))
  fs.rmSync(scratch, { recursive: true, force: true })
  process.exit(0)
}

/* --------------------------------------------------------------- convert */

const available = facts.components.map((c) => c.name)
const requested = flag('components')
const selected = requested
  ? requested.split(',').map((s) => s.trim()).filter((n) => available.includes(n))
  : [...facts.components]
      .sort((a, b) => (b.openVariants.length * 10 + b.rawValues.length) - (a.openVariants.length * 10 + a.rawValues.length))
      .slice(0, 2)
      .map((c) => c.name)

if (!selected.length) {
  console.error(`None of those components exist. Found: ${available.slice(0, 20).join(', ')}`)
  process.exit(1)
}

log(`  converting ${selected.join(', ')} …`)

const result = await convert(facts, before, selected)
fs.rmSync(outDir, { recursive: true, force: true })
for (const [rel, body] of Object.entries(result.files)) {
  const p = path.join(outDir, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body, 'utf8')
}

// Re-measure what was actually written. Never report a projected delta.
const afterFacts = extract(outDir)
const after = score(afterFacts)

const book = buildVisualBook({
  facts, before, after,
  components: result.components,
  tokens: result.tokens,
  files: result.files,
  todos: result.todos,
})
fs.writeFileSync(path.join(outDir, 'visual-book.html'), book, 'utf8')

if (asJson) {
  console.log(JSON.stringify({ before, after, stats: result.stats, todos: result.todos, out: outDir }, null, 2))
} else {
  console.log()
  console.log('  ─────────────────────────────────────────────────────')
  console.log(`  ${before.composite} → ${after.composite}    ${before.verdict.label} → ${after.verdict.label}`)
  console.log('  ─────────────────────────────────────────────────────')
  console.log()
  for (let i = 0; i < before.axes.length; i++) {
    console.log(`  ${before.axes[i].label.padEnd(10)} ${String(before.axes[i].value ?? '—').padStart(3)} → ${String(after.axes[i].value ?? '—').padStart(3)}`)
  }
  console.log()
  console.log(`  raw values      ${facts.rawValueTotal} → ${afterFacts.rawValueTotal}`)
  console.log(`  open unions     ${facts.components.filter((c) => c.openVariants.length).length} → ${afterFacts.components.filter((c) => c.openVariants.length).length}`)
  console.log(`  semantic tokens 0 → ${result.stats.semanticCount}`)
  console.log()
  console.log(`  ${Object.keys(result.files).length + 1} files → ${outDir}`)
  console.log(`  visual book     ${path.join(outDir, 'visual-book.html')}`)
  console.log()
  if (result.todos.length) {
    console.log(`  DECISIONS TAKEN — ${result.todos.length} assumption(s). Nothing was guessed; the output is complete as it stands.`)
    console.log()
    result.todos.forEach((t, i) => console.log(`   ${i + 1}. ${t}`))
    console.log()
  }
}

fs.rmSync(scratch, { recursive: true, force: true })
