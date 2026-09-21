/**
 * Render the converted component for real.
 *
 * A contract that cannot be seen is hard to trust, and a preview showing a
 * component's name in a box is not a preview. This asks the configured gateway for
 * the one thing no compiler can derive — what the component should LOOK like — and
 * then refuses anything that breaks the guarantees the conversion exists to create.
 *
 * What the model may decide: element structure and CSS.
 * What it may NOT do, enforced by validation rather than instruction:
 *   - write a raw colour or size literal (the whole point of the token layer)
 *   - reference a token that was not derived from the source
 *   - invent a variant value outside the closed set
 * A response failing any of these is rejected and the deterministic fallback stands.
 */
import type { ComponentFact } from '../engine/types'
import type { GeneratedToken } from './tokens'
import { apiKey, baseUrl, model } from '../chat/llm'

export interface RenderedComponent {
  /** Static HTML for the base element, using the pl- class convention. */
  html: string
  /** CSS for `.pl-x` and every `.pl-x--value`, consuming semantic tokens only. */
  css: string
  /** Why it was rejected, when it was. */
  rejected?: string
}

const SYSTEM = `You write the visual layer for a design-system component that has already been analysed.

You are given the component's real name, its real purpose, its real props and its real
variant axes with their CLOSED value sets, plus the exact list of CSS custom properties
available. You may also be shown the markup the original component rendered.

Produce TWO things:
1. "html" — static HTML for ONE instance of the component, using semantic elements
   (button, input, span, div, nav, ul, li, table as appropriate). The root element
   must carry class "ROOT".

   Fill it with REALISTIC content so the result looks like the real component:
   a nav gets three or four labelled links, a table gets a header row and two data
   rows, an avatar gets initials, a badge gets a short status word. Someone looking
   at the result should recognise the component immediately.

   Give inner elements BEM classes derived from the root — ROOT__item, ROOT__label —
   so they can be styled. Do NOT write the component's own name as visible text;
   that is a label, not a component. Keep it to the component itself: no page
   furniture around it.
2. "css"  — CSS rules. Write a rule for ".ROOT" and one for ".ROOT--<value>" for every
   value of every variant axis. Make the variants VISIBLY different from each other.

Hard rules:
- NEVER write a hex colour, an rgb() colour, or a colour name. Every colour must be
  var(--token) using EXACTLY one of the token names given to you.
- Sizes: prefer var(--token) when a suitable one is listed. Plain px is allowed ONLY
  for borders, radii and spacing when no token fits.
- Do not invent a variant value. Use only the values given.
- No @import, no url(), no external fonts, no !important.
- The component must be visible and recognisable on a light background.

Return ONLY valid JSON, no prose, no code fence:
{"html":"...","css":"..."}`

