# The rubric

Nine layers rolled into four weighted axes, with hard caps. Score from evidence, not
impression — every check below names what proves it.

```
Admission  (25%)  L0 distribution · L1 tokens · L2 cascade
Contract   (25%)  L3 components · L4 variants · L5 types
Knowledge  (30%)  L6 knowledge base
Gate       (20%)  L7 enforcement · L8 provenance
```

Knowledge carries the heaviest weight because it is the only layer whose absence is
**silent**. A missing export throws `TS2305` and the agent recovers. A missing
near-miss map produces confident, compiling, wrong code that nobody notices until
review.

Severity weights: `BLOCK` 3, `GAP` 2, `WATCH` 1. An axis scores
`earned / possible × 100` over the checks that were actually **measured** —
`unscored` checks are excluded from both sides, and the composite renormalises across
measured axes so an unscored axis neither inflates nor deflates it.

---

## The checks

### L0 · Distribution & manifest

| id | Severity | Passes when | Evidence |
|---|---|---|---|
| `l0.install-path` | BLOCK | not `private: true` | `package.json` |
| `l0.exports` | GAP | an `exports` map is declared | `package.json` |
| `l0.agent-docs` | GAP | an `agentDocs` block points at the knowledge base | `package.json` |

`private: true` is usually a **procurement** decision, not an engineering one. Flag it
for the client; never silently remove it. Record the sanctioned install route instead.

### L1 · Token layer

| id | Severity | Passes when |
|---|---|---|
| `l1.tokens-exist` | BLOCK | custom properties are found |
| `l1.semantic-tier` | GAP | names describe purpose, not appearance |

`blue-500`, `gray-2`, `size-14` describe appearance. `bg-action-primary`,
`text-danger`, `space-section` describe purpose. Caps the composite at **65** when
absent.

### L2 · Cascade & CSS delivery

| id | Severity | Passes when |
|---|---|---|
| `l2.override-outcome` | BLOCK | the override outcome is uniform |

**Unlayered CSS beats layered CSS unconditionally.** A consumer utility aimed at an
unlayered component rule is not weak — it is **inert**. A library where some families
are layered and others are not produces mixed outcomes, which neither a person nor a
model can reason about. Caps at **75**.

If no stylesheet was emitted, report `unscored`. Do not infer.

### L3 · Component contract

| id | Severity | Passes when |
|---|---|---|
| `l3.all-exported` | GAP | every component found is reachable from the entry point |
| `l3.no-raw-values` | GAP | no raw colour or size literals in component source |

An unexported component cannot be imported, so an agent hand-rolls a replacement.
Every raw literal is a value an agent will copy and then invent variations of.

### L4 · Variant layer

| id | Severity | Passes when |
|---|---|---|
| `l4.closed-variants` | BLOCK | every variant prop is a closed literal union |
| `l4.defaults-documented` | GAP | every variant map declares its defaults |

`variant?: string` against a component whose map has four branches means
`variant="cta"` **compiles**. The cheapest fix in the rubric and the most commonly
missed.

### L5 · Type surface

| id | Severity | Passes when |
|---|---|---|
| `l5.named-props` | GAP | ≥80% of components expose a named `*Props` interface |
| `l5.emitted-types` | BLOCK | declarations are emitted and `types` points at them |

No emitted types means a consumer resolves `any` and every prop check is silently
skipped. Caps at **55**.

### L6 · Knowledge base

| id | Severity | Weight |
|---|---|---|
| `l6.AGENTS.md` | GAP | the entry point any LLM reads first |
| `l6.llms.txt` | GAP | the index, and the looks-like map |
| `l6.components.json` | GAP | the machine-readable prop and variant surface |
| `l6.curation.json` | **BLOCK** | the near-miss map — highest value, almost never present |
| `l6.RULES.md` | GAP | the do/do-not card |
| `l6.doc-coverage` | GAP | ≥60% of components carry any documentation |

No knowledge-base file of any kind caps the composite at **45**.

### L7 · Enforcement

| id | Severity | Passes when |
|---|---|---|
| `l7.lint` | GAP | a linter is configured |
| `l7.ci` | WATCH | a CI workflow runs the gates |
| `l7.tests` | WATCH | tests exist |

Without a mechanical consumer, prose rules are advisory and nothing catches a
violation.

### L8 · Provenance & drift

| id | Severity | Passes when |
|---|---|---|
| `l8.stories` | WATCH | a rendered reference exists |
| `l8.freshness` | GAP | docs regenerate from code |

A hand-maintained API file drifts within one release.

---

## Hard caps

Applied to the composite regardless of how well every other axis scored.

| Condition | Cap | Why |
|---|---|---|
| No knowledge-base file at all | 45 | An agent has nothing to read |
| No emitted types | 55 | The vocabulary cannot be enumerated |
| No semantic token tier | 65 | Components consume raw primitives |
| Override outcome not uniform | 75 | Nothing can reason about the cascade |

State the cap and the uncapped score together. A capped 45 with an uncapped 78 is a
different conversation from a genuine 45.

## The verdict

| Score | Verdict | What it means in practice |
|---|---|---|
| 0–39 | **Not agentic** | An agent invents freely against this |
| 40–69 | **Partly agentic** | Right on simple screens, drifts on real ones |
| 70–100 | **Agentic** | Reproducible without human correction |

**Lead with the verdict, not the number.** "45/100" invites haggling; "Partly agentic
— right on simple screens, drifts on real ones" is actionable.

## The ladder

Rank remediation by **points bought per hour**, not by severity. Severity says what
hurts; points-per-hour says what to do on Monday.

```
 #  Fix                          Layer   Hours   Pts   Pts/h
 1  declare install path         L0        0.1  +5.5   55.0   ← blocked on client
 2  add agentDocs                L0        0.1  +2.0   20.0
 3  close the variant unions     L4        0.5  +6.0   12.0
10  nearMiss map                 L6          8  +5.2    0.65  ← needs 15 min of theirs
```

State three things per row and soften none of them: what it costs, what it buys and
which defect class it prevents, and **who has to do it** — you, the client, or a
decision neither can make alone. A row blocked on the client belongs in the plan with
the blocker named, not silently dropped and not silently attempted.

## Calibration

Known results, useful for checking the scorer still behaves after a change:

| System | Score | Verdict |
|---|---|---|
| A deliberately-broken fixture | 12 | Not agentic |
| `salesforce/design-system-react` | 45 | Partly agentic |
| `primer/react` | 43 | Partly agentic |
| A real client monorepo | 26 | Not agentic |
| `@rps/ui`, built TO this rubric | 93 | Agentic |

If those move without a rubric change, something regressed.

## Reporting

Every finding carries its evidence line:

```
L4  BLOCK  Closed variant unions
           src/components/Button.tsx  Button: variant?: string, size?: string  ← open
L6  BLOCK  no curation.json anywhere
           searched: repo root, package root, .peel/, docs/, agentDocs
```

A finding with no evidence is an opinion, and nobody can confirm an opinion.

If a measurement could not be taken — the package would not build, no stylesheet was
emitted — say the axis is **unscored** rather than inferring it. A fabricated number
becomes a client commitment.
