---
name: peel-mcp
description: Turn any design system into a four-layer agentic design system, with a measured score and a visual storybook proving the before and after. Takes a GitHub URL, a local folder or a zip; audits it against a nine-layer rubric, renders a visual playbook of what is there now, converts the chosen components into tokenization / intent / indexing / orchestration layers, and renders a second playbook showing the result. Use for "score this design system", "is this agentic", "make this agent-ready", "convert this design system", "before and after storybook", "audit this component library", "peel".
---

# Peel

Take a design system nobody wrote for machines and turn it into one an agent can
build from — then prove it by rendering both states side by side.

```
0  Locate    read-only   find the package; tokens and components are rarely together
1  Extract   read-only   props, variants, defaults, tokens, markup — MEASURED
2  Score     read-only   nine layers, four axes → Not agentic / Partly / Agentic
3  Playbook  WRITES      render what is there NOW, before anything changes
4  Confirm   read-only   ─── GATE ──▶ the contract is corrected by a human
5  Generate  WRITES      four layers, into a NEW folder only
6  Prove     WRITES      the second playbook + a storybook, from the output alone
7  Ship      WRITES      zip, PR, or an MCP endpoint the editor consumes
```

Two things are non-negotiable: **the gate at step 4**, and **the score at step 6
being re-measured rather than projected**.

## Reference files

Load on demand. Do not read them all up front.

| File | Read it when |
|---|---|
| `references/architecture.md` | Step 5. The four layers, exactly what each contains. |
| `references/rubric.md` | Step 2. Every check, how it is scored, what evidence counts. |
| `references/extraction.md` | Step 1. **Read this before writing any extractor** — it carries the traps that cost the most. |
| `references/visual.md` | Steps 3 and 6. The playbook and the storybook. |
| `references/topologies.md` | The system is not Tailwind + CVA. |

---

## The one decision everything follows from

**The model never writes a fact.** Three tiers of trust, and nothing crosses between
them:

| Tier | Produced by | Guarantee |
|---|---|---|
| **Facts** | TypeScript compiler API over the AST | Measured. Props, variants, defaults, tokens, markup — with line numbers. |
| **Structure** | Deterministic templates | Same input, same output, byte for byte. |
| **Judgment** | Recorded archetypes, then a model | Aliases, when-to-use, when-NOT-to-use, and the visual layer. Validated before acceptance. |

A model may be asked what a component should LOOK like and what people CALL it. It
may never be asked what props it has. Anything it supplies is recorded in
`provenance` so generated judgment stays distinguishable from measured fact.

Two invariants:

- **A degraded read never scores higher than a full one.** If types will not resolve,
  affected checks report `unscored` — never `pass`. Measuring nothing and reporting
  it clean is the most dangerous thing an audit tool can do.
- **Every finding carries its evidence.** `src/components/Button.tsx:21` beside the
  claim. A finding without one is an opinion, and nobody can check an opinion.

---

## Step 0 — Locate

**Tokens and components are usually in different packages.** A monorepo design system
routinely ships `packages/css` for the token layer and `packages/react` for the
components. Locating the component package and then reading tokens from inside it
finds nothing, and a system with thousands of tokens is reported as having none.

```bash
find . -name package.json -not -path '*/node_modules/*' -maxdepth 3
```

Score candidates: a name or path containing `ui`, `design-system`, `components` or
`kit` scores up; living under `packages/` scores up; depending on
`class-variance-authority`, `tailwind-variants`, `@radix-ui` or a CSS-in-JS library
scores up; declaring `exports` or `types` scores up. A package named `www`, `docs`,
`website` or `app` scores **down** — the docs site is the usual false positive.

Then split the read:

- **Components** come from the located package.
- **Stylesheets and tokens** come from the whole tree.

Exclude from component counting: `examples/`, `demos/`, `docs/`, `stories/`,
`registry/`, `templates/`, `__tests__/`, `fixtures/`. Match those against the path
**relative to the root**, never the absolute path, or a repo living under a folder
named `fixtures/` excludes itself.

**Say which package you picked and why**, so the call can be disputed in ten seconds.

## Step 1 — Extract

Read `references/extraction.md` first. It is short and every line in it cost a bug.

Per component: name, file, exported-from-entry, props with types and JSDoc, variant
axes with their values, defaults, the literal class string each branch applies, raw
colour/size literals with line numbers, the markup it renders, states, doc comment.

Set `degraded` when a prop surface resolved for fewer than a third of the components
found, and gate every contract check on it.

## Step 2 — Score

Read `references/rubric.md`. Nine layers into four weighted axes:

| Axis | Layers | Weight | The question |
|---|---|---|---|
| Admission | L0 distribution · L1 tokens · L2 cascade | 25% | Can it be installed, themed and rendered? |
| Contract | L3 components · L4 variants · L5 types | 25% | Can the vocabulary be enumerated and constrained? |
| Knowledge | L6 knowledge base | 30% | Given the vocabulary, will it pick the right thing? |
| Gate | L7 enforcement · L8 provenance | 20% | When it picks wrong, does anything catch it? |

