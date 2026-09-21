# The four-layer agentic design system

The architecture presented at Into Design Systems by Cristian Morales Achiardi,
implemented literally rather than approximated.

```
1 TOKENIZATION   values and definitions — where building or auditing starts
2 INTENT         component logic and metadata; the codebase is the source of truth
3 INDEXING       mapping relationships; the infrastructure that makes reports cheap
4 ORCHESTRATION  instructions, rules and skills
```

The layer almost everyone skips is **indexing**, and its absence is precisely what
makes governance expensive. Without a relationship map every audit has to re-read the
whole system, so nobody runs one. With it, a report is a query.

```
agent-ready/
├── 1-tokenization/
│   ├── tokens.dtcg.json          the interchange format
│   ├── tokens.json               the flat list, with origins
│   ├── tokens.css                compiled custom properties
│   └── style-dictionary.config.js
├── 2-intent/
│   ├── components/<kebab>/
│   │   ├── <Name>.tsx            closed unions, tokens only
│   │   ├── <Name>.css            the visual layer
│   │   ├── <Name>.contract.json  framework-agnostic
│   │   ├── <Name>.stories.tsx    one per variant, one per state
│   │   ├── guidance.yaml         the judgment layer
│   │   ├── example.tsx           one compiling canonical usage
│   │   └── README.md             generated from guidance
│   ├── index.ts
│   └── styles.css
├── 3-indexing/
│   ├── index.json                the relationship map
│   ├── prop-canon.json           one name per concept
│   └── llms.txt                  the looks-like index
├── 4-orchestration/
│   ├── AGENTS.md · RULES.md · design.md · curation.json
│   ├── skills/ds-choose · ds-build · ds-audit
│   └── gates/check-conformance · check-docs · CI · eslint
├── manifest.json
├── SCORECARD.md
└── visual-book.html
```

Write in this order. Later layers are generated from earlier ones, and generating
them out of order produces an index that disagrees with what it indexes.

---

## 1 · Tokenization

**Emit DTCG.** The Design Tokens Community Group format is the interchange standard,
so the layer is consumable by Style Dictionary, Tokens Studio and Figma Variables. A
token layer only one tool can read is a private format wearing a standard's name.

```jsonc
{
  "semantic": {
    "bg": { "action": { "primary": {
      "$type": "color",
      "$value": "{primitive.palette.3b82f6}",   // a real DTCG reference
      "$description": "bg for Button variant=\"primary\"",
      "$extensions": { "io.peel": { "origin": "src/Button.tsx · cva variant.primary" } }
    }}}
  }
}
```

Rules:

- **Two tiers.** Primitives exist to be referenced by semantic tokens and by nothing
  else. A component reaching past the semantic tier to a primitive is a defect.
- **Derive semantic names from where the value is used.** `bg-[#3b82f6]` inside the
  cva branch `variant.primary` becomes `bg-action-primary`. The name comes from the
  axis the value already lives in, so the mapping is mechanical and traceable rather
  than a judgement call.
- **Carry the system's own tokens through under their own names.** A mature system
  already has a token layer — one real system ships 980 colour tokens and a full
  spacing scale. Reducing that to the few hex literals appearing inline throws away
  everything the team built and leaves anything generated against it with no palette.
- **Every token records its `origin`** — `file:line`, or the cva branch it came from.
- **A `size` or `padding` axis carries dimensions, not colour.** Extract `h-[28px]`,
  `px-[16px]`, `text-[14px]`; do not report a missing colour for it.
- **Handle named utilities.** `bg-[#3b82f6] text-white` derives a background token
  and, without handling `text-white`, no foreground token — so the button renders
  blue with black text.

## 2 · Intent

Component logic and metadata. The codebase is the source of truth.

### The contract is JSON, not TypeScript

```jsonc
{
  "name": "Button",
  "purpose": "…",
  "anatomy": { "root": "pl-button", "parts": ["pl-button__icon", "pl-button__label"] },
  "axes": {
    "variant": { "values": ["primary","secondary","danger"], "default": "primary", "closed": true }
  },
  "states": [{ "name": "disabled", "trigger": "the disabled prop is set" }],
  "accessibility": { "role": "button", "label": "…", "keyboard": "…" },
  "tokenPolicy": { "allowed": ["bg-action-primary"], "tier": "semantic" },
  "props": [ … ],
  "provenance": [ … ]
}
```

