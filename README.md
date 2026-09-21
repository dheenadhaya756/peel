# Peel

Find out whether an agent can build from your design system — then make it so, and
prove it.

Connect a GitHub repo or drop in a zip. Peel measures the system against nine layers,
says plainly whether it is **Not agentic / Partly agentic / Agentic**, converts the
components you pick into a three-layer contract, renders every one of them before and
after, and ships the result as a zip, a pull request, or an MCP server your editor
connects to.

```bash
npm install
npm run dev          # http://localhost:3210
```

Click **Try it with the bundled sample** to see the whole path in about a minute.

---

## The one design decision everything follows from

**The model never writes component code.** Three tiers of trust, and nothing crosses
between them:

| Tier | Produced by | Guarantee |
|---|---|---|
| **Facts** | TypeScript compiler API over the AST | Measured. Props, variants, defaults, tokens, raw literals — with line numbers. |
| **Structure** | Deterministic templates | Same input, same output, byte for byte. |
| **Judgment** | Recorded archetype knowledge | Aliases, when-to-use, when-NOT-to-use. Unknown → `TODO(human)`, never a guess. |

Two invariants hold everywhere:

- **A degraded read never scores higher than a full one.** If types will not resolve,
  the affected checks report `unscored` — never `pass`. Measuring nothing and
  reporting it as clean is the most dangerous thing an audit tool can do.
- **Every finding carries its evidence.** `src/components/Button.tsx:21` beside the
  claim. A finding without one is an opinion, and you cannot check an opinion.

## The three layers

```
L3  KNOWLEDGE   AGENTS.md · llms.txt · RULES.md · curation.json · design.md
                aliases · when-NOT-to-use · near-miss map · looks-like index

L2  CONTRACT    guidance.yaml → manifest.json → MCP
                props · closed unions · defaults · composition · states · a11y

L1  CODE        Component.tsx · Component.css · example.tsx · stories
                zero raw values · every variant a closed union · tokens only
```

L3 is generated **from** L2, never written alongside it. That direction is what stops
the docs and the code drifting apart.

## What it measures

Nine layers into four weighted axes. Knowledge carries the most weight because it is
the only layer whose absence is *silent* — a missing export throws `TS2305` and the
agent recovers; a missing "what you'll reach for by mistake" map produces confident,
compiling, wrong code.

| Axis | Weight | The question |
|---|---|---|
| Admission | 25% | Can it be installed, themed and rendered in a clean sandbox? |
| Contract | 25% | Can the vocabulary be enumerated and constrained mechanically? |
| Knowledge | 30% | Given the vocabulary, will the model pick the right thing? |
| Gate | 20% | When it picks wrong, does anything catch it — and stay caught? |

Hard caps apply regardless of every other axis: no knowledge base caps at 45, no
emitted types at 55, no semantic token tier at 65, a mixed cascade at 75.

## Measured results

| System | Score | Verdict |
|---|---|---|
| `fixtures/aurora-ui` (bundled sample) | **12** | Not agentic |
| `primer/react` | **43** | Partly agentic |
| `aurora-ui` after converting Button + Card | **80** | Agentic |

The "after" number comes from re-running the same audit against the generated output.
It is never projected from what the conversion intended to fix.

## Headless

```bash
node scripts/peel.mjs <github-url | local-path | file.zip> \
  [--components Button,Card] [--out ./agent-ready] [--score-only] [--json]
```

Also installed as the `peel-mcp` skill.

## Connect a model

The chat pane works without one — intent matching falls back to a deterministic
matcher. Connecting a model turns it into natural language.

Click **Connect model** in the header. Any OpenAI-compatible gateway works; it
defaults to a local [OmniRoute](https://github.com/pitbaden/omniroute) at
`http://localhost:20128/v1`, and OpenRouter and OpenAI are one click away.

**Pick a concrete model, not a routing alias.** OmniRoute's `auto/*` profiles are
agentic coding routes that inject their own tools (`list_dir`, `read_file`); they
keep emitting calls for tools this app never declared and never resolve to an
answer. The picker filters them out. `agy/claude-sonnet-4-6` is the default.

The model only chooses **which tool to call**. The ten tools in
`lib/chat/tools.ts` are the entire surface, so it cannot write a file and cannot
invent a component — the guarantee holds whichever model is behind the key.

## Connect it to your editor

```json
{ "mcpServers": { "peel": { "command": "node", "args": ["<abs path>/mcp/server.mjs"] } } }
```

Eight tools. The two that matter are `get_component`, which closes the variant set,
and `when_not_to_use`, which decides between lookalikes — those are the two failures
that produce code that compiles and is wrong.

## Publishing to GitHub

The PR is **additive only**: it creates `agent-ready/` and modifies nothing that was
already there, so it can be read, reverted or closed without a trace.

Set your own token — never paste one into a chat:

```bash
# .env.local
GITHUB_TOKEN=github_pat_...   # Contents + Pull requests, write, on the target repo
```

## Layout

```
app/            Next.js app and API routes
lib/engine/     locate · extract · rubric      ← the measured half
lib/generate/   tokens · component · knowledge · enforcement · visualbook
lib/ingest/     GitHub zipball, upload, local copy
mcp/server.mjs  the MCP server your editor connects to
fixtures/       aurora-ui — a design system with deliberately planted defects
scripts/peel.mjs  headless CLI
```

`fixtures/aurora-ui` scores 12 on purpose. Its defects — `private: true`, open
`variant?: string`, 51 raw hex values, a mixed cascade, an unexported component, no
knowledge base — are the test. Do not "fix" them.
