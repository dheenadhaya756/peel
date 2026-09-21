/**
 * The four-layer agentic design system.
 *
 * This is the architecture described by Cristian Morales Achiardi and presented at
 * Into Design Systems, implemented literally rather than approximated:
 *
 *   1 TOKENIZATION   values and definitions — where building or auditing starts
 *   2 INTENT         component logic and metadata; the codebase is the source of truth
 *   3 INDEXING       mapping relationships; the infrastructure that makes reports cheap
 *   4 ORCHESTRATION  instructions, rules and skills
 *
 * The layer that is usually missing is INDEXING, and its absence is what makes
 * governance expensive: without a relationship map every audit has to re-read the
 * whole system, so nobody runs one. With it, a report is a query.
 */
import type { SystemFacts } from '../engine/types'
import type { GeneratedComponent } from './component'
import type { GeneratedToken } from './tokens'

/* ------------------------------------------------------- 1 · TOKENIZATION */

/**
 * Design Tokens Community Group format.
 *
 * The interchange standard, so the token layer is consumable by Style Dictionary,
 * Tokens Studio and Figma Variables rather than only by this output. A token layer
 * only one tool can read is a private format wearing a standard's name.
 */
export function buildDtcg(tokens: GeneratedToken[], systemName: string): string {
  const DTCG_TYPE: Record<string, string> = {
    color: 'color', space: 'dimension', radius: 'dimension',
    font: 'dimension', shadow: 'shadow',
  }

  const tree: Record<string, unknown> = {
    $description: `Token layer extracted from ${systemName}.`,
  }

  for (const t of tokens) {
    // Group by tier first, then by the token's own name segments.
    const path = [t.tier, ...t.name.split('-')]
    let node = tree as Record<string, any>
    for (const seg of path.slice(0, -1)) {
      node[seg] ??= {}
      node = node[seg]
    }
    const leaf = path.at(-1)!
    node[leaf] = {
      $type: DTCG_TYPE[t.type] ?? 'other',
      // An alias becomes a DTCG reference, which is what makes re-theming work.
      $value: t.aliasOf ? `{primitive.${t.aliasOf.split('-').join('.')}}` : t.value,
      $description: t.description,
      $extensions: { 'io.peel': { origin: t.origin, tier: t.tier } },
    }
  }
  return JSON.stringify(tree, null, 2)
}

export function buildStyleDictionaryConfig(): string {
  return `/**
 * Style Dictionary build. The DTCG file is the source; everything else is output.
 *
 *   npx style-dictionary build --config style-dictionary.config.js
 */
export default {
  source: ['tokens.dtcg.json'],
  platforms: {
    css: {
      transformGroup: 'css',
      buildPath: './',
      files: [{ destination: 'tokens.css', format: 'css/variables' }],
    },
    js: {
      transformGroup: 'js',
      buildPath: './',
      files: [{ destination: 'tokens.js', format: 'javascript/es6' }],
    },
  },
}
`
}

/* ------------------------------------------------------------- 2 · INTENT */

/**
 * The design contract: framework-agnostic JSON declaring what a component IS.
 *
 * Deliberately not TypeScript. A contract expressed only as types is unreadable to
 * anything that does not compile TypeScript — which includes Figma, most agents, and
 * every other platform the system will eventually target.
 */
export function buildContract(c: GeneratedComponent, systemName: string): string {
  const parts = Object.keys(c.guidance.variants)

  return JSON.stringify(
    {
      $schema: '../../contract.schema.json',
      name: c.guidance.name,
      system: systemName,
      status: c.guidance.status,
      purpose: c.guidance.purpose,

      // Anatomy: the named parts a consumer may address.
      anatomy: {
        root: `pl-${c.kebab}`,
        parts: (c.preview?.match(/class="([^"]*__[\w-]+)"/g) ?? [])
          .map((m) => m.replace(/class="|"/g, ''))
          .filter((v, i, a) => a.indexOf(v) === i),
      },

      // Axes: every variant dimension, closed.
      axes: Object.fromEntries(
        parts.map((axis) => [
          axis,
          {
            values: c.guidance.variants[axis],
            default: c.guidance.defaultVariants[axis],
            closed: true,
          },
        ]),
      ),

      states: c.guidance.states,

      accessibility: {
        role: c.guidance.a11y.role,
        label: c.guidance.a11y.requiredLabel,
        keyboard: c.guidance.a11y.keyboard,
      },

      // Token policy: which token families may style which channel.
      tokenPolicy: {
        allowed: c.guidance.tokens,
        tier: 'semantic',
        note: 'Components consume the semantic tier only. A primitive in a component is a defect.',
      },

      props: c.guidance.props,
      provenance: c.guidance.provenance,
    },
    null, 2,
  )
}