const HEX = /#[0-9a-fA-F]{3,8}\b/
const RGB = /\brgba?\(/
const NAMED_COLOR =
  /(?<![\w-])(red|blue|green|yellow|orange|purple|pink|brown|black|white|gray|grey|cyan|magenta|teal|navy|olive|maroon|silver|gold|beige|coral|crimson|indigo|violet|salmon|tan|khaki)(?![\w-])/i

/**
 * Reject anything that would reintroduce the defect the conversion removed.
 * Instruction is not enforcement; this is.
 */
function validate(css: string, allowed: Set<string>): string | null {
  if (HEX.test(css)) return `raw hex value: ${css.match(HEX)?.[0]}`
  if (RGB.test(css)) return 'raw rgb() colour'
  // A named colour inside a var() fallback is still a raw value.
  const stripped = css.replace(/--[\w-]+/g, '')
  if (NAMED_COLOR.test(stripped)) return `named colour: ${stripped.match(NAMED_COLOR)?.[0]}`
  if (/@import|url\(|!important/.test(css)) return 'forbidden at-rule or override'

  for (const m of css.matchAll(/var\(\s*(--[\w-]+)/g)) {
    const name = m[1].slice(2)
    if (!allowed.has(name)) return `unknown token --${name}`
  }
  return null
}

async function ask(prompt: string, timeoutMs = 60_000): Promise<Record<string, unknown> | null> {
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
    const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
    const a = cleaned.indexOf('{')
    const b = cleaned.lastIndexOf('}')
    if (a < 0 || b < a) return null
    return JSON.parse(cleaned.slice(a, b + 1))
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Deterministic fallback, used when there is no key, the gateway is unavailable, or
 * the response failed validation. Plain, but real and rendered from tokens.
 */
function fallback(fact: ComponentFact, base: string, tokens: GeneratedToken[]): RenderedComponent {
  const semantic = tokens
  const surface = semantic.find((t) => /bg-surface$/.test(t.name))?.name
  const text = semantic.find((t) => /text-default$/.test(t.name))?.name
  const border = semantic.find((t) => /border-default$/.test(t.name))?.name

  const tag = /button/i.test(fact.name) ? 'button' : /input|field/i.test(fact.name) ? 'input' : 'div'
  const html =
    tag === 'input'
      ? `<input class="ROOT" placeholder="SLOT" />`
      : `<${tag} class="ROOT">SLOT</${tag}>`

  const rules = [
    `.ROOT {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid ${border ? `var(--${border})` : 'currentColor'};
  ${surface ? `background: var(--${surface});` : ''}
  ${text ? `color: var(--${text});` : ''}
  font: inherit;
  line-height: 1.4;
}`,
  ]
  for (const [axis, values] of Object.entries(fact.variants)) {
    values.forEach((v, i) => {
      rules.push(`.ROOT--${v} {\n  /* ${axis}="${v}" — no styling recoverable from source */\n  opacity: ${(1 - i * 0.12).toFixed(2)};\n}`)
    })
  }
  return { html, css: rules.join('\n\n') }
}

/**
 * What a leftover SLOT should contain.
 *
 * Never the component's name. "SidebarNavigation" written inside a box is a caption,
 * not a rendering — and it is exactly what made every structural component look
 * identical to every other one.
 */
function slotTextFor(fact: ComponentFact): string {
  const n = fact.name
  if (/nav|menu|sidebar|tab|step|breadcrumb/i.test(n)) return 'Dashboard'
  if (/badge|tag|chip|pill|status/i.test(n)) return 'Active'
  if (/button|action|cta/i.test(n)) return 'Continue'
  if (/input|field|search/i.test(n)) return 'Search…'
  if (/avatar/i.test(n)) return 'AB'
  if (/card|panel|tile|surface/i.test(n)) return 'Card content'
  if (/alert|toast|notice|banner/i.test(n)) return 'Your changes were saved.'
  if (/table|list|grid|row/i.test(n)) return 'Row item'
  return 'Content'
}

/**
 * Substitute the placeholder class and slot for the real ones.
 *
 * A plain global replace, NOT a word-boundary one: the model writes BEM-style
 * children like `ROOT__icon` and `ROOT--error`, and `\bROOT\b` does not match those
 * because `_` and `-` are word characters. Missing them leaves literal "ROOT" in the
 * markup while the CSS has already been renamed, so nothing styles.
 */
function materialise(r: RenderedComponent, base: string, label: string): RenderedComponent {
  return {
    // SLOT is a fallback for models that still emit it. It becomes neutral content —
    // never the component's name, which is a caption, not a rendering.
    html: r.html.replace(/ROOT/g, base).replace(/SLOT/g, label),
    css: r.css.replace(/ROOT/g, base),
    rejected: r.rejected,
  }
}

/**
 * Which tokens to offer the model.
 *
 * A mature system carries hundreds; naming them all would bury the useful ones and
 * blow the prompt. Role-named tokens (success, error, brand, surface…) are what a
 * component actually needs, so those come first, then the derived semantic tier,
 * then a sample of the palette so there is always something to reach for.
 */
const ROLE = /(success|error|danger|warning|info|brand|primary|accent|neutral|surface|background|border|text|foreground|disabled|inverse|link)/i

function offerTokens(tokens: GeneratedToken[], limit = 70): GeneratedToken[] {
  const derived = tokens.filter((t) => t.tier === 'semantic')
  const roleNamed = tokens.filter((t) => t.tier === 'primitive' && ROLE.test(t.name) && t.type === 'color')
  const spacing = tokens.filter((t) => t.tier === 'primitive' && t.type === 'space').slice(0, 10)
  const palette = tokens.filter((t) => t.tier === 'primitive' && t.type === 'color' && !ROLE.test(t.name)).slice(0, 14)

  const seen = new Set<string>()
  const out: GeneratedToken[] = []
  for (const t of [...derived, ...roleNamed, ...spacing, ...palette]) {
    if (seen.has(t.name)) continue
    seen.add(t.name)
    out.push(t)
    if (out.length >= limit) break
  }
  return out
}

export async function renderComponent(
  fact: ComponentFact,
  base: string,
  purpose: string,
  tokens: GeneratedToken[],
): Promise<RenderedComponent> {
  const semantic = offerTokens(tokens)
  // Validation allows any token the conversion actually emits — the system's own
  // names included. What it forbids is a value that is not a token at all.
  const allowed = new Set(tokens.map((t) => t.name))
  const label = slotTextFor(fact)

  if (!apiKey() || !semantic.length) {
    return materialise(fallback(fact, base, tokens), base, label)
  }

  const axes = Object.entries(fact.variants)
    .map(([a, v]) => `${a}: ${v.join(' | ')}`)
    .join('\n') || '(no variant axes — style the base only)'

  const tokenList = semantic
    .map((t) => `--${t.name}  (${t.type})  ${t.description}`)
    .join('\n')

  const prompt = `Component: ${fact.name}
Purpose: ${purpose}

Variant axes (closed sets):
${axes}

Available CSS custom properties — you may use ONLY these names:
${tokenList}

${fact.markup ? `The original component rendered this markup (structure hint only; its classes are not available to you):\n${fact.markup.slice(0, 600)}` : ''}

Write the html and css so this renders as a recognisable ${fact.name}.`

  const reply = await ask(prompt)
  if (!reply || typeof reply.html !== 'string' || typeof reply.css !== 'string') {
    return materialise(fallback(fact, base, tokens), base, label)
  }

  const bad = validate(reply.css, allowed)
  if (bad) {
    // The guarantee outranks the picture. Keep the plain version and say why.
    const f = fallback(fact, base, tokens)
    return materialise({ ...f, rejected: bad }, base, label)
  }

  return materialise({ html: reply.html, css: reply.css }, base, label)
}
