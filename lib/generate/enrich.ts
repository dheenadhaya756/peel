/**
 * The judgment layer, filled by a model.
 *
 * Order of preference, and it matters:
 *
 *   1. MEASURED   — the component's own JSDoc, its prop descriptions, its union
 *                   types. If the team wrote it, that is the answer.
 *   2. ARCHETYPE  — recorded knowledge for well-known UI archetypes.
 *   3. MODEL      — the gateway fills what is genuinely absent.
 *
 * A model is only ever asked for fields no compiler can measure: what else people
 * call a thing, when to reach for it, and when NOT to. It is never asked for a prop,
 * a variant value, a token or a default — those are facts, and facts come from the
 * AST. Anything the model supplies is marked `source: model` in the guidance so a
 * reader can tell generated judgment from measured fact.
 */
import type { ComponentFact } from '../engine/types'
import { apiKey, baseUrl, model } from '../chat/llm'
import { archetypeFor } from './knowledge'

export interface Judgment {
  aliases: string[]
  purpose: string
  useWhen: string[]
  useInstead: { when: string; use: string }[]
  a11y: { role: string; requiredLabel: string; keyboard: string }
  /** Which fields came from the model rather than from source or archetype. */
  generated: string[]
  /** Fields a reviewer corrected at the gate. */
  corrected?: string[]
}

const SYSTEM = `You document design-system components so an AI agent can pick the right one.

You are given a component's real name, its real props and its real variant values, all
extracted from source. Your job is ONLY the judgment fields a compiler cannot measure.

Rules:
- Never invent a prop, a variant value, a token or a default. Use only what you are given.
- "useInstead" is the most valuable field. Each entry names a CONDITION and the
  component to use instead. A static mockup cannot distinguish lookalikes, so without
  this an agent picks by appearance and gets it wrong.
- "aliases" are the names other design systems and designers use for this thing —
  the vocabulary a model searching from a screenshot would actually try.
- Be specific and short. One line each. No marketing language.

Return ONLY valid JSON, no prose, no code fence:
{"purpose":"...","aliases":["..."],"useWhen":["..."],"useInstead":[{"when":"...","use":"..."}],"a11y":{"role":"...","requiredLabel":"...","keyboard":"..."}}`

async function ask(prompt: string, timeoutMs = 45_000): Promise<Record<string, unknown> | null> {
  const key = apiKey()
  if (!key) return null

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: model(),
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: prompt },
        ],
      }),
    })
    if (!res.ok) return null
    const body = await res.json()
    const text: string = body.choices?.[0]?.message?.content ?? ''
    // Models wrap JSON in a fence often enough that it is worth stripping.
    const json = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
    const start = json.indexOf('{')
    const end = json.lastIndexOf('}')
    if (start < 0 || end < start) return null
    return JSON.parse(json.slice(start, end + 1))
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []

/**
 * Fill one component's judgment fields.
 *
 * Never throws and never blocks: if the gateway is down or slow, the archetype
 * answer stands. A conversion must not fail because a model was unavailable.
 */
