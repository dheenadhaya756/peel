/**
 * Shared shapes for the audit engine.
 *
 * The rule the whole engine is built around: a check is `pass` or `fail` only when
 * it was actually measured. When the input could not be read well enough to decide,
 * it is `unscored` — never `pass`. A degraded read must never score higher than a
 * full one, because the most dangerous failure for an audit tool is measuring
 * nothing and reporting it as clean.
 */

export type Severity = 'BLOCK' | 'GAP' | 'WATCH'
export type CheckStatus = 'pass' | 'fail' | 'unscored'
export type LayerId = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'L8'
export type AxisId = 'admission' | 'contract' | 'knowledge' | 'gate'

/** Proof that a finding is real. Without one, a finding is an opinion. */
export interface Evidence {
  file: string
  line?: number
  excerpt: string
}

export interface Check {
  id: string
  layer: LayerId
  severity: Severity
  status: CheckStatus
  title: string
  detail: string
  evidence: Evidence[]
  /** What closes it, and roughly what it costs. */
  fix?: string
  hours?: number
  points?: number
  /** Set when status is 'unscored' — why it could not be measured. */
  unscoredReason?: string
  caps?: string
}

export interface PropFact {
  name: string
  type: string
  required: boolean
  default?: string
  /** true when the type is an open `string`/`any` rather than a closed union. */
  open: boolean
}

export interface ComponentFact {
  name: string
  file: string
  exported: boolean
  props: PropFact[]
  /** variant axis -> the values found in the cva map */
  variants: Record<string, string[]>
  /** variant axis -> value -> the literal class string that branch applies. */
  variantClasses: Record<string, Record<string, string>>
  defaultVariants: Record<string, string>
  /** variant props typed as open `string` — each one is an invitation to invent. */
  openVariants: string[]
  rawValues: Evidence[]
  tokensUsed: string[]
  states: string[]
  hasDoc: boolean
  loc: number
}

export interface TokenFact {
  name: string
  value: string
  tier: 'primitive' | 'semantic' | 'component' | 'unknown'
  file: string
  line: number
}

export interface SystemFacts {
  root: string
  /** How the audited package was chosen out of the tree, so the call can be disputed. */
  locatedReason: string
  locatedCandidates: Array<{ dir: string; components: number; name: string }>
  packageName: string
  packageJson: Record<string, unknown> | null
  private: boolean
  hasExports: boolean
  hasTypes: boolean
  hasAgentDocs: boolean
  /** Built .d.ts were read (authoritative) vs source only (weaker). */
  readBuiltTypes: boolean
  /** True when the read was too poor to score contract-dependent checks. */
  degraded: boolean
  degradedReason?: string
  components: ComponentFact[]
  tokens: TokenFact[]
  cssFiles: string[]
  /** @layer names found in the emitted CSS, in source order. */
  cssLayers: string[]
  unlayeredSelectors: number
  layeredSelectors: number
  knowledgeFiles: Record<string, string | null>
  hasStories: boolean
  hasLint: boolean
  hasCi: boolean
  hasTests: boolean
  fileCount: number
  rawValueTotal: number
}

export interface AxisScore {
  id: AxisId
  label: string
  question: string
  weight: number
  value: number | null
  scored: number
  unscored: number
}

export type VerdictKey = 'no' | 'maybe' | 'yes'

export interface Verdict {
  key: VerdictKey
  label: string
  headline: string
  meaning: string
}

export interface Scorecard {
  composite: number
  uncapped: number
  appliedCap: { id: string; cap: number; reason: string } | null
  axes: AxisScore[]
  verdict: Verdict
  checks: Check[]
  counts: { pass: number; fail: number; unscored: number; blockers: number }
  ladder: LadderRow[]
}

export interface LadderRow {
  id: string
  title: string
  layer: LayerId
  hours: number
  points: number
  perHour: number
  fix: string
  prevents: string
}
