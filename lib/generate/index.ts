/**
 * The conversion. Three layers, generated in dependency order.
 *
 *   L1 CODE      ──generated from──▶ measured facts
 *   L2 CONTRACT  ──assembled from──▶ L1 + archetype judgement
 *   L3 KNOWLEDGE ──generated from──▶ L2, never hand-written
 *
 * The direction matters: because L3 is generated from L2 rather than written
 * alongside it, the two cannot drift. That is the whole anti-drift design.
 */
import YAML from 'yaml'
import type { SystemFacts, Scorecard } from '../engine/types'
import { deriveTokens, tokensToCss, type GeneratedToken } from './tokens'
import { generateComponent, type GeneratedComponent } from './component'
import { archetypeFor } from './knowledge'
import { enrichAll } from './enrich'
import { renderComponent, type RenderedComponent } from './style'
import {
  buildCi, buildConformanceChecker, buildDocsCheck, buildEslintConfig, buildStories,
} from './enforcement'

export interface ConversionResult {
  files: Record<string, string>
  components: GeneratedComponent[]
  tokens: GeneratedToken[]
  todos: string[]
  stats: {
    componentCount: number
    tokenCount: number
    semanticCount: number
    closedUnions: number
    rawValuesRemoved: number
    todoCount: number
  }
}

/** Called per phase so the caller can stream what is happening. */
export type OnPhase = (id: string, label: string, detail?: string) => void

const kebabOf = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

