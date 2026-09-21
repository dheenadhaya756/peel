/**
 * Token derivation.
 *
 * Semantic tokens are DERIVED from where a value is actually used, not invented.
 * `bg-[#3b82f6]` inside the cva branch `variant.primary` of Button becomes
 * `bg-action-primary` — the name comes from the variant axis the value already
 * lives in, so the mapping is mechanical and traceable rather than a judgement call.
 */
import type { ComponentFact, SystemFacts } from '../engine/types'

export interface GeneratedToken {
  name: string
  tier: 'primitive' | 'semantic'
  type: 'color' | 'space' | 'radius' | 'font' | 'shadow'
  value: string
  aliasOf?: string
  description: string
  /** Where the value was found. Every token traces back to a real line. */
  origin: string
}

const PROP_PREFIX: Record<string, string> = {
  bg: 'bg', text: 'text', border: 'border', ring: 'ring', shadow: 'shadow',
}

const hexName = (hex: string) => `palette-${hex.replace('#', '').toLowerCase()}`

/**
 * Named utilities that carry a colour but are not a hex literal. Without these,
 * `bg-[#3b82f6] text-white` derives a background token and no foreground token,
 * and the generated component renders blue with black text. These are the
 * published values of the utilities, not invented ones.
 */
const NAMED_COLOR: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
  current: 'currentColor',
  inherit: 'inherit',
}

/** Human names for the well-known hues, so primitives are not opaque. */
function describeHex(hex: string): string {
  const h = hex.replace('#', '')
  if (h.length < 6) return `colour ${hex}`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const light = max > 220 ? 'light ' : max < 90 ? 'dark ' : ''
  if (max - min < 24) return `${light}neutral`
  if (r === max && g > b) return `${light}${g > 150 ? 'amber' : 'red'}`
  if (r === max) return `${light}red`
  if (g === max) return `${light}green`
  return `${light}blue`
}