/* ----------------------------------------------------------- 3 · INDEXING */

/**
 * The relationship map.
 *
 * This is the layer that makes governance cheap. Every question an audit asks —
 * which components share an axis, which are confusable, which token is used where —
 * becomes a lookup instead of a re-read of the whole system.
 */
export function buildIndex(
  components: GeneratedComponent[],
  tokens: GeneratedToken[],
  facts: SystemFacts,
): string {
  const semantic = tokens.filter((t) => t.tier === 'semantic')

  // Which components consume which token — the reverse index a re-theme needs.
  const tokenUsage: Record<string, string[]> = {}
  for (const c of components) {
    for (const t of c.guidance.tokens) (tokenUsage[t] ??= []).push(c.guidance.name)
  }

  // Which components share a variant axis, and are therefore siblings.
  const axisIndex: Record<string, string[]> = {}
  for (const c of components) {
    for (const axis of Object.keys(c.guidance.variants)) (axisIndex[axis] ??= []).push(c.guidance.name)
  }

  // The lookalike graph: what an agent reaches for by mistake, and what to use.
  const lookalikes = components.flatMap((c) =>
    c.guidance.useInstead.map((u) => ({
      from: c.guidance.name,
      when: u.when,
      use: u.use,
    })),
  )

  // Alias → component. This is how a model searching from a screenshot finds things.
  const byAlias: Record<string, string> = {}
  for (const c of components) {
    for (const a of c.guidance.aliases) byAlias[a.toLowerCase()] = c.guidance.name
  }

  return JSON.stringify(
    {
      system: facts.packageName,
      generated: new Date().toISOString(),
      counts: {
        components: components.length,
        tokens: tokens.length,
        semanticTokens: semantic.length,
        axes: Object.keys(axisIndex).length,
        lookalikeRules: lookalikes.length,
        aliases: Object.keys(byAlias).length,
      },
      components: components.map((c) => ({
        name: c.guidance.name,
        contract: `../2-intent/components/${c.kebab}/${c.guidance.name}.contract.json`,
        axes: Object.keys(c.guidance.variants),
        tokens: c.guidance.tokens,
        aliases: c.guidance.aliases,
      })),
      byAlias,
      axisIndex,
      tokenUsage,
      lookalikes,
      /** Components found in source but deliberately not converted. */
      notConverted: facts.components
        .map((c) => c.name)
        .filter((n) => !components.some((c) => c.guidance.name === n)),
    },
    null, 2,
  )
}

/**
 * The prop canon: one name per concept, across the whole system.
 *
 * Synonym drift is the quiet killer — one component takes `label`, another `text`,
 * a third `title`, and an agent has to guess every time. Declaring the canonical
 * name makes the drift visible and gate-able.
 */
