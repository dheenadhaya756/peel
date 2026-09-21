/**
 * The rubric: nine layers rolled into four weighted axes, with hard caps.
 *
 * Knowledge carries the heaviest weight because it is the only layer whose absence
 * is SILENT. A missing export throws TS2305 and the agent recovers. A missing
 * "what you'll reach for by mistake" map produces confident, compiling, wrong code
 * that nobody notices until review.
 */
import type {
  AxisId, AxisScore, Check, LadderRow, LayerId, Scorecard, SystemFacts, Verdict,
} from './types'

export const AXES: Record<AxisId, { label: string; layers: LayerId[]; weight: number; question: string }> = {
  admission: {
    label: 'Admission', layers: ['L0', 'L1', 'L2'], weight: 0.25,
    question: 'Can it be installed, themed and rendered in a clean sandbox?',
  },
  contract: {
    label: 'Contract', layers: ['L3', 'L4', 'L5'], weight: 0.25,
    question: 'Can the vocabulary be enumerated and constrained mechanically?',
  },
  knowledge: {
    label: 'Knowledge', layers: ['L6'], weight: 0.30,
    question: 'Given the vocabulary, will the model pick the right thing?',
  },
  gate: {
    label: 'Gate', layers: ['L7', 'L8'], weight: 0.20,
    question: 'When it picks wrong, does anything catch it — and stay caught?',
  },
}

export const LAYER_LABEL: Record<LayerId, string> = {
  L0: 'Distribution & manifest',
  L1: 'Token layer',
  L2: 'Cascade & CSS delivery',
  L3: 'Component contract',
  L4: 'Variant layer',
  L5: 'Type surface',
  L6: 'Knowledge base',
  L7: 'Enforcement',
  L8: 'Provenance & drift',
}

const SEVERITY_WEIGHT = { BLOCK: 3, GAP: 2, WATCH: 1 } as const

/** Applied to the composite regardless of how well every other axis scored. */
const HARD_CAPS = [
  { id: 'no-knowledge-base', cap: 45, reason: 'No knowledge-base file of any kind — an agent has nothing to read' },
  { id: 'no-emitted-types', cap: 55, reason: 'No emitted types — the vocabulary cannot be enumerated' },
  { id: 'no-semantic-tier', cap: 65, reason: 'No semantic token tier — components consume raw primitives' },
  { id: 'override-mixed', cap: 75, reason: 'Override outcome is not uniform across families' },
]

/** The three states the user sees. Deliberately blunt. */
export const VERDICTS: Record<Verdict['key'], Verdict> = {
  no: {
    key: 'no', label: 'Not agentic',
    headline: 'An agent invents freely against this.',
    meaning: 'Generated code will hand-roll elements this system already provides, and invent values and variant names that compile.',
  },
  maybe: {
    key: 'maybe', label: 'Partly agentic',
    headline: 'Right on simple screens, drifts on real ones.',
    meaning: 'The agent finds the components but cannot tell lookalikes apart, so it picks by appearance and gets it wrong at the edges.',
  },
  yes: {
    key: 'yes', label: 'Agentic',
    headline: 'Reproducible without human correction.',
    meaning: 'An agent can look a component up, pick correctly between lookalikes, and be caught mechanically when it does not.',
  },
}

export const verdictFor = (composite: number): Verdict =>
  composite >= 70 ? VERDICTS.yes : composite >= 40 ? VERDICTS.maybe : VERDICTS.no

/* ------------------------------------------------------------------- the checks */