export async function enrich(fact: ComponentFact, systemName: string): Promise<Judgment> {
  const arch = archetypeFor(fact.name)?.archetype
  const generated: string[] = []

  // 1 — measured. The team's own words win over anything generated.
  const measuredPurpose = fact.docComment?.trim()

  const base: Judgment = {
    purpose: measuredPurpose ?? arch?.purpose ?? '',
    aliases: arch?.aliases ?? [],
    useWhen: arch?.useWhen ?? [],
    useInstead: arch?.useInstead ?? [],
    a11y: arch?.a11y ?? { role: '', requiredLabel: '', keyboard: '' },
    generated: [],
  }

  const complete =
    base.purpose && base.aliases.length && base.useWhen.length &&
    base.useInstead.length && base.a11y.role
  if (complete || !apiKey()) {
    // No key: fall back to something usable rather than a blocking marker.
    if (!base.purpose) base.purpose = `${fact.name} — a component in ${systemName}.`
    if (!base.aliases.length) base.aliases = [fact.name.toLowerCase()]
    if (!base.useWhen.length) base.useWhen = [`you need the behaviour ${fact.name} provides`]
    if (!base.useInstead.length) {
      base.useInstead = [{ when: 'another component matches the intent more closely', use: 'see llms.txt' }]
    }
    if (!base.a11y.role) base.a11y = { role: 'none', requiredLabel: 'a visible label', keyboard: 'standard' }
    return base
  }

  // 2 — model, for the gaps only.
  const axes = Object.entries(fact.variants)
    .map(([a, v]) => `${a}: ${v.join(' | ')}`)
    .join('\n') || '(no variant axes)'
  const props = fact.props
    .slice(0, 24)
    .map((p) => `${p.name}${p.required ? '' : '?'}: ${p.type}${p.description ? `  // ${p.description}` : ''}`)
    .join('\n') || '(no typed props)'

  const reply = await ask(
    `Design system: ${systemName}
Component: ${fact.name}
${measuredPurpose ? `Documented purpose (authoritative, keep it): ${measuredPurpose}` : ''}

Real props:
${props}

Real variant axes (closed sets):
${axes}

Other components in this system you may reference in useInstead: see the names the
user knows; if unsure, describe the alternative generically rather than inventing a name.`,
  )

  if (!reply) {
    // Gateway unavailable — keep the archetype answer rather than failing.
    return enrichFallback(base, fact, systemName)
  }

  const take = <T,>(field: string, current: T, next: T, has: boolean): T => {
    if (has) return current
    generated.push(field)
    return next
  }

  const out: Judgment = {
    // A measured purpose is never overwritten.
    purpose: measuredPurpose ?? take('purpose', base.purpose, String(reply.purpose ?? base.purpose), Boolean(base.purpose)),
    aliases: take('aliases', base.aliases, asArray(reply.aliases), base.aliases.length > 0),
    useWhen: take('useWhen', base.useWhen, asArray(reply.useWhen), base.useWhen.length > 0),
    useInstead: take(
      'useInstead',
      base.useInstead,
      Array.isArray(reply.useInstead)
        ? (reply.useInstead as Array<Record<string, unknown>>)
            .filter((u) => typeof u?.when === 'string' && typeof u?.use === 'string')
            .map((u) => ({ when: String(u.when), use: String(u.use) }))
        : [],
      base.useInstead.length > 0,
    ),
    a11y: take(
      'a11y',
      base.a11y,
      {
        role: String((reply.a11y as Record<string, unknown>)?.role ?? 'none'),
        requiredLabel: String((reply.a11y as Record<string, unknown>)?.requiredLabel ?? 'a visible label'),
        keyboard: String((reply.a11y as Record<string, unknown>)?.keyboard ?? 'standard'),
      },
      Boolean(base.a11y.role),
    ),
    generated,
  }

  return enrichFallback(out, fact, systemName)
}

/** Anything still empty gets a plain statement, never a blocking marker. */
function enrichFallback(j: Judgment, fact: ComponentFact, systemName: string): Judgment {
  if (!j.purpose) j.purpose = `${fact.name} — a component in ${systemName}.`
  if (!j.aliases.length) j.aliases = [fact.name.toLowerCase()]
  if (!j.useWhen.length) j.useWhen = [`you need the behaviour ${fact.name} provides`]
  if (!j.useInstead.length) {
    j.useInstead = [{ when: 'another component matches the intent more closely', use: 'see llms.txt' }]
  }
  if (!j.a11y.role) j.a11y = { role: 'none', requiredLabel: 'a visible label', keyboard: 'standard' }
  return j
}

/** Enrich several components, bounded so a large selection cannot hang a conversion. */
export interface Override {
  purpose?: string
  aliases?: string[]
  useInstead?: Array<{ when: string; use: string }>
  defaultVariants?: Record<string, string>
}

export async function enrichAll(
  facts: ComponentFact[],
  systemName: string,
  onEach?: (name: string, j: Judgment) => void,
  overrides: Record<string, Override> = {},
): Promise<Map<string, Judgment>> {
  const out = new Map<string, Judgment>()
  // Small concurrency: enough to be quick, not enough to rate-limit a local gateway.
  const queue = [...facts]
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    for (;;) {
      const f = queue.shift()
      if (!f) return
      const j = await enrich(f, systemName)
      // A reviewer's correction is the most authoritative source there is — it
      // outranks the source's own docs, because the reviewer has seen both.
      const o = overrides[f.name]
      if (o) {
        if (o.purpose) j.purpose = o.purpose
        if (o.aliases?.length) j.aliases = o.aliases
        if (o.useInstead?.length) j.useInstead = o.useInstead.filter((u) => u.when && u.use)
        j.generated = j.generated.filter(
          (g) => !(g === 'purpose' && o.purpose) && !(g === 'aliases' && o.aliases?.length) && !(g === 'useInstead' && o.useInstead?.length),
        )
        j.corrected = Object.keys(o).filter((k) => (o as Record<string, unknown>)[k])
      }
      out.set(f.name, j)
      onEach?.(f.name, j)
    }
  })
  await Promise.all(workers)
  return out
}