export function buildPropCanon(components: GeneratedComponent[]): string {
  const usage: Record<string, string[]> = {}
  for (const c of components) {
    for (const p of c.guidance.props) (usage[p.name] ??= []).push(c.guidance.name)
  }

  // Known synonym families. A prop in one of these should use the canonical name.
  const FAMILIES: Record<string, string[]> = {
    label: ['text', 'title', 'caption', 'name', 'heading'],
    variant: ['kind', 'appearance', 'type', 'style', 'theme'],
    size: ['scale', 'dimension'],
    disabled: ['isDisabled', 'inactive'],
    onChange: ['onUpdate', 'onInput'],
    children: ['content', 'body', 'slot'],
  }

  const conflicts: Array<{ canonical: string; alsoUsed: string[]; inComponents: string[] }> = []
  for (const [canonical, synonyms] of Object.entries(FAMILIES)) {
    const found = synonyms.filter((s) => usage[s])
    if (found.length) {
      conflicts.push({
        canonical,
        alsoUsed: found,
        inComponents: [...new Set(found.flatMap((s) => usage[s]))],
      })
    }
  }

  return JSON.stringify(
    {
      $description:
        'One name per concept. A prop appearing under a synonym is drift, and an agent has to guess which is right.',
      canonical: Object.fromEntries(Object.entries(FAMILIES).map(([k, v]) => [k, { synonyms: v }])),
      usage,
      conflicts,
      clean: conflicts.length === 0,
    },
    null, 2,
  )
}

/* ------------------------------------------------------ 4 · ORCHESTRATION */

/**
 * A skill file: a reusable instruction set an agent invokes for one task.
 *
 * Skills are the executable half of orchestration. Rules say what is true; skills
 * say how to do a specific job with the system in front of you.
 */
export function buildSkill(
  name: string,
  description: string,
  body: string,
): string {
  return `---
name: ${name}
description: ${description}
---

${body}
`
}

export function buildSkills(components: GeneratedComponent[], systemName: string): Record<string, string> {
  const names = components.map((c) => c.guidance.name).join(', ')

  return {
    'ds-choose/SKILL.md': buildSkill(
      'ds-choose',
      `Pick the right component from ${systemName} for something you are about to build. Use before writing any UI element.`,
      `# Choosing a component

1. Search \`3-indexing/index.json\` → \`byAlias\` for what you would call the thing.
   That map exists because a model searching from a screenshot uses the industry's
   vocabulary, not this system's.

2. Found a candidate? Read its \`useInstead\` in \`lookalikes\`. **This is the step that
   decides between lookalikes.** A static mockup cannot tell a Badge from a Chip;
   the condition can.

3. Read the contract at \`2-intent/components/<name>/<Name>.contract.json\`:
   - \`axes\` — every variant value allowed. A value not listed is a compile error.
   - \`tokenPolicy.allowed\` — the only tokens this component may consume.
   - \`accessibility\` — the role and label it requires.

4. Nothing matches? Check \`index.json\` → \`notConverted\`. If it is not there either,
   **say it is missing and stop.** Do not build a replacement silently — that is the
   failure this whole system exists to prevent.

Available: ${names}
`,
    ),

    'ds-build/SKILL.md': buildSkill(
      'ds-build',
      `Write a screen using ${systemName} without drifting from it.`,
      `# Building with this system

Before you write anything, read \`4-orchestration/RULES.md\` whole. It is short on
purpose.

While writing:
- Every colour, space and radius is \`var(--token)\` from \`1-tokenization/\`.
  Semantic tier only.
- Every variant value comes from the contract's \`axes\`. Never improvise one.
- \`className\` is layout and position. Never appearance.

When you are done, run the gate:

    node 4-orchestration/gates/check-conformance.mjs <your-src>

Every finding names its own fix. Apply the fix rather than working around it — a
rejection worked around comes back on the next screen.
`,
    ),

    'ds-audit/SKILL.md': buildSkill(
      'ds-audit',
      `Report on the health of ${systemName} — drift, coverage, token usage — without re-reading the codebase.`,
      `# Auditing the system

The indexing layer exists so this costs a query rather than a crawl.

**Coverage** — \`3-indexing/index.json\` → \`notConverted\` lists what is in source but
has no contract.

**Prop drift** — \`3-indexing/prop-canon.json\` → \`conflicts\`. Non-empty means the same
concept is spelled differently in different components, and an agent has to guess.

**Token reach** — \`tokenUsage\` maps each token to its consumers. A token with one
consumer is probably component-specific and mis-tiered; a token with none is dead.

**Lookalike coverage** — a component with no \`useInstead\` entry cannot be chosen
against. Count those; they are the highest-value gap in the system.
`,
    ),
  }
}