export async function convert(
  facts: SystemFacts,
  before: Scorecard,
  selected: string[],
  onPhase: OnPhase = () => {},
): Promise<ConversionResult> {
  const files: Record<string, string> = {}

  const tokens = deriveTokens(facts)
  const semanticCount = tokens.filter((t) => t.tier === 'semantic').length
  onPhase(
    'tokens',
    'Derive token layer',
    `${tokens.length - semanticCount} primitives → ${semanticCount} semantic, named from the variant each value already lives in`,
  )

  const picked = facts.components.filter((c) => selected.includes(c.name))

  // Judgment first, so each component is generated WITH it rather than patched after.
  // Measured JSDoc wins, then recorded archetypes, then the model for what is left.
  const judgments = await enrichAll(picked, facts.packageName)
  const generatedCount = [...judgments.values()].filter((j) => j.generated.length).length
  onPhase(
    'judgment',
    'Fill the judgment fields',
    generatedCount
      ? `${picked.length - generatedCount} answered from source or archetype · ${generatedCount} filled by the model`
      : `all ${picked.length} answered from source documentation or recorded archetypes`,
  )

  // The visual layer: what the component should LOOK like, which no compiler can
  // derive. Validated against the token set before it is accepted.
  const rendered = new Map<string, RenderedComponent>()
  for (const f of picked) {
    const r = await renderComponent(f, `pl-${kebabOf(f.name)}`, judgments.get(f.name)?.purpose ?? f.name, tokens)
    rendered.set(f.name, r)
  }
  const rejects = [...rendered.values()].filter((r) => r.rejected).length
  onPhase(
    'render',
    'Render the visual layer',
    rejects
      ? `${picked.length - rejects} rendered from tokens · ${rejects} rejected for breaking the token rule, plain fallback used`
      : `${picked.length} rendered from the semantic tokens, validated to contain no raw values`,
  )

  const components = picked.map((f) => {
    const g = generateComponent(f, tokens, judgments.get(f.name), rendered.get(f.name))
    const axes = Object.keys(g.guidance.variants)
    onPhase(
      `component:${g.kebab}`,
      `L1 · ${g.name}`,
      `${f.rawValues.length} raw values removed · ${axes.length} axes closed (${axes.join(', ') || 'none'}) · ${g.consumes.length} tokens consumed`,
    )
    return g
  })
  const todos = components.flatMap((c) => c.todos)

  /* -------------------------------------------------------------- tokens */

  files['tokens/tokens.css'] = tokensToCss(tokens)
  files['tokens/tokens.json'] = JSON.stringify(
    {
      $schema: './tokens.schema.json',
      tiers: ['primitive', 'semantic'],
      generatedFrom: facts.packageName,
      tokens: tokens.map((t) => ({
        name: t.name, tier: t.tier, type: t.type, value: t.value,
        aliasOf: t.aliasOf, description: t.description, origin: t.origin,
      })),
    },
    null, 2,
  )

  /* ---------------------------------------------------------- components */

  for (const c of components) {
    for (const [name, body] of Object.entries(c.files)) {
      files[`components/${c.kebab}/${name}`] = body
    }
    files[`components/${c.kebab}/guidance.yaml`] = YAML.stringify(c.guidance, { lineWidth: 100 })
    files[`components/${c.kebab}/${c.name}.stories.tsx`] = buildStories(c)
  }

  files['components/index.ts'] =
    components.map((c) => `export { ${c.name} } from './${c.kebab}/${c.name}'\nexport type { ${c.name}Props } from './${c.kebab}/${c.name}'`).join('\n') + '\n'

  files['styles.css'] =
    `/* Generated. Import this once at your app root. */\n@import './tokens/tokens.css';\n` +
    components.map((c) => `@import './components/${c.kebab}/${c.name}.css';`).join('\n') + '\n'

  onPhase(
    'contract',
    'L2 · Contract',
    `${components.length} guidance.yaml written · manifest assembled by reading them, never hand-written`,
  )

  /* ------------------------------------------------- manifest — assembled */

  files['manifest.json'] = JSON.stringify(
    {
      system: facts.packageName,
      generated: new Date().toISOString(),
      // Assembled BY READING the guidance files, never hand-written — a
      // hand-maintained index drifts from what it describes within one release.
      components: components.map((c) => ({
        name: c.guidance.name,
        aliases: c.guidance.aliases,
        purpose: c.guidance.purpose,
        useWhen: c.guidance.useWhen,
        useInstead: c.guidance.useInstead,
        props: c.guidance.props,
        variants: c.guidance.variants,
        defaultVariants: c.guidance.defaultVariants,
        states: c.guidance.states,
        a11y: c.guidance.a11y,
        tokens: c.guidance.tokens,
        import: `import { ${c.name} } from '${facts.packageName}-agent-ready'`,
      })),
      tokens: tokens.map((t) => ({ name: t.name, tier: t.tier, value: t.value })),
    },
    null, 2,
  )

  onPhase('knowledge', 'L3 · Knowledge', 'AGENTS.md, llms.txt, RULES.md, curation.json, design.md — generated FROM L2 so they cannot drift')

  /* ------------------------------------------------------ L3 knowledge base */

  files['llms.txt'] = buildLlmsTxt(components, facts)
  files['AGENTS.md'] = buildAgents(components, facts, tokens)
  files['RULES.md'] = buildRules(facts, tokens)
  files['curation.json'] = buildCuration(components, facts)
  files['design.md'] = buildDesignMd(facts, tokens, components)

  onPhase('enforcement', 'Enforcement', 'conformance checker, docs-freshness gate, CI workflow, one story per variant and state')

  /* --------------------------------------------------- enforcement, so rules bite */

  files['scripts/check-conformance.mjs'] = buildConformanceChecker(tokens, components)
  files['scripts/check-docs.mjs'] = buildDocsCheck()
  files['.github/workflows/design-system.yml'] = buildCi(facts.packageName)
  files['eslint.config.js'] = buildEslintConfig()

  files['package.json'] = JSON.stringify(
    {
      name: `${facts.packageName}-agent-ready`,
      version: '1.0.0',
      type: 'module',
      description: `${facts.packageName}, converted to an agent-readable contract.`,
      types: './components/index.ts',
      exports: {
        '.': './components/index.ts',
        './styles.css': './styles.css',
        './manifest.json': './manifest.json',
        './.peel/*': './*',
      },
      files: ['components', 'tokens', 'styles.css', 'manifest.json', 'AGENTS.md', 'llms.txt', 'RULES.md', 'curation.json', 'design.md'],
      // Discoverable from inside node_modules — this is how a tool finds the docs.
      agentDocs: {
        rules: './RULES.md',
        guide: './AGENTS.md',
        index: './llms.txt',
        components: './manifest.json',
        curation: './curation.json',
        design: './design.md',
      },
      scripts: {
        'check:conformance': 'node scripts/check-conformance.mjs src',
        'docs:check': 'node scripts/check-docs.mjs',
        typecheck: 'tsc --noEmit',
      },
      peerDependencies: { react: '>=18', 'react-dom': '>=18' },
    },
    null, 2,
  )

  const closedUnions = components.reduce(
    (n, c) => n + Object.keys(c.guidance.variants).length, 0,
  )
  const rawValuesRemoved = picked.reduce((n, c) => n + c.rawValues.length, 0)

  return {
    files,
    components,
    tokens,
    todos,
    stats: {
      componentCount: components.length,
      tokenCount: tokens.length,
      semanticCount: tokens.filter((t) => t.tier === 'semantic').length,
      closedUnions,
      rawValuesRemoved,
      todoCount: todos.length,
    },
  }
}

