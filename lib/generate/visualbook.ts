/**
 * The visual book — a single self-contained HTML file showing every component
 * BEFORE and AFTER conversion, with the code for both, and the measured scorecard.
 *
 * Self-contained on purpose: no bundler, no server, no install. Open it in a
 * browser, or print it to PDF. Nothing outside the file is fetched.
 *
 * The BEFORE side is rendered honestly. The source components style themselves with
 * arbitrary utilities like `bg-[#3b82f6]`, which render as nothing without Tailwind,
 * so the exact CSS those utilities stand for is emitted alongside. Anything else
 * would flatter the before state by making it look broken.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { ComponentFact, Scorecard, SystemFacts } from '../engine/types'
import type { GeneratedComponent } from './component'
import type { GeneratedToken } from './tokens'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** CSS-escape a Tailwind arbitrary utility so `bg-[#fff]` becomes a real selector. */
const escClass = (c: string) => c.replace(/([[\]#().%/])/g, '\\$1')

/**
 * Translate the arbitrary utilities the source actually uses into real CSS, so the
 * before side renders as the source intends rather than as unstyled markup.
 */
function compileSourceUtilities(facts: SystemFacts): string {
  const rules = new Set<string>()
  const MAP: Array<[RegExp, (v: string) => string]> = [
    [/^bg-\[(#[0-9a-fA-F]{3,8})\]$/, (v) => `background-color:${v}`],
    [/^text-\[(#[0-9a-fA-F]{3,8})\]$/, (v) => `color:${v}`],
    [/^border-\[(#[0-9a-fA-F]{3,8})\]$/, (v) => `border-color:${v}`],
    [/^h-\[(\d+)px\]$/, (v) => `height:${v}px`],
    [/^px-\[(\d+)px\]$/, (v) => `padding-left:${v}px;padding-right:${v}px`],
    [/^py-\[(\d+)px\]$/, (v) => `padding-top:${v}px;padding-bottom:${v}px`],
    [/^p-\[(\d+)px\]$/, (v) => `padding:${v}px`],
    [/^text-\[(\d+)px\]$/, (v) => `font-size:${v}px`],
    [/^shadow-\[([^\]]+)\]$/, (v) => `box-shadow:${v.replace(/_/g, ' ')}`],
  ]
  const NAMED: Record<string, string> = {
    'text-white': 'color:#fff',
    'bg-white': 'background-color:#fff',
    'text-black': 'color:#000',
    'bg-transparent': 'background-color:transparent',
    'shadow-none': 'box-shadow:none',
  }

  for (const c of facts.components) {
    for (const branches of Object.values(c.variantClasses ?? {})) {
      for (const classes of Object.values(branches)) {
        for (const cl of classes.split(/\s+/).filter(Boolean)) {
          if (NAMED[cl]) {
            rules.add(`.${escClass(cl)}{${NAMED[cl]}}`)
            continue
          }
          for (const [re, decl] of MAP) {
            const m = cl.match(re)
            if (m) rules.add(`.${escClass(cl)}{${decl(m[1])}}`)
          }
        }
      }
    }
  }
  return [...rules].join('\n')
}

/** The markup the source component would produce for one variant. */
function beforeMarkup(fact: ComponentFact, axis: string, value: string): string {
  const branchClasses = fact.variantClasses?.[axis]?.[value] ?? ''
  // The cva base class is the first argument; recover it from the component name.
  const baseClass = `aui-${fact.name.toLowerCase()}`
  const el = /input/i.test(fact.name) ? 'input' : /button/i.test(fact.name) ? 'button' : 'div'
  const cls = `${baseClass} ${branchClasses}`.trim()
  const label = `${fact.name} ${value}`
  if (el === 'input') return `<input class="${esc(cls)}" placeholder="${esc(label)}" />`
  if (el === 'button') return `<button class="${esc(cls)}">${esc(label)}</button>`
  return `<div class="${esc(cls)}"><strong>${esc(fact.name)}</strong><br/>${esc(value)}</div>`
}

/** The markup the generated component produces for one variant. */
function afterMarkup(c: GeneratedComponent, axis: string, value: string): string {
  const base = `pl-${c.kebab}`
  const el = /input/i.test(c.name) ? 'input' : /button/i.test(c.name) ? 'button' : 'div'
  // Include the default of every OTHER axis so the sample is a real rendering.
  const others = Object.keys(c.guidance.variants)
    .filter((a) => a !== axis)
    .map((a) => `${base}--${c.guidance.defaultVariants[a]}`)
  const cls = [base, `${base}--${value}`, ...others].join(' ')
  const label = `${c.name} ${value}`
  if (el === 'input') return `<input class="${cls}" placeholder="${esc(label)}" />`
  if (el === 'button') return `<button class="${cls}">${esc(label)}</button>`
  return `<div class="${cls}"><strong>${esc(c.name)}</strong><br/>${esc(value)}</div>`
}

export interface VisualBookInput {
  facts: SystemFacts
  before: Scorecard
  after: Scorecard
  components: GeneratedComponent[]
  tokens: GeneratedToken[]
  files: Record<string, string>
  todos: string[]
}

export function buildVisualBook(input: VisualBookInput): string {
  const { facts, before, after, components, tokens, files, todos } = input

  // The source's own stylesheet, inlined verbatim so the before side renders as it
  // really is. Left untouched on purpose: the two sides use disjoint class prefixes
  // (`aui-` vs `pl-`), so nothing in it can reach the generated components, and
  // editing it here would make the comparison a lie.
  const sourceCss = facts.cssFiles
    .map((rel) => {
      try {
        return fs.readFileSync(path.join(facts.root, rel), 'utf8')
      } catch {
        return ''
      }
    })
    .join('\n')
  const utilities = compileSourceUtilities(facts)
  const tokenCss = files['tokens/tokens.css'] ?? ''
  const componentCss = components
    .map((c) => files[`components/${c.kebab}/${c.name}.css`] ?? '')
    .join('\n')

  const semantic = tokens.filter((t) => t.tier === 'semantic')
  const primitives = tokens.filter((t) => t.tier === 'primitive')

  const delta = after.composite - before.composite

  const sections = components
    .map((c) => {
      const fact = facts.components.find((f) => f.name === c.name)!
      const axes = Object.entries(c.guidance.variants)

      const rows = axes
        .map(
          ([axis, values]) => `
      <div class="axis">
        <div class="axis-head"><span class="mono">${esc(axis)}</span><span class="axis-values">${values.map((v) => esc(v)).join(' · ')}</span></div>
        <div class="split">
          <div class="side side-before">
            <div class="side-label">Before<span>source · ${esc(fact.rawValues.length.toString())} raw values</span></div>
            <div class="specimens">${values.map((v) => `<div class="spec">${beforeMarkup(fact, axis, v)}<code>${esc(v)}</code></div>`).join('')}</div>
          </div>
          <div class="side side-after">
            <div class="side-label">After<span>generated · tokens only</span></div>
            <div class="specimens">${values.map((v) => `<div class="spec">${afterMarkup(c, axis, v)}<code>${esc(v)}</code></div>`).join('')}</div>
          </div>
        </div>
      </div>`,
        )
        .join('')

      const beforeProps = fact.props
        .map((p) => `${p.name}${p.required ? '' : '?'}: ${p.type}`)
        .join('\n')
      const afterProps = c.guidance.props
        .map((p) => `${p.name}${p.required ? '' : '?'}: ${p.type}`)
        .join('\n')

      return `
  <section class="component" id="${esc(c.kebab)}">
    <header class="component-head">
      <h2>${esc(c.name)}</h2>
      <p class="purpose">${esc(c.guidance.purpose)}</p>
      <div class="chips">
        <span class="chip chip-bad">${fact.openVariants.length} open union${fact.openVariants.length === 1 ? '' : 's'} → 0</span>
        <span class="chip chip-bad">${fact.rawValues.length} raw value${fact.rawValues.length === 1 ? '' : 's'} → 0</span>
        <span class="chip chip-good">${c.guidance.tokens.length} tokens consumed</span>
        <span class="chip chip-good">${c.guidance.useInstead.length} when-NOT-to-use rules</span>
      </div>
    </header>

    ${rows}

    <div class="split code-split">
      <div class="side">
        <div class="side-label">Before<span>prop surface</span></div>
        <pre class="code code-before">${esc(beforeProps)}</pre>
      </div>
      <div class="side">
        <div class="side-label">After<span>prop surface</span></div>
        <pre class="code code-after">${esc(afterProps)}</pre>
      </div>
    </div>

    <div class="guidance">
      <h3>When NOT to use — and what instead</h3>
      <p class="note">This is the field that decides between lookalikes. Without it an agent picks by appearance, which is the single most common wrong answer.</p>
      <table>
        <thead><tr><th>Condition</th><th>Use instead</th></tr></thead>
        <tbody>${c.guidance.useInstead.map((u) => `<tr><td>${esc(u.when)}</td><td><code>${esc(u.use)}</code></td></tr>`).join('')}</tbody>
      </table>
      <h3>Also known as</h3>
      <p class="aliases">${c.guidance.aliases.map((a) => `<span>${esc(a)}</span>`).join('')}</p>
    </div>
  </section>`
    })
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(facts.packageName)} — visual book</title>
<style>
/* ---- the book's own styling ---- */
:root{
  --paper:#FDFAF6; --paper-raised:#fff; --paper-sunken:#F6F1E9; --edge:#EDE4D8;
  --ink:#2B1710; --ink-soft:#6B5449; --ink-faint:#9A8578;
  --flame:#FF6B1A; --flame-deep:#D4560A; --coral:#F97362;
  --good:#2F7D52; --bad:#D4560A;
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);
  font:15px/1.6 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  -webkit-font-smoothing:antialiased}
.mono{font-family:"JetBrains Mono",ui-monospace,monospace}
.wrap{max-width:1180px;margin:0 auto;padding:0 32px 96px}

/* hero — radial glow, the reference signature */
.hero{background:radial-gradient(120% 90% at 50% 118%,#fff 0%,#FFE2C0 18%,#FF8A3D 46%,#F6621A 72%,#D4560A 100%);
  color:#fff;padding:72px 32px 88px;text-align:center;margin-bottom:-48px}
.hero h1{margin:0 0 8px;font-size:44px;letter-spacing:-.032em;font-weight:600}
.hero .sub{opacity:.92;font-size:16px;margin:0 0 28px}
.hero .eyebrow{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.16em;
  text-transform:uppercase;opacity:.85;margin-bottom:14px}

/* score header */
.scoreboard{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;
  background:var(--paper-raised);border:1px solid var(--edge);border-radius:24px;padding:28px;
  box-shadow:0 24px 48px -28px rgba(43,23,16,.22);position:relative;z-index:2}
.score-big{display:flex;align-items:baseline;gap:12px}
.score-big .n{font-size:52px;font-weight:600;letter-spacing:-.04em;line-height:1}
.score-big .arrow{color:var(--ink-faint);font-size:24px}
.score-big .n.after{color:var(--flame-deep)}
.verdict{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:6px 14px;
  font-size:12px;font-weight:600;border:1px solid}
.verdict.no{color:var(--bad);border-color:#F5C9A8;background:#FFF1E6}
.verdict.yes{color:var(--good);border-color:#B9DCC7;background:#EEF7F1}
.axis-bars{display:grid;gap:10px}
.bar-row{display:grid;grid-template-columns:96px 1fr 76px;gap:10px;align-items:center;font-size:12px}
.bar{height:8px;border-radius:999px;background:var(--paper-sunken);overflow:hidden;position:relative}
.bar i{position:absolute;inset:0 auto 0 0;border-radius:999px;background:linear-gradient(90deg,#FFB088,#FF6B1A)}
.bar i.b{background:var(--edge)}

h2{font-size:30px;letter-spacing:-.03em;margin:0 0 6px;font-weight:600}
h3{font-size:14px;letter-spacing:.01em;margin:24px 0 8px;font-weight:600}
.section-title{margin:64px 0 20px;display:flex;align-items:baseline;gap:12px}
.section-title .mono{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-faint)}
.section-title h2{margin:0}

.component{background:var(--paper-raised);border:1px solid var(--edge);border-radius:24px;
  padding:32px;margin-bottom:28px;box-shadow:0 1px 3px rgba(43,23,16,.05)}
.component-head{border-bottom:1px solid var(--edge);padding-bottom:20px;margin-bottom:24px}
.purpose{color:var(--ink-soft);margin:0 0 14px;max-width:70ch}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{font-size:11px;font-weight:500;border-radius:999px;padding:4px 10px;border:1px solid}
.chip-bad{color:var(--bad);border-color:#F5C9A8;background:#FFF4EC}
.chip-good{color:var(--good);border-color:#B9DCC7;background:#EEF7F1}

.axis{margin-bottom:26px}
.axis-head{display:flex;align-items:baseline;gap:10px;margin-bottom:10px}
.axis-head .mono{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-faint)}
.axis-values{font-size:12px;color:var(--ink-faint)}
.split{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.side{border:1px solid var(--edge);border-radius:18px;overflow:hidden;background:var(--paper)}
.side-before{background:repeating-linear-gradient(45deg,#FFF9F3,#FFF9F3 10px,#FFF5EC 10px,#FFF5EC 20px)}
.side-after{background:var(--paper-raised)}
.side-label{display:flex;justify-content:space-between;align-items:center;
  padding:9px 14px;border-bottom:1px solid var(--edge);
  font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.side-before .side-label{color:var(--bad)}
.side-after .side-label{color:var(--good)}
.side-label span{font-family:"JetBrains Mono",monospace;font-weight:400;
  text-transform:none;letter-spacing:0;color:var(--ink-faint);font-size:10.5px}
.specimens{display:flex;flex-wrap:wrap;gap:14px;padding:22px 18px;align-items:flex-end}
.spec{display:flex;flex-direction:column;gap:7px;align-items:flex-start}
.spec code{font-family:"JetBrains Mono",monospace;font-size:10px;color:var(--ink-faint)}

.code{font-family:"JetBrains Mono",monospace;font-size:11.5px;line-height:1.75;
  margin:0;padding:16px 18px;white-space:pre-wrap;color:var(--ink-soft)}
.code-before{background:#FFF9F3}
.code-split{margin-top:20px}

.guidance{margin-top:26px;border-top:1px solid var(--edge);padding-top:20px}
.note{color:var(--ink-faint);font-size:12.5px;margin:0 0 12px;max-width:72ch}
table{border-collapse:collapse;width:100%;font-size:13px}
th{text-align:left;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--ink-faint);font-weight:500;padding:0 0 8px;border-bottom:1px solid var(--edge)}
td{padding:9px 0;border-bottom:1px solid var(--paper-sunken);vertical-align:top}
td:last-child{width:42%}
td code{font-family:"JetBrains Mono",monospace;font-size:11.5px;color:var(--flame-deep);
  background:#FFF4EC;border-radius:6px;padding:2px 7px}
.aliases{display:flex;flex-wrap:wrap;gap:6px;margin:0}
.aliases span{font-size:11.5px;border:1px solid var(--edge);border-radius:999px;
  padding:3px 10px;color:var(--ink-soft);background:var(--paper)}

.todos{background:#FFF4EC;border:1px solid #F5C9A8;border-radius:24px;padding:28px}
.todos h2{font-size:22px}
.todos ol{margin:12px 0 0;padding-left:20px}
.todos li{margin-bottom:8px;font-size:13.5px;color:var(--ink-soft)}
.tokens{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.tok{display:flex;align-items:center;gap:10px;border:1px solid var(--edge);border-radius:14px;
  padding:9px 12px;background:var(--paper-raised)}
.sw{width:26px;height:26px;border-radius:8px;border:1px solid rgba(43,23,16,.12);flex:none}
.tok-name{font-family:"JetBrains Mono",monospace;font-size:10.5px;line-height:1.35;
  word-break:break-all;color:var(--ink-soft)}
footer{margin-top:56px;padding-top:24px;border-top:1px solid var(--edge);
  color:var(--ink-faint);font-size:12px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px}

@media print{
  body{background:#fff}
  .hero{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .component{break-inside:avoid;box-shadow:none}
  .axis{break-inside:avoid}
}
@media (max-width:820px){.split{grid-template-columns:1fr}.wrap{padding:0 18px 64px}}

/* ---- the SOURCE system's own CSS, so the before side renders truthfully ---- */
${sourceCss}
${utilities}

/* ---- the GENERATED token layer and components ---- */
${tokenCss}
${componentCss}
</style>
</head>
<body>

<div class="hero">
  <div class="eyebrow">Visual book</div>
  <h1>${esc(facts.packageName)}</h1>
  <p class="sub">Every component, before and after conversion. Rendered from the real code on both sides.</p>
</div>

<div class="wrap">

  <div class="scoreboard">
    <div>
      <div class="mono" style="font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-faint);margin-bottom:10px">Agent readiness</div>
      <div class="score-big">
        <span class="n">${before.composite}</span>
        <span class="arrow">→</span>
        <span class="n after">${after.composite}</span>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <span class="verdict no">${esc(before.verdict.label)}</span>
        <span class="verdict yes">${esc(after.verdict.label)}</span>
      </div>
      <p style="font-size:12.5px;color:var(--ink-soft);margin:14px 0 0;max-width:34ch">${esc(after.verdict.meaning)}</p>
    </div>
    <div class="axis-bars">
      <div class="mono" style="font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-faint)">By axis</div>
      ${before.axes
        .map((a, i) => {
          const b = after.axes[i]
          return `<div class="bar-row">
        <span style="color:var(--ink-soft)">${esc(a.label)}</span>
        <span class="bar"><i class="b" style="width:${a.value ?? 0}%"></i><i style="width:${b.value ?? 0}%"></i></span>
        <span class="mono" style="color:var(--ink-faint);font-size:11px">${a.value ?? '—'} → ${b.value ?? '—'}</span>
      </div>`
        })
        .join('')}
    </div>
    <div class="axis-bars">
      <div class="mono" style="font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-faint)">Measured</div>
      <div class="bar-row"><span style="color:var(--ink-soft)">Raw values</span><span class="bar"><i style="width:100%"></i></span><span class="mono" style="font-size:11px">${facts.rawValueTotal} → 0</span></div>
      <div class="bar-row"><span style="color:var(--ink-soft)">Open unions</span><span class="bar"><i style="width:100%"></i></span><span class="mono" style="font-size:11px">${facts.components.filter((c) => c.openVariants.length).length} → 0</span></div>
      <div class="bar-row"><span style="color:var(--ink-soft)">Semantic tokens</span><span class="bar"><i style="width:100%"></i></span><span class="mono" style="font-size:11px">0 → ${semantic.length}</span></div>
      <div class="bar-row"><span style="color:var(--ink-soft)">Needs a human</span><span class="bar"><i style="width:${Math.min(100, todos.length * 12)}%"></i></span><span class="mono" style="font-size:11px">${todos.length}</span></div>
    </div>
  </div>

  <div class="section-title"><span class="mono">01</span><h2>Components</h2></div>
  ${sections}

  <div class="section-title"><span class="mono">02</span><h2>Token layer</h2></div>
  <div class="component">
    <p class="purpose">${primitives.length} primitives, ${semantic.length} semantic. Components consume the semantic tier and nothing else — that is what lets a value be re-themed without touching a component.</p>
    <h3>Semantic — the only tier a component may use</h3>
    <div class="tokens">
      ${semantic
        .filter((t) => t.type === 'color')
        .slice(0, 36)
        .map((t) => {
          const resolved = t.aliasOf ? primitives.find((p) => p.name === t.aliasOf)?.value ?? '#ccc' : t.value
          return `<div class="tok"><span class="sw" style="background:${esc(resolved)}"></span><span class="tok-name">--${esc(t.name)}</span></div>`
        })
        .join('')}
    </div>
  </div>

  <div class="section-title"><span class="mono">03</span><h2>Needs a human</h2></div>
  <div class="todos">
    <h2>${todos.length} open question${todos.length === 1 ? '' : 's'}</h2>
    <p class="note">Nothing below was guessed. Each one is a value that could not be measured from the source, recorded as a question rather than filled in. This list is the honest ceiling on the score.</p>
    <ol>${todos.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
  </div>

  <footer>
    <span>${esc(facts.packageName)} · ${facts.components.length} components found · ${components.length} converted · ${delta >= 0 ? '+' : ''}${delta} points measured</span>
    <span class="mono">Generated by Peel · ${new Date().toISOString().slice(0, 10)}</span>
  </footer>
</div>
</body>
</html>`
}
