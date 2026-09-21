export interface Verdict { key: 'no' | 'maybe' | 'yes'; label: string; headline: string; meaning: string }
export interface Evidence { file: string; line?: number; excerpt: string }

export interface Check {
  id: string
  layer: string
  severity: 'BLOCK' | 'GAP' | 'WATCH'
  status: 'pass' | 'fail' | 'unscored'
  title: string
  detail: string
  evidence: Evidence[]
  fix?: string
  hours?: number
  points?: number
  unscoredReason?: string
}

export interface Axis { id: string; label: string; question: string; weight: number; value: number | null; scored: number; unscored: number }

export interface LadderRow { id: string; title: string; layer: string; hours: number; points: number; perHour: number; fix: string; prevents: string }

export interface Scorecard {
  composite: number
  uncapped: number
  appliedCap: { id: string; cap: number; reason: string } | null
  axes: Axis[]
  verdict: Verdict
  checks: Check[]
  counts: { pass: number; fail: number; unscored: number; blockers: number }
  ladder: LadderRow[]
}

export interface ComponentFact {
  name: string
  file: string
  exported: boolean
  props: Array<{ name: string; type: string; required: boolean; open: boolean }>
  variants: Record<string, string[]>
  variantClasses: Record<string, Record<string, string>>
  defaultVariants: Record<string, string>
  openVariants: string[]
  rawValues: Evidence[]
  tokensUsed: string[]
  states: string[]
  hasDoc: boolean
}

export interface Facts {
  packageName: string
  private: boolean
  components: ComponentFact[]
  tokens: Array<{ name: string; value: string; tier: string; file: string; line: number }>
  cssLayers: string[]
  layeredSelectors: number
  unlayeredSelectors: number
  knowledgeFiles: Record<string, string | null>
  rawValueTotal: number
  degraded: boolean
  degradedReason?: string
}

export interface Guidance {
  name: string
  purpose: string
  aliases: string[]
  useWhen: string[]
  useInstead: Array<{ when: string; use: string }>
  props: Array<{ name: string; type: string; required: boolean; default?: string; description: string }>
  variants: Record<string, string[]>
  defaultVariants: Record<string, string>
  states: Array<{ name: string; trigger: string }>
  a11y: { role: string; requiredLabel: string; keyboard: string }
  tokens: string[]
}

export interface SystemSummary {
  id: string
  name: string
  source: string
  origin: string | null
  createdAt: string
  converted: boolean
  selected: string[]
  componentCount: number
  before: { composite: number; verdict: Verdict } | null
  after: { composite: number; verdict: Verdict } | null
}

export interface SystemDetail {
  id: string
  name: string
  source: string
  origin: string | null
  converted: boolean
  selected: string[]
  facts: Facts | null
  before: Scorecard | null
  after: Scorecard | null
  output: string[]
}

export interface ConvertResult {
  selected: string[]
  before: { composite: number; verdict: Verdict; axes: Axis[] }
  after: { composite: number; verdict: Verdict; axes: Axis[] }
  stats: Record<string, number>
  todos: string[]
  components: Array<{ name: string; kebab: string; guidance: Guidance; todos: string[] }>
  measured: Record<string, { before: number; after: number }>
  files: string[]
}