/* ------------------------------------------------------------------ builders */

function buildLlmsTxt(components: GeneratedComponent[], facts: SystemFacts): string {
  return `# ${facts.packageName} — agent index

Read RULES.md whole before writing anything. Look every element up here first.

## Components

${components.map((c) => `${c.name} — ${c.guidance.purpose} Also: ${c.guidance.aliases.slice(0, 4).join(', ')}. [web]`).join('\n')}

## Looks-like index

Search this when working from a mockup or screenshot — it maps what a thing LOOKS
like to what it is CALLED here, which is how a model actually searches.

${components.flatMap((c) => c.guidance.aliases.slice(0, 5).map((a) => `${a} → ${c.name}`)).join('\n')}

## Not in this system

Anything not listed above does not exist here. Do not import it, and do not build a
replacement silently — say that it is missing and stop.
`
}

function buildAgents(components: GeneratedComponent[], facts: SystemFacts, tokens: GeneratedToken[]): string {
  const semantic = tokens.filter((t) => t.tier === 'semantic')
  return `# ${facts.packageName} — agent guide

Model-neutral. Plain Markdown, no vendor conventions.

## Section map

| Section | What is in it |
|---|---|
| Rules | The five rules, each mechanically checkable |
| Decision trees | How to choose between lookalikes |
| Components | Every component, its props and its closed variant sets |
| Tokens | The only values you may use |

Use anchored greps against this file rather than reading it whole.

## What this system is

${facts.packageName}, converted to an agent-readable contract. ${components.length} component(s),
${semantic.length} semantic tokens. Every variant prop is a closed union enforced by the
type system; every value is a token.

## Rules

1. **Look it up before you write it.** Check \`llms.txt\` before writing any UI
   element. Never hand-roll something this system provides.
2. **Never write a raw value.** No hex, no px, no arbitrary utility. Use a semantic
   token from \`tokens/tokens.json\`. The primitive tier is not for you.
3. **Never invent a prop or a variant value.** The unions are closed — read them.
4. **\`className\` is for layout and position only.** Never appearance. A class that
   restyles a component either silently deletes the variant's own styling or does
   nothing at all, and you cannot tell which from the call site.
5. **When nothing fits, stop and say so.** Do not build a new component silently.

Each rule maps to something countable. Rule 2 is \`grep -nE '#[0-9a-fA-F]{3,8}|[0-9]+px'\`
over what you wrote, and the answer must be zero.

## Decision trees

${components.map((c) => `### ${c.name}\n\n${c.guidance.useInstead.map((u) => `- ${u.when} → use **${u.use}**`).join('\n')}`).join('\n\n')}

## Components

${components.map((c) => `### ${c.name}

${c.guidance.purpose}

\`\`\`tsx
${c.guidance.props.filter((p) => Object.keys(c.guidance.variants).includes(p.name))
  .map((p) => `${p.name}?: ${p.type}   // default: ${p.default ?? '—'}`).join('\n') || '// no variant axes'}
\`\`\`

Use when: ${c.guidance.useWhen.join(' · ')}
`).join('\n')}

## Tokens

Semantic tier only. These are the only values you may write.

${semantic.slice(0, 40).map((t) => `- \`--${t.name}\` — ${t.description}`).join('\n')}
`
}

function buildRules(facts: SystemFacts, tokens: GeneratedToken[]): string {
  // Every rule below comes from an actual audit finding on THIS system. A generic
  // rule that is not true here teaches the agent to distrust the file, and one
  // distrusted line costs more than the whole file buys.
  const mixed = facts.layeredSelectors > 0 && facts.unlayeredSelectors > 0
  return `# Rules — read this whole file first

Fewer than 60 lines on purpose. Past that this becomes a second guide and stops
being read.

## Always

- Look the element up in \`llms.txt\` before writing it.
- Use a semantic token for every colour, space and radius.
- Read the closed union before passing a variant value.
- Say so and stop when nothing in the system fits.

## Never

- **Never write a hex or a px value.** ${facts.rawValueTotal} of them were removed from this
  system during conversion; putting them back re-opens exactly the gap that was closed.
- **Never restyle appearance through \`className\`.** ${mixed
    ? 'This system had a mixed cascade before conversion — some families layered, some not — so an override either silently replaced the variant styling or did nothing at all. Generated components are now uniformly layered, and appearance overrides remain forbidden.'
    : 'Generated component CSS is layered, so your class wins and silently DELETES the variant\'s own styling.'}
- **Never invent a variant value.** Every axis is a closed union. \`variant="cta"\`
  against a system with no such variant is a compile error now — it was not before.
- **Never import a name that is not in \`llms.txt\`.** It does not exist.

## When unsure

1. Grep \`llms.txt\` for the shape you are trying to build.
2. Check the component's \`useInstead\` list in \`manifest.json\` — the lookalike you
   want is usually named there.
3. If still unsure, stop and ask. An unanswered question costs minutes; a wrong
   component that compiles costs a review cycle.

## If an override appears to do nothing

Do not escalate it. Do not add \`!important\`, and do not add a more specific
selector. If the first attempt was inert the fourth will be too. The component owns
its appearance — change the variant, or open a request for a new one.

## Negative space

${Object.entries(facts.knowledgeFiles).filter(([, v]) => !v).length > 0
    ? 'This system deliberately does not ship every component you may expect. Check `curation.json` → `genuinelyAbsent` before assuming something is missing by accident.'
    : 'See `curation.json` for what is deliberately absent.'}
`
}