A contract expressed only as types is unreadable to anything that does not compile
TypeScript — which includes Figma, most agents, and every other platform the system
will eventually target.

### Component source rules

1. **No raw values.** Every colour, space, radius and duration references a token.
2. **Closed unions on every variant prop.** `size: 'sm' | 'md' | 'lg'`, never
   `size: string`. The cheapest hallucination fix available, and a compile-time
   guarantee rather than a documentation hope.
3. **Explicit defaults**, where a reader and a parser can both find them.
4. **The a11y contract is implemented**, not merely described.
5. **`className` is layout and position only** — never appearance.

### The visual layer

What a component should LOOK like is the one thing no compiler can derive. Ask a
model for structure and CSS, then **validate** before accepting:

- Reject any raw hex, `rgb()`, or named colour.
- Reject any `var(--x)` not in the emitted token set.
- Reject `@import`, `url()`, `!important`.
- On rejection, ship the deterministic fallback and record why.

Instruction is not enforcement. The guarantee outranks the picture.

Ask for **realistic content** — a nav gets labelled links, a badge gets a status word,
a table gets a header and two rows. Never the component's own name as visible text.

## 3 · Indexing

The layer that makes governance cheap.

```jsonc
{
  "counts": { "components": 2, "tokens": 96, "axes": 4, "lookalikeRules": 8, "aliases": 12 },
  "byAlias":    { "btn": "Button", "cta": "Button", "pill": "Badge" },
  "axisIndex":  { "variant": ["Button"], "tone": ["Card"] },
  "tokenUsage": { "bg-action-primary": ["Button"] },
  "lookalikes": [{ "from": "Button", "when": "it navigates", "use": "Link" }],
  "notConverted": ["Alert", "Input"]
}
```

Each map answers a question that would otherwise cost a full crawl:

- **`byAlias`** — how a model searching from a screenshot finds anything. It knows
  the industry's vocabulary, not yours; `ButtonGroup` is invisible to something
  looking for "segmented control".
- **`tokenUsage`** — the reverse index a re-theme needs. A token with one consumer is
  probably mis-tiered; a token with none is dead.
- **`lookalikes`** — the graph that decides between confusable components.
- **`notConverted`** — what exists in source but has no contract. Coverage, for free.

### `prop-canon.json`

One name per concept, across the whole system. Synonym drift is the quiet killer —
one component takes `label`, another `text`, a third `title`, and an agent guesses
every time. Declaring the canonical name makes the drift visible and gate-able.

## 4 · Orchestration

**`RULES.md`** — read whole, first, every time. Hard budget: **60 lines**. Past that
it becomes a second guide and stops being read. Three blocks — *Always*, *Never*,
*When unsure* — plus a short "if an override does nothing" procedure.

Every rule must come from a real finding on **this** system. A generic rule that is
not true here teaches the agent to distrust the file, and one distrusted line costs
more than the whole file buys.

```
✗  Never override component styles with utilities.
✓  Never restyle appearance with utilities — cn() is twMerge(clsx()), so your
   class wins and silently DELETES the variant's own.
✓  Never put colour utilities on Sidebar/Header/Table — that CSS is unlayered,
   so your class is INERT and does nothing at all.
```

The first is a slogan; the others are actionable.

**`AGENTS.md`** — model-neutral, plain Markdown, no vendor conventions. Opens with a
section → line map and an instruction to use anchored greps, or the whole file gets
read to reach one JSX block.

**`llms.txt`** — one line per component, cheap enough to read whole. Must contain the
**looks-like index**: mockup shape → component name.

**`curation.json`** — the near-miss map. Invented names are caught free by `TS2305`;
the uncaught case is a **real export used for the wrong job**. Ask the one question
that cannot be derived from code: *"when one of your engineers reaches for the wrong
component, which one do they reach for?"* Every team can answer instantly. None have
written it down.

**Skills** — reusable instruction sets for one job each: `ds-choose` (pick the right
component), `ds-build` (write a screen without drifting), `ds-audit` (report health
without re-reading the codebase).

**Gates** — a rule nothing checks is decoration. Ship a conformance checker that runs
over *generated screens* (not the library), a docs-freshness check, a CI workflow and
a lint config. **Every finding must name its fix**, taken from the curation map: a
checker that reports a problem hands the repair loop a problem; one that names the fix
hands it a patch.