export function deriveTokens(facts: SystemFacts): GeneratedToken[] {
  const tokens: GeneratedToken[] = []
  const primitives = new Map<string, GeneratedToken>()
  const seenSemantic = new Set<string>()

  const addPrimitive = (hex: string, origin: string) => {
    const name = hexName(hex)
    if (!primitives.has(name)) {
      primitives.set(name, {
        name, tier: 'primitive', type: 'color', value: hex.toLowerCase(),
        description: `${describeHex(hex)} — raw palette value recovered from source`,
        origin,
      })
    }
    return name
  }

  /**
   * Carry the system's OWN custom properties through, under their own names.
   *
   * A mature design system already has a token layer — SLDS ships ~980 colour tokens
   * and a full spacing scale. Reducing that to the handful of hex literals that
   * happen to appear inline throws away almost everything the team built, and leaves
   * anything generated against it with no palette to work from.
   */
  const CONCRETE = /^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|[\d.]+(px|rem|em|%)|[\d.]+$)/i
  for (const t of facts.tokens) {
    const value = t.value.trim()
    const name = t.name

    if (/^#[0-9a-fA-F]{3,8}$/.test(value)) {
      // Keep a palette entry under the hex, so derived semantics can alias it…
      const hex = hexName(value)
      if (!primitives.has(hex)) {
        primitives.set(hex, {
          name: hex, tier: 'primitive', type: 'color', value: value.toLowerCase(),
          description: `${describeHex(value)} — declared as --${name}`,
          origin: `${t.file}:${t.line}`,
        })
      }
    }

    // …and keep the team's own name too, which is the one their docs refer to.
    if (!CONCRETE.test(value) || primitives.has(name)) continue
    const type: GeneratedToken['type'] =
      /^(#|rgb|hsl)/i.test(value) ? 'color'
        : /radius/i.test(name) ? 'radius'
          : /font|text|size/i.test(name) ? 'font'
            : /shadow/i.test(name) ? 'shadow'
              : 'space'
    primitives.set(name, {
      name, tier: 'primitive', type, value,
      description: `declared by ${facts.packageName} at ${t.file}:${t.line}`,
      origin: `${t.file}:${t.line}`,
    })
  }

  const push = (name: string, t: Omit<GeneratedToken, 'name' | 'tier'>) => {
    if (seenSemantic.has(name)) return
    seenSemantic.add(name)
    tokens.push({ name, tier: 'semantic', ...t })
  }

  /** Read one cva branch's real class string into semantic tokens. */
  const readBranch = (component: ComponentFact, axis: string, variant: string, classes: string) => {
    const role = axis === 'variant' ? 'action' : axis
    const where = `${component.file} · cva ${axis}.${variant}`

    // colour utilities — bg-[#hex], text-[#hex], border-[#hex]
    for (const m of classes.matchAll(/\b(bg|text|border|ring|shadow)-\[(#[0-9a-fA-F]{3,8})\]/g)) {
      const [, prop, hex] = m
      const aliasOf = addPrimitive(hex, component.file)
      push(`${PROP_PREFIX[prop]}-${role}-${variant}`, {
        type: 'color', value: `{${aliasOf}}`, aliasOf,
        description: `${prop} for ${component.name} ${axis}="${variant}"`,
        origin: where,
      })
    }

    // named colour utilities — bg-white, text-white, border-transparent
    for (const m of classes.matchAll(/\b(bg|text|border|ring)-(white|black|transparent|current|inherit)\b/g)) {
      const [, prop, word] = m
      const literal = NAMED_COLOR[word]
      const isKeyword = literal.startsWith('#') === false
      const aliasOf = isKeyword ? undefined : addPrimitive(literal, component.file)
      push(`${PROP_PREFIX[prop]}-${role}-${variant}`, {
        type: 'color',
        value: aliasOf ? `{${aliasOf}}` : literal,
        aliasOf,
        description: `${prop} for ${component.name} ${axis}="${variant}"`,
        origin: `${where} · ${prop}-${word}`,
      })
    }

    // dimension utilities — a `size` or `padding` axis carries these, not colour.
    const dims: Array<[RegExp, string, GeneratedToken['type']]> = [
      [/\bh-\[(\d{1,3})px\]/, 'height', 'space'],
      [/\bpx-\[(\d{1,3})px\]/, 'padding-inline', 'space'],
      [/\bpy-\[(\d{1,3})px\]/, 'padding-block', 'space'],
      [/\bp-\[(\d{1,3})px\]/, 'padding', 'space'],
      [/\btext-\[(\d{1,3})px\]/, 'font-size', 'font'],
    ]
    for (const [re, prop, type] of dims) {
      const m = classes.match(re)
      if (!m) continue
      push(`${prop}-${role}-${variant}`, {
        type, value: `${m[1]}px`,
        description: `${prop} for ${component.name} ${axis}="${variant}"`,
        origin: where,
      })
    }
  }

  for (const c of facts.components) {
    for (const [axis, branches] of Object.entries(c.variantClasses ?? {})) {
      for (const [variant, classes] of Object.entries(branches)) {
        readBranch(c, axis, variant, classes)
      }
    }
  }

  // Structural semantics every system needs, derived from what was actually found.
  const neutrals = [...primitives.values()]
    .filter((p) => p.description.includes('neutral'))
    .sort((a, b) => a.value.localeCompare(b.value))
  const lightest = neutrals.at(-1)
  const darkest = neutrals[0]
  const structural: Array<[string, string | undefined, string]> = [
    ['bg-surface', lightest?.name, 'Default surface behind content'],
    ['bg-surface-sunken', neutrals[Math.floor(neutrals.length / 2)]?.name, 'Recessed surface, one step back from the page'],
    ['text-default', darkest?.name, 'Body text on a default surface'],
    ['border-default', neutrals[Math.max(0, neutrals.length - 2)]?.name, 'Hairline separating two surfaces'],
  ]
  for (const [name, aliasOf, description] of structural) {
    if (!aliasOf || seenSemantic.has(name)) continue
    seenSemantic.add(name)
    tokens.push({
      name, tier: 'semantic', type: 'color', value: `{${aliasOf}}`, aliasOf, description,
      origin: 'derived from the neutral ramp found in source',
    })
  }

  // Spacing and radius, recovered from the px literals actually used.
  const pxSeen = new Map<number, string>()
  for (const c of facts.components) {
    for (const e of c.rawValues) {
      for (const m of e.excerpt.matchAll(/(?<![\w-])(\d{1,3})px/g)) {
        const n = Number(m[1])
        if (n < 2 || n > 64) continue
        if (!pxSeen.has(n)) pxSeen.set(n, `${c.file}:${e.line}`)
      }
    }
  }
  for (const [px, origin] of [...pxSeen.entries()].sort((a, b) => a[0] - b[0])) {
    const isRadius = [4, 8, 12, 16].includes(px)
    tokens.push({
      name: isRadius ? `radius-${px}` : `space-${px}`,
      tier: 'semantic',
      type: isRadius ? 'radius' : 'space',
      value: `${px}px`,
      description: isRadius ? `Corner radius step ${px}px` : `Spacing step ${px}px`,
      origin,
    })
  }

  return [...primitives.values(), ...tokens]
}

export function tokensToCss(tokens: GeneratedToken[]): string {
  const prim = tokens.filter((t) => t.tier === 'primitive')
  const sem = tokens.filter((t) => t.tier === 'semantic')
  const resolve = (v: string) => (v.startsWith('{') ? `var(--${v.slice(1, -1)})` : v)

  return `/* Generated token layer — do not edit by hand.
 *
 * Two tiers. Primitives exist ONLY to be referenced by semantic tokens.
 * Components consume the semantic tier and nothing else: that is what lets a
 * value be re-themed without touching a component.
 */

@layer tokens {
  :root {
    /* ---- primitives — referenced by semantic tokens, never by components ---- */
${prim.map((t) => `    --${t.name}: ${t.value}; /* ${t.description} */`).join('\n')}

    /* ---- semantic — the only tier a component may use ---- */
${sem.map((t) => `    --${t.name}: ${resolve(t.value)}; /* ${t.description} */`).join('\n')}
  }
}
`
}