function buildCuration(components: GeneratedComponent[], facts: SystemFacts): string {
  const present = new Set(components.map((c) => c.name))
  const converted = components.map((c) => c.name)
  const notConverted = facts.components.map((c) => c.name).filter((n) => !present.has(n))

  const nearMiss = components.flatMap((c) => {
    const a = archetypeFor(c.name)
    return (a?.archetype.nearMiss ?? []).map((m) => ({
      reachesFor: m.reachesFor,
      use: c.name,
      because: m.actually,
    }))
  })

  return JSON.stringify(
    {
      system: facts.packageName,
      // The dangerous case is not an invented name — TS2305 catches that free.
      // It is a REAL export used for the wrong job, which compiles and is wrong.
      nearMiss,
      doNotUse: [
        {
          pattern: 'raw hex or px in generated screens',
          instead: 'a semantic token from tokens/tokens.json',
          why: 'the value drifts from the system the moment either changes',
        },
        {
          pattern: 'appearance utilities on a generated component',
          instead: 'a variant value, or a request for a new variant',
          why: 'the component owns its appearance; an override either deletes the variant styling or is inert',
        },
      ],
      genuinelyAbsent: notConverted.map((n) => ({
        name: n,
        status: 'present in source, not yet converted',
        note: 'TODO(human): confirm whether this should be converted or is deliberately excluded.',
      })),
      layoutSlots: ['className'],
      converted,
    },
    null, 2,
  )
}

function buildDesignMd(facts: SystemFacts, tokens: GeneratedToken[], components: GeneratedComponent[]): string {
  return `# design.md — the system contract

The single source of truth for this design system, readable by a person and by a
model. Brand composition rules, tokens and decision logic live here; the per-platform
specifics live in the skill files that pair with it.

## Tokens

Two tiers, and the direction is one-way.

- **Primitive** (${tokens.filter((t) => t.tier === 'primitive').length}) — raw palette values. Referenced by semantic tokens and by
  nothing else. A component that reaches past the semantic tier to a primitive is a bug.
- **Semantic** (${tokens.filter((t) => t.tier === 'semantic').length}) — names a purpose, not an appearance. This is the only tier a
  component or a generated screen may consume.

## Composition rules

${components.map((c) => {
  const comp = c.guidance.composition as Record<string, unknown>
  const parts = [
    comp.allowedParents ? `may sit inside ${(comp.allowedParents as string[]).join(', ')}` : null,
    comp.allowedChildren ? `may contain ${(comp.allowedChildren as string[]).join(', ')}` : null,
    comp.maxNestingDepth != null ? `max nesting depth ${comp.maxNestingDepth}` : null,
  ].filter(Boolean)
  return `- **${c.name}** — ${parts.length ? parts.join('; ') : 'no composition constraints recorded'}`
}).join('\n')}

## Decision logic

When two components could both render the same mockup, this is how to choose.

${components.map((c) => `**${c.name}** — ${c.guidance.useInstead.map((u) => `if ${u.when}, use ${u.use}`).join('; ')}.`).join('\n\n')}

## Provenance

Converted from \`${facts.packageName}\`. ${facts.components.length} components found,
${components.length} converted. Every token and every prop in this document traces
back to a line in the source — see \`origin\` in \`tokens/tokens.json\` and
\`provenance\` in each \`guidance.yaml\`.
`
}