export function runChecks(f: SystemFacts): Check[] {
  const checks: Check[] = []
  const add = (c: Check) => checks.push(c)

  /** Contract checks need a resolved prop surface. On a degraded read they report
   *  `unscored` — never `pass` — so a worse measurement can never score higher. */
  const usable = !f.degraded
  const gated = (c: Omit<Check, 'status'> & { status: Check['status'] }): Check =>
    usable ? c : { ...c, status: 'unscored', unscoredReason: f.degradedReason ?? 'prop surface not resolvable' }

  const totalComponents = f.components.length || 1

  /* ---- L0 distribution ---- */
  add({
    id: 'l0.install-path', layer: 'L0', severity: 'BLOCK',
    status: f.private ? 'fail' : 'pass',
    title: 'Declared install path',
    detail: f.private
      ? 'package.json is private:true, so there is no sanctioned way for a consumer to install this.'
      : 'The package can be installed by a consumer.',
    evidence: f.private ? [{ file: 'package.json', excerpt: '"private": true' }] : [],
    fix: 'Drop private:true or declare a scoped registry via publishConfig.',
    hours: 0.1, points: 5.5,
  })
  add({
    id: 'l0.exports', layer: 'L0', severity: 'GAP',
    status: f.hasExports ? 'pass' : 'fail',
    title: 'Explicit exports map',
    detail: f.hasExports
      ? 'An exports map is declared, so subpaths resolve predictably.'
      : 'No exports map — subpath resolution is implementation-defined and agents guess import paths.',
    evidence: [{ file: 'package.json', excerpt: f.hasExports ? '"exports": { ... }' : 'no "exports" key' }],
    fix: 'Add an exports map covering ".", "./styles.css" and "./.peel/*".',
    hours: 0.05, points: 1.3,
  })
  add({
    id: 'l0.agent-docs', layer: 'L0', severity: 'GAP',
    status: f.hasAgentDocs ? 'pass' : 'fail',
    title: 'agentDocs pointer in the manifest',
    detail: f.hasAgentDocs
      ? 'The manifest points at the agent knowledge base, so it is discoverable from node_modules.'
      : 'Nothing in the manifest points at agent documentation, so a tool inside node_modules cannot find it.',
    evidence: [{ file: 'package.json', excerpt: f.hasAgentDocs ? '"agentDocs": { ... }' : 'no "agentDocs" key' }],
    fix: 'Add an agentDocs block naming rules, guide, index, components and curation.',
    hours: 0.1, points: 2.0,
  })

  /* ---- L1 tokens ---- */
  const semantic = f.tokens.filter((t) => t.tier === 'semantic')
  const primitives = f.tokens.filter((t) => t.tier === 'primitive')
  add({
    id: 'l1.tokens-exist', layer: 'L1', severity: 'BLOCK',
    status: f.tokens.length > 0 ? 'pass' : 'fail',
    title: 'Machine-readable tokens',
    detail: f.tokens.length
      ? `${f.tokens.length} custom properties found across ${f.cssFiles.length} stylesheet(s).`
      : 'No custom properties found — there is no machine-readable token layer to reference.',
    evidence: f.tokens.slice(0, 3).map((t) => ({ file: t.file, line: t.line, excerpt: `--${t.name}: ${t.value}` })),
    fix: 'Emit tokens as CSS custom properties and a tokens.json.',
    hours: 4, points: 6,
  })
  add({
    id: 'l1.semantic-tier', layer: 'L1', severity: 'GAP',
    status: semantic.length > 0 ? 'pass' : 'fail',
    title: 'Semantic token tier',
    detail: semantic.length
      ? `${semantic.length} semantic tokens sit above ${primitives.length} primitives.`
      : 'Every token names an appearance rather than a purpose, so the agent cannot tell which red means danger.',
    evidence: semantic.length
      ? semantic.slice(0, 3).map((t) => ({ file: t.file, line: t.line, excerpt: `--${t.name}: ${t.value}` }))
      : primitives.slice(0, 3).map((t) => ({ file: t.file, line: t.line, excerpt: `--${t.name}: ${t.value}  ← appearance, not purpose` })),
    fix: 'Introduce a semantic tier (bg-action-primary, text-danger) that aliases the primitives.',
    hours: 6, points: 5,
    caps: semantic.length ? undefined : 'no-semantic-tier',
  })

  /* ---- L2 cascade ---- */
  const mixed = f.layeredSelectors > 0 && f.unlayeredSelectors > 0
  add({
    id: 'l2.override-outcome', layer: 'L2', severity: 'BLOCK',
    status: f.cssFiles.length === 0 ? 'unscored' : mixed ? 'fail' : 'pass',
    unscoredReason: f.cssFiles.length === 0 ? 'no stylesheet was emitted to inspect' : undefined,
    title: 'Uniform override outcome',
    detail: mixed
      ? `Mixed cascade: ${f.layeredSelectors} layered and ${f.unlayeredSelectors} unlayered rules. A consumer utility WINS against the layered families and is INERT against the unlayered ones — neither a person nor a model can reason about that.`
      : f.unlayeredSelectors > 0
        ? 'All component CSS is unlayered, so the outcome is at least uniform and predictable.'
        : 'All component CSS is layered, so consumer utilities behave consistently.',
    evidence: f.cssFiles.slice(0, 2).map((file) => ({
      file,
      excerpt: `@layer [${f.cssLayers.join(', ') || 'none'}] · layered ${f.layeredSelectors} · unlayered ${f.unlayeredSelectors}`,
    })),
    fix: 'Put every component rule inside one @layer, in a declared order.',
    hours: 3, points: 4,
    caps: mixed ? 'override-mixed' : undefined,
  })

  /* ---- L3 component contract ---- */
  const unexported = f.components.filter((c) => !c.exported)
  add(gated({
    id: 'l3.all-exported', layer: 'L3', severity: 'GAP',
    status: unexported.length === 0 ? 'pass' : 'fail',
    title: 'Every component reachable from the entry point',
    detail: unexported.length
      ? `${unexported.length} component(s) exist but are not exported from the entry point, so an agent cannot import them and will hand-roll a replacement.`
      : 'Every component found is reachable from the package entry point.',
    evidence: unexported.slice(0, 4).map((c) => ({ file: c.file, excerpt: `${c.name} — defined but not re-exported` })),
    fix: 'Re-export the missing components from src/index.ts.',
    hours: 0.25, points: 2.5,
  }))
  const withRaw = f.components.filter((c) => c.rawValues.length > 0)
  add({
    id: 'l3.no-raw-values', layer: 'L3', severity: 'GAP',
    status: f.components.length === 0 ? 'unscored' : withRaw.length === 0 ? 'pass' : 'fail',
    unscoredReason: f.components.length === 0 ? 'no components found' : undefined,
    title: 'Components consume tokens, not raw values',
    detail: withRaw.length
      ? `${f.rawValueTotal} raw colour/size literal(s) across ${withRaw.length} of ${f.components.length} components. Each one is a value an agent will copy and then invent variations of.`
      : 'No raw colour or size literals in component source.',
    evidence: withRaw.flatMap((c) => c.rawValues.slice(0, 1).map((e) => ({ ...e, file: c.file }))).slice(0, 5),
    fix: 'Replace each literal with a semantic token reference.',
    hours: Math.max(1, Math.round(withRaw.length * 0.5)), points: 5,
  })

  /* ---- L4 variants ---- */
  const openVar = f.components.filter((c) => c.openVariants.length > 0)
  add(gated({
    id: 'l4.closed-variants', layer: 'L4', severity: 'BLOCK',
    status: openVar.length === 0 ? 'pass' : 'fail',
    title: 'Closed variant unions',
    detail: openVar.length
      ? `${openVar.length} component(s) type a variant prop as open \`string\`. variant="cta" against a system with no such variant COMPILES — nothing catches it.`
      : 'Every variant prop is a closed literal union, enforced at compile time.',
    evidence: openVar.slice(0, 4).map((c) => ({
      file: c.file,
      excerpt: `${c.name}: ${c.openVariants.map((v) => `${v}?: string`).join(', ')}  ← open`,
    })),
    fix: 'Replace each open string with a literal union derived from the cva map.',
    hours: 0.5, points: 6,
  }))
  const cvaComponents = f.components.filter((c) => Object.keys(c.variants).length > 0)
  const withDefaults = cvaComponents.filter((c) => Object.keys(c.defaultVariants).length > 0)
  add(gated({
    id: 'l4.defaults-documented', layer: 'L4', severity: 'GAP',
    status: cvaComponents.length === 0 ? 'unscored' : withDefaults.length === cvaComponents.length ? 'pass' : 'fail',
    unscoredReason: cvaComponents.length === 0 ? 'no variant maps found' : undefined,
    title: 'Variant defaults are declared',
    detail: cvaComponents.length
      ? `${withDefaults.length} of ${cvaComponents.length} variant maps declare defaultVariants. Note these are erased from the emitted .d.ts, so any tool reading only built types reports zero — they must be recovered from source.`
      : 'No variant maps found.',
    // Cite only the components that actually fail, or the evidence contradicts the finding.
    evidence: cvaComponents
      .filter((c) => Object.keys(c.defaultVariants).length === 0)
      .slice(0, 4)
      .map((c) => ({
        file: c.file,
        excerpt: `${c.name} — axes [${Object.keys(c.variants).join(', ')}] · defaultVariants NONE`,
      })),
    fix: 'Declare defaultVariants on every cva map and surface them in components.json.',
    hours: 1, points: 2.4,
  }))

  /* ---- L5 type surface ---- */
  const typedProps = f.components.filter((c) => c.props.length > 0)
  add(gated({
    id: 'l5.named-props', layer: 'L5', severity: 'GAP',
    status: typedProps.length / totalComponents >= 0.8 ? 'pass' : 'fail',
    title: 'Named *Props interfaces',
    detail: `${typedProps.length} of ${f.components.length} components expose a named Props interface an agent can read.`,
    evidence: f.components.filter((c) => c.props.length === 0).slice(0, 4)
      .map((c) => ({ file: c.file, excerpt: `${c.name} — no named Props interface` })),
    fix: 'Export a named `<Name>Props` interface for every component.',
    hours: 2, points: 3,
  }))
  add({
    id: 'l5.emitted-types', layer: 'L5', severity: 'BLOCK',
    status: f.hasTypes ? 'pass' : 'fail',
    title: 'Emitted type declarations',
    detail: f.hasTypes
      ? 'Type declarations are emitted, so a consumer resolves real call signatures.'
      : 'No emitted .d.ts and no types field — a consumer resolves `any` and every prop check is silently skipped.',
    evidence: [{ file: 'package.json', excerpt: f.hasTypes ? '"types": declared' : 'no "types" / no dist/*.d.ts' }],
    fix: 'Emit declarations and point "types" at the entry .d.ts.',
    hours: 1, points: 4,
    caps: f.hasTypes ? undefined : 'no-emitted-types',
  })

  /* ---- L6 knowledge ---- */
  const kb = f.knowledgeFiles
  const kbPresent = Object.values(kb).filter(Boolean).length
  for (const [file, weight, why] of [
    ['AGENTS.md', 3, 'the entry point any LLM reads first'],
    ['llms.txt', 2.5, 'the one-line-per-component index, and the looks-like map from mockup shape to component name'],
    ['components.json', 2.5, 'the machine-readable prop and variant surface'],
    ['curation.json', 5.2, 'the near-miss map: which component your own engineers reach for by mistake'],
    ['RULES.md', 2, 'the do/do-not card, read whole before anything else'],
  ] as const) {
    const present = Boolean(kb[file])
    add({
      id: `l6.${file}`, layer: 'L6', severity: file === 'curation.json' ? 'BLOCK' : 'GAP',
      status: present ? 'pass' : 'fail',
      title: `${file} present`,
      detail: present ? `Found at ${kb[file]}.` : `Absent — ${why}.`,
      evidence: [{ file: present ? kb[file]! : 'searched: repo root, package root, .peel/, docs/', excerpt: present ? 'present' : 'not found' }],
      fix: `Generate ${file} from the extracted component contracts.`,
      hours: file === 'curation.json' ? 8 : 0.5, points: weight,
    })
  }
  const documented = f.components.filter((c) => c.hasDoc)
  add({
    id: 'l6.doc-coverage', layer: 'L6', severity: 'GAP',
    status: f.components.length === 0 ? 'unscored' : documented.length / totalComponents >= 0.6 ? 'pass' : 'fail',
    unscoredReason: f.components.length === 0 ? 'no components found' : undefined,
    title: 'Per-component documentation coverage',
    detail: `${documented.length} of ${f.components.length} components carry any doc comment or README.`,
    evidence: f.components.filter((c) => !c.hasDoc).slice(0, 4).map((c) => ({ file: c.file, excerpt: `${c.name} — undocumented` })),
    fix: 'Generate a guidance file per component with purpose, when-to-use and when-NOT-to-use.',
    hours: 3, points: 4,
  })

  /* ---- L7 enforcement ---- */
  add({
    id: 'l7.lint', layer: 'L7', severity: 'GAP',
    status: f.hasLint ? 'pass' : 'fail',
    title: 'Lint configuration present',
    detail: f.hasLint ? 'A linter is configured.' : 'No linter — prose rules have no mechanical consumer, so nothing catches a violation.',
    evidence: [{ file: 'repo root', excerpt: f.hasLint ? 'eslint/biome config found' : 'no eslint or biome config' }],
    fix: 'Add a linter and a conformance check that runs over generated screens.',
    hours: 2, points: 3,
  })
  add({
    id: 'l7.ci', layer: 'L7', severity: 'WATCH',
    status: f.hasCi ? 'pass' : 'fail',
    title: 'CI runs the checks',
    detail: f.hasCi ? 'A CI workflow exists to run the gates.' : 'No CI workflow — any rule that exists is advisory only.',
    evidence: [{ file: '.github/workflows', excerpt: f.hasCi ? 'workflow found' : 'no workflow directory' }],
    fix: 'Run typecheck, docs:check and the conformance checker on every PR.',
    hours: 1, points: 2,
  })
  add({
    id: 'l7.tests', layer: 'L7', severity: 'WATCH',
    status: f.hasTests ? 'pass' : 'fail',
    title: 'Tests exist',
    detail: f.hasTests ? 'Test files are present.' : 'No tests — a regression in a component contract is invisible.',
    evidence: [{ file: 'repo', excerpt: f.hasTests ? '*.test.* found' : 'no *.test.* or *.spec.* files' }],
    fix: 'Add render and contract tests for each component.',
    hours: 6, points: 2,
  })

  /* ---- L8 provenance ---- */
  add({
    id: 'l8.stories', layer: 'L8', severity: 'WATCH',
    status: f.hasStories ? 'pass' : 'fail',
    title: 'Visual reference exists',
    detail: f.hasStories ? 'Stories are present, so states have a rendered reference.' : 'No stories — there is no rendered reference proving the documented states exist.',
    evidence: [{ file: 'repo', excerpt: f.hasStories ? '*.stories.* found' : 'no *.stories.* files' }],
    fix: 'Generate stories from the component guidance: one per variant, one per state.',
    hours: 2, points: 2,
  })
  add({
    id: 'l8.freshness', layer: 'L8', severity: 'GAP',
    status: kb['components.json'] ? 'pass' : 'fail',
    title: 'Docs regenerate from code',
    detail: kb['components.json']
      ? 'A generated component index exists, so docs can be checked against code.'
      : 'Nothing regenerates documentation from the code, so any hand-written API file drifts within one release.',
    evidence: [{ file: 'package.json', excerpt: 'no docs:check script wired to a generator' }],
    fix: 'Add a docs:check script and fail CI when the generated index differs.',
    hours: 1, points: 2.5,
  })

  return checks
}