Knowledge carries the most weight because it is the only layer whose absence is
**silent**. A missing export throws `TS2305` and the agent recovers; a missing
"what you'll reach for by mistake" map produces confident, compiling, wrong code.

**The verdict is one of three, stated plainly before the number:**

| Score | Verdict | What it means |
|---|---|---|
| 0–39 | **Not agentic** | An agent invents freely against this |
| 40–69 | **Partly agentic** | Right on simple screens, drifts on real ones |
| 70–100 | **Agentic** | Reproducible without human correction |

## Step 3 — The first playbook

**Render what is there now, before changing anything.** See `references/visual.md`.

This is not decoration. A score nobody can see is a number to argue with; a score
next to the thing it describes is a finding. It also catches extraction errors
immediately — a component that renders as an empty box means the markup was not
recovered, and that is worth knowing before generating anything from it.

## Step 4 — Confirm · GATE

**Nothing is generated until the contract is confirmed.**

Extraction measures a great deal and infers the rest, but it cannot know a component
is misnamed, that a variant set is wrong, or what a team means by "use this instead".
Every serious pipeline puts a person here. Supernova puts them in Figma, where it
does not look like work.

Present the proposed contract per component, **pre-filled**, each field marked with
where it came from — `from source` / `known pattern` / `generated` — and flag only
what could not be measured. A reviewer should be looking at four things, not forty,
or the gate becomes the reason nobody uses the tool.

Worth flagging: a purpose that was generated rather than documented; an axis with no
declared default; an open variant prop; a component not exported; a `useInstead` that
was generated, since that is the field that decides between lookalikes.

**A correction outranks every other source, including the source's own docs** — the
reviewer has seen both.

## Step 5 — Generate

Four layers, in order. Read `references/architecture.md`.

```
1-tokenization/   values and definitions — DTCG, Style Dictionary ready
2-intent/         component logic and metadata; code is the source of truth
3-indexing/       mapping relationships; makes a report a query, not a crawl
4-orchestration/  instructions, rules, skills and gates
```

**Indexing is the layer everyone skips**, and its absence is exactly what makes
governance expensive: with no relationship map, every audit re-reads the whole system,
so nobody runs one.

Everything goes into a **new folder**. The source is read-only, forever. That rule is
what makes the GitHub push safe — the PR can only ever add a directory.

## Step 6 — Prove

Two artifacts, both built from the generated output alone.

**The second playbook** — every component, before against after, rendered from real
code on both sides. **The storybook** — one story per variant value, one per state,
generated from the contract rather than hand-written.

Then **re-run the audit against the output** and report the measured delta. Never a
projected one. A projected number becomes a client commitment and then turns out to
be wrong.

A variant or state that cannot be rendered from its own contract is a **finding**, not
a broken story — it means the contract claims something the code does not do. Go back
and correct the score.

## Step 7 — Ship

- **`.zip`** — the four-layer folder.
- **PR** — additive only, branch `peel/agent-ready`, commit adds `agent-ready/` and
  modifies nothing. The scorecard is the PR body.
- **MCP** — the generated system served back to the editor, so the agent asks what
  exists instead of inventing it.

---

## The working app

`C:\Users\dheen\Downloads\peel final` implements all of this with a UI:

```bash
npm run dev        # http://localhost:3210
```

Ingest from GitHub or zip, stream the audit, review at the gate, convert, browse the
output, export. The MCP server is `mcp/server.mjs`.

Headless, when the artifacts matter and the UI does not:

```bash
node scripts/peel.mjs <github-url | local-path | file.zip> \
  [--components Button,Card] [--out ./agent-ready] [--score-only] [--json]
```

Prior work worth knowing about: `C:\Users\dheen\Downloads\PEEL MCP` is a stdio MCP
server implementing the same rubric as seven tools, with 109 passing checks.
`C:\Users\dheen\Downloads\rps-ui` is `@rps/ui`, built TO this rubric rather than
retrofitted, and scores 93.

## Guardrails

- **The gate is a hard stop.** Nothing is generated before the contract is confirmed.
  Silence is not approval.
- **Never edit the source.** Every generated byte goes to a new folder.
- **Never report a projected delta.** Re-measure the output.
- **Report `unscored`, never `pass`,** when something could not be measured.
- **Say which package you audited** and what else was in the tree.
- **A model is never asked for a fact.** Props, variants, defaults and tokens come
  from the AST or they do not exist.
- **Validate anything a model produces** before accepting it. Instruction is not
  enforcement.
- **Record assumptions, do not block on them.** The output has to stand on its own;
  a decision taken from the available evidence and written down beats a `TODO` that
  stops the work.
