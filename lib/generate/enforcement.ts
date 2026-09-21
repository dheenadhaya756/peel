/**
 * Layer 3 enforcement artifacts.
 *
 * A rule that nothing checks is decoration. These files are what turn the prose in
 * RULES.md into something that fails a build, which is the difference between a
 * system that is "structured for humans" and one that is validated in code.
 */
import type { GeneratedComponent } from './component'
import type { GeneratedToken } from './tokens'

/** One story per variant value, one per state — generated FROM guidance, never by hand. */
export function buildStories(c: GeneratedComponent): string {
  const axes = Object.entries(c.guidance.variants)
  const label = /input/i.test(c.name) ? '' : `${c.name}`

  const variantStories = axes.flatMap(([axis, values]) =>
    values.map(
      (v) => `export const ${cap(axis)}${cap(v)} = () => <${c.name} ${axis}="${v}">${label} ${v}</${c.name}>`,
    ),
  )

  const stateStories = c.guidance.states
    .filter((s) => s.name === 'disabled' || s.name === 'loading')
    .map((s) => `export const ${cap(s.name)} = () => <${c.name} ${s.name}>${label} ${s.name}</${c.name}>`)

  return `import * as React from 'react'
import { ${c.name} } from './${c.name}'

/**
 * Generated from guidance.yaml — one story per variant value, one per state.
 *
 * A variant or state that cannot be rendered from its own documentation is a
 * FINDING, not a broken story: it means the contract claims something the code
 * does not do.
 */
export default { title: 'After/${c.name}', component: ${c.name} }

${variantStories.join('\n')}
${stateStories.length ? '\n' + stateStories.join('\n') : ''}

/** Every variant of every axis, side by side. */
export const AllVariants = () => (
  <div style={{ display: 'grid', gap: 16 }}>
${axes
  .map(
    ([axis, values]) => `    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
${values.map((v) => `      <${c.name} ${axis}="${v}">${label} ${v}</${c.name}>`).join('\n')}
    </div>`,
  )
  .join('\n')}
  </div>
)
`
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * The conformance checker. Runs over GENERATED SCREENS, not over the library.
 *
 * Every finding names its fix — a checker that reports a problem hands the repair
 * loop a problem; one that names the fix hands it a patch.
 */
export function buildConformanceChecker(tokens: GeneratedToken[], components: GeneratedComponent[]): string {
  const semantic = tokens.filter((t) => t.tier === 'semantic').map((t) => t.name)
  const known = components.map((c) => c.name)
  const variantMap = Object.fromEntries(components.map((c) => [c.name, c.guidance.variants]))

  return `#!/usr/bin/env node
/**
 * Conformance checker — run this over generated screens, never over the library.
 *
 *   node scripts/check-conformance.mjs "src/**/*.tsx"
 *
 * Exit code 1 on any finding. Wire it into CI, or the rules are advisory only.
 */
import fs from 'node:fs'
import path from 'node:path'

const SEMANTIC_TOKENS = ${JSON.stringify(semantic, null, 2)}
const COMPONENTS = ${JSON.stringify(known)}
const VARIANTS = ${JSON.stringify(variantMap, null, 2)}

const findings = []
const add = (file, line, rule, problem, fix) => findings.push({ file, line, rule, problem, fix })

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    e.isDirectory() ? walk(p, out) : /\\.(tsx|jsx)$/.test(p) && out.push(p)
  }
  return out
}

const target = process.argv[2] ?? 'src'
const files = fs.existsSync(target) && fs.statSync(target).isDirectory() ? walk(target) : [target]

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  text.split('\\n').forEach((line, i) => {
    const n = i + 1

    // 1. raw values
    for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\\b|(?<![\\w-])\\d{2,4}px\\b/g)) {
      add(file, n, 'raw-value', \`raw value \${m[0]}\`,
        'use a semantic token: ' + SEMANTIC_TOKENS.slice(0, 3).join(', ') + ', …')
    }

    // 2. invented variant values — the case that otherwise compiles
    for (const m of line.matchAll(/<([A-Z][A-Za-z0-9]*)\\s[^>]*?\\b(variant|size|tone|padding)="([^"]+)"/g)) {
      const [, comp, axis, value] = m
      const allowed = VARIANTS[comp]?.[axis]
      if (allowed && !allowed.includes(value)) {
        add(file, n, 'invented-variant', \`\${comp} \${axis}="\${value}" is not in the closed set\`,
          \`use one of: \${allowed.join(', ')}\`)
      }
    }

    // 3. hand-rolled elements the system already provides
    for (const m of line.matchAll(/<(button|input)\\b/g)) {
      const better = m[1] === 'button' ? 'Button' : 'Input'
      if (COMPONENTS.includes(better)) {
        add(file, n, 'hand-rolled', \`<\${m[1]}> written by hand\`, \`use <\${better}> from the design system\`)
      }
    }

    // 4. appearance smuggled through className
    for (const m of line.matchAll(/className="([^"]*)"/g)) {
      const appearance = m[1].split(/\\s+/).filter((c) => /^(bg|text|border|shadow|rounded)-/.test(c))
      if (appearance.length && /<[A-Z]/.test(line)) {
        add(file, n, 'appearance-override', \`appearance utilities on a system component: \${appearance.join(' ')}\`,
          'className is layout and position only — change the variant instead')
      }
    }
  })
}

if (!findings.length) {
  console.log(\`conformance: clean — \${files.length} file(s) checked\`)
  process.exit(0)
}

console.error(\`conformance: \${findings.length} finding(s)\\n\`)
for (const f of findings) {
  console.error(\`  \${f.file}:\${f.line}  [\${f.rule}]\`)
  console.error(\`    problem: \${f.problem}\`)
  console.error(\`    fix:     \${f.fix}\\n\`)
}
process.exit(1)
`
}

export function buildCi(packageName: string): string {
  return `name: design system

on:
  pull_request:
  push:
    branches: [main]

jobs:
  gates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci

      # The vocabulary must stay closed.
      - name: typecheck
        run: npx tsc --noEmit

      # Generated screens must not reach outside the system.
      - name: conformance
        run: node scripts/check-conformance.mjs src

      # Docs are generated from code; if they differ, code changed and docs did not.
      - name: docs freshness
        run: node scripts/check-docs.mjs
`
}

export function buildDocsCheck(): string {
  return `#!/usr/bin/env node
/**
 * Docs freshness gate.
 *
 * manifest.json is assembled from the guidance files. If regenerating it produces
 * something different from what is committed, the code moved and the docs did not.
 * A hand-maintained API file drifts within one release; this is what stops it.
 */
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'

const root = path.resolve(process.argv[2] ?? '.')
const manifestPath = path.join(root, 'manifest.json')

if (!fs.existsSync(manifestPath)) {
  console.error('docs:check — manifest.json is missing. Run the generator.')
  process.exit(1)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const dir = path.join(root, 'components')
const drift = []

for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const g = path.join(dir, entry.name, 'guidance.yaml')
  if (!fs.existsSync(g)) continue
  const guidance = YAML.parse(fs.readFileSync(g, 'utf8'))
  const indexed = manifest.components.find((c) => c.name === guidance.name)

  if (!indexed) {
    drift.push(\`\${guidance.name} has a guidance.yaml but is not in manifest.json\`)
    continue
  }
  for (const axis of Object.keys(guidance.variants ?? {})) {
    const a = (guidance.variants[axis] ?? []).join(',')
    const b = (indexed.variants?.[axis] ?? []).join(',')
    if (a !== b) drift.push(\`\${guidance.name}.\${axis}: guidance [\${a}] vs manifest [\${b}]\`)
  }
}

if (drift.length) {
  console.error('docs:check — manifest.json has drifted from the guidance files:\\n')
  drift.forEach((d) => console.error('  ' + d))
  process.exit(1)
}
console.log('docs:check — manifest.json matches every guidance.yaml')
`
}

export function buildEslintConfig(): string {
  return `/**
 * Flat config. The design-system rules that can be expressed as lint rules live
 * here; the rest are in scripts/check-conformance.mjs.
 */
export default [
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // A raw colour in a screen is the defect the token layer exists to remove.
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3,8}/]",
          message: 'Raw hex value. Use a semantic token from tokens/tokens.json.',
        },
      ],
    },
  },
]
`
}