/* -------------------------------------------------------------------- scoring */

export function score(f: SystemFacts): Scorecard {
  const checks = runChecks(f)

  const axes: AxisScore[] = (Object.keys(AXES) as AxisId[]).map((id) => {
    const def = AXES[id]
    const mine = checks.filter((c) => def.layers.includes(c.layer))
    const scored = mine.filter((c) => c.status === 'pass' || c.status === 'fail')
    const earned = scored.filter((c) => c.status === 'pass').reduce((n, c) => n + SEVERITY_WEIGHT[c.severity], 0)
    const possible = scored.reduce((n, c) => n + SEVERITY_WEIGHT[c.severity], 0)
    return {
      id, label: def.label, question: def.question, weight: def.weight,
      value: possible === 0 ? null : Math.round((earned / possible) * 100),
      scored: scored.length,
      unscored: mine.filter((c) => c.status === 'unscored').length,
    }
  })

  // Renormalise across axes that were actually measured, so an unscored axis
  // neither inflates nor deflates the composite.
  const measured = axes.filter((a) => a.value !== null)
  const totalWeight = measured.reduce((n, a) => n + a.weight, 0) || 1
  const uncapped = Math.round(measured.reduce((n, a) => n + (a.value as number) * a.weight, 0) / totalWeight)

  const failedIds = new Set(checks.filter((c) => c.status === 'fail' && c.caps).map((c) => c.caps!))
  if (Object.values(f.knowledgeFiles).every((v) => !v)) failedIds.add('no-knowledge-base')
  const applicable = HARD_CAPS.filter((c) => failedIds.has(c.id))
  const appliedCap = applicable.sort((a, b) => a.cap - b.cap)[0] ?? null
  const composite = appliedCap ? Math.min(uncapped, appliedCap.cap) : uncapped

  const ladder: LadderRow[] = checks
    .filter((c) => c.status === 'fail' && c.fix && c.hours && c.points)
    .map((c) => ({
      id: c.id, title: c.title, layer: c.layer,
      hours: c.hours!, points: c.points!,
      perHour: Number((c.points! / c.hours!).toFixed(1)),
      fix: c.fix!,
      prevents: c.detail,
    }))
    .sort((a, b) => b.perHour - a.perHour)

  return {
    composite,
    uncapped,
    appliedCap,
    axes,
    verdict: verdictFor(composite),
    checks,
    counts: {
      pass: checks.filter((c) => c.status === 'pass').length,
      fail: checks.filter((c) => c.status === 'fail').length,
      unscored: checks.filter((c) => c.status === 'unscored').length,
      blockers: checks.filter((c) => c.status === 'fail' && c.severity === 'BLOCK').length,
    },
    ladder,
  }
}
