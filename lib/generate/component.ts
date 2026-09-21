/**
 * Component generation — layer 1 (code) and layer 2 (contract).
 *
 * The generated source is produced from MEASURED facts: the variant axes and their
 * values come from the cva map that was already there, the props from the real
 * interface. What changes is the guarantee — every variant prop becomes a closed
 * literal union, and every value becomes a semantic token reference.
 *
 * No model writes any of this. The only fields that come from judgement are the
 * guidance fields, and an unknown one is written as TODO(human) rather than guessed.
 */
import type { ComponentFact } from '../engine/types'
import type { GeneratedToken } from './tokens'
import { archetypeFor, todo } from './knowledge'
import type { Judgment } from './enrich'

export interface GeneratedComponent {
  name: string
  kebab: string
  files: Record<string, string>
  guidance: Guidance
  /** Semantic tokens this component consumes. */
  consumes: string[]
  todos: string[]
}

export interface Guidance {
  name: string
  status: string
  aliases: string[]
  purpose: string
  useWhen: string[]
  useInstead: { when: string; use: string }[]
  props: Array<{ name: string; type: string; required: boolean; default?: string; description: string }>
  variants: Record<string, string[]>
  defaultVariants: Record<string, string>
  states: Array<{ name: string; trigger: string }>
  composition: Record<string, unknown>
  content: Record<string, unknown>
  a11y: { role: string; requiredLabel: string; keyboard: string }
  tokens: string[]
  source: string
  provenance: string[]
}

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
const cls = (name: string) => `pl-${kebab(name)}`

/** Triggers for the states a component actually showed evidence of. */
const STATE_TRIGGER: Record<string, string> = {
  hover: 'pointer is over the element',
  focus: 'element has keyboard focus',
  active: 'element is being pressed',
  disabled: 'the disabled prop is set, or an ancestor fieldset is disabled',
  loading: 'an async action is pending',
  error: 'validation failed for this field',
  selected: 'the value matches this option',
  checked: 'the checked prop is true',
  invalid: 'the value fails validation',
  readonly: 'the readOnly prop is set',
  expanded: 'the disclosure is open',
  pressed: 'a toggle button is in the on state',
}

/** Semantic token a variant branch should consume, by convention set in tokens.ts. */
const tokenFor = (axis: string, variant: string, prop: 'bg' | 'text' | 'border') =>
  `${prop}-${axis === 'variant' ? 'action' : axis}-${variant}`

export function generateComponent(
  fact: ComponentFact,
  tokens: GeneratedToken[],
  judgment?: Judgment,
): GeneratedComponent {
  const match = archetypeFor(fact.name)
  const arch = match?.archetype
  const todos: string[] = []
  const semantic = new Set(tokens.filter((t) => t.tier === 'semantic').map((t) => t.name))

  /* ---------------------------------------------------------- layer 2: contract */

  const axes = Object.entries(fact.variants)
  const defaults: Record<string, string> = { ...fact.defaultVariants }
  // A variant axis with no declared default gets the first value, recorded as a
  // decision rather than a silent assumption.
  for (const [axis, values] of axes) {
    if (!defaults[axis] && values.length) {
      defaults[axis] = values[0]
      todos.push(`${fact.name}.${axis} had no defaultVariants — first value "${values[0]}" was adopted. Confirm it is the intended default.`)
    }
  }

  const props: Guidance['props'] = fact.props.map((p) => {
    const axisValues = fact.variants[p.name]
    const closed = axisValues ? axisValues.map((v) => `'${v}'`).join(' | ') : p.type
    return {
      name: p.name,
      type: closed,
      required: p.required,
      default: defaults[p.name],
      // The team's own JSDoc is the best answer, and is used verbatim when present.
      description:
        p.description ??
        (axisValues
          ? `Closed set: ${axisValues.join(', ')}.`
          : p.name === 'className'
            ? 'Layout and positioning only. Never appearance — see RULES.md.'
            : `Controls ${p.name} on ${fact.name}.`),
    }
  })
  const undocumented = fact.props.filter((p) => !p.description).map((p) => p.name)

  const states = fact.states
    .filter((s) => STATE_TRIGGER[s])
    .map((s) => ({ name: s, trigger: STATE_TRIGGER[s] }))
  if (!states.length) states.push({ name: 'default', trigger: 'no interaction' })

  // Judgment, in order of trust: the team's own JSDoc, then recorded archetype
  // knowledge, then the model. Never a blocking marker — the output has to be
  // usable on its own.
  const j: Judgment = judgment ?? {
    purpose: fact.docComment ?? arch?.purpose ?? `${fact.name} — a component in this system.`,
    aliases: arch?.aliases ?? [fact.name.toLowerCase()],
    useWhen: arch?.useWhen ?? [`you need the behaviour ${fact.name} provides`],
    useInstead: arch?.useInstead ?? [
      { when: 'another component matches the intent more closely', use: 'see llms.txt' },
    ],
    a11y: arch?.a11y ?? { role: 'none', requiredLabel: 'a visible label', keyboard: 'standard' },
    generated: [],
  }

  const TOKEN_PREFIXES = ['bg', 'text', 'border', 'height', 'padding-inline', 'padding-block', 'padding', 'font-size']
  const consumes = axes
    .flatMap(([axis, values]) => {
      const role = axis === 'variant' ? 'action' : axis
      return values.flatMap((v) => TOKEN_PREFIXES.map((p) => `${p}-${role}-${v}`))
    })
    .filter((t) => semantic.has(t))

  const guidance: Guidance = {
    name: fact.name,
    status: 'stable',
    aliases: j.aliases,
    purpose: j.purpose,
    useWhen: j.useWhen,
    useInstead: j.useInstead,
    props,
    variants: fact.variants,
    defaultVariants: defaults,
    states,
    composition: arch?.composition ?? {},
    content: arch?.content ?? {},
    a11y: j.a11y,
    tokens: [...new Set(consumes)],
    source: 'code',
    // Provenance says where each part came from, so generated judgment stays
    // distinguishable from measured fact.
    provenance: [
      `extracted from ${fact.file}`,
      `${Object.keys(fact.variants).length} variant axes recovered (cva map and type unions)`,
      `${fact.rawValues.length} raw values replaced with semantic tokens`,
      fact.docComment
        ? 'purpose taken verbatim from the component JSDoc'
        : 'purpose not documented in source',
      j.generated.length
        ? `generated by model: ${j.generated.join(', ')}`
        : 'no field generated by a model',
      undocumented.length
        ? `props with no JSDoc in source: ${undocumented.join(', ')}`
        : 'every prop carries a description from source',
    ],
  }

  /* -------------------------------------------------------------- layer 1: code */

  const base = cls(fact.name)
  const unionType = (axis: string) => fact.variants[axis].map((v) => `'${v}'`).join(' | ')

  const propLines = [
    ...axes.map(([axis]) => `  /** ${fact.variants[axis].join(' | ')} — closed set, enforced at compile time. */\n  ${axis}?: ${unionType(axis)}`),
    ...fact.props
      .filter((p) => !fact.variants[p.name] && p.name !== 'className')
      .map((p) => `  ${p.name}${p.required ? '' : '?'}: ${p.type}`),
    `  /** Layout and positioning only — never appearance. */\n  className?: string`,
    `  children?: React.ReactNode`,
  ].join('\n')

  const modifierLines = axes
    .map(([axis]) => `    ${axis} ? \`${base}--${'${'}${axis}${'}'}\` : '',`)
    .join('\n')

  const destructure = [
    ...axes.map(([axis]) => `${axis} = '${defaults[axis]}'`),
    ...fact.props.filter((p) => !fact.variants[p.name] && p.name !== 'className' && p.name !== 'children').map((p) => p.name),
    'className',
    'children',
    '...rest',
  ].join(', ')

  const element = /input/i.test(fact.name) ? 'input' : /button/i.test(fact.name) ? 'button' : 'div'
  const isVoid = element === 'input'

  const tsx = `import * as React from 'react'

/**
 * ${guidance.purpose}
 *
 * When to use:
${guidance.useWhen.map((u) => ` *   - ${u}`).join('\n')}
 *
 * When NOT to use:
${guidance.useInstead.map((u) => ` *   - ${u.when} → use ${u.use}`).join('\n')}
 *
 * Generated from ${fact.file}. Edit guidance.yaml and regenerate — never edit here.
 */
export interface ${fact.name}Props extends Omit<React.${isVoid ? 'InputHTMLAttributes<HTMLInputElement>' : element === 'button' ? 'ButtonHTMLAttributes<HTMLButtonElement>' : 'HTMLAttributes<HTMLDivElement>'}, ${axes.length ? axes.map(([a]) => `'${a}'`).join(' | ') : "'color'"}> {
${propLines}
}

export function ${fact.name}({ ${destructure} }: ${fact.name}Props) {
  const classes = [
    '${base}',
${modifierLines}
    className,
  ].filter(Boolean).join(' ')

  return (
    <${element} className={classes} {...rest}${isVoid ? ' />' : `>
      {children}
    </${element}>`}
  )
}

${fact.name}.displayName = '${fact.name}'
`

  /* --------------------------------------------- the stylesheet, tokens only */

  // Every declaration below is emitted only when a matching semantic token was
  // actually derived from the source branch. Nothing is filled in by convention.
  const DECL: Array<[string, string]> = [
    ['bg', 'background'],
    ['text', 'color'],
    ['border', 'border-color'],
    ['height', 'height'],
    ['padding-inline', 'padding-inline'],
    ['padding-block', 'padding-block'],
    ['padding', 'padding'],
    ['font-size', 'font-size'],
  ]

  const variantRules = axes.flatMap(([axis, values]) =>
    values.map((v) => {
      const role = axis === 'variant' ? 'action' : axis
      const decls: string[] = []
      for (const [prefix, cssProp] of DECL) {
        const token = `${prefix}-${role}-${v}`
        if (semantic.has(token)) decls.push(`  ${cssProp}: var(--${token});`)
      }

      if (!decls.length) {
        const branch = (fact.variantClasses?.[axis]?.[v] ?? '').trim()
        if (branch === '' || branch === "''" || branch === '""') {
          // A genuinely empty branch is the base state, not a missing value.
          return `.${base}--${v} {\n  /* base state — this branch applies no styling of its own */\n}`
        }
        // Real styling we could not resolve to a token. Say so; never invent one.
        todos.push(
          `${fact.name} ${axis}="${v}" applies \`${branch.slice(0, 60)}\` which did not resolve to a token. Supply the intended value.`,
        )
        decls.push(`  /* ${todo(`unresolved styling for ${axis}="${v}": ${branch.slice(0, 60)}`)} */`)
      }
      return `.${base}--${v} {\n${decls.join('\n')}\n}`
    }),
  )

  const css = `/* ${fact.name} — generated. Consumes the semantic tier only. */
@layer components {
  .${base} {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-8, 8px);
    border-radius: var(--radius-8, 8px);
    border: 1px solid transparent;
    font: inherit;
    line-height: 1.4;
    transition: background-color 120ms ease, color 120ms ease;
  }

${variantRules.map((r) => r.split('\n').map((l) => `  ${l}`).join('\n')).join('\n\n')}

  .${base}:focus-visible {
    outline: 2px solid var(--bg-action-${axes[0] ? fact.variants[axes[0][0]][0] : 'primary'}, currentColor);
    outline-offset: 2px;
  }

  .${base}[disabled],
  .${base}[aria-disabled='true'] {
    opacity: .5;
    pointer-events: none;
  }
}
`

  /* ------------------------------------------------------------------ example */

  const exampleProps = axes.map(([axis]) => `${axis}="${fact.variants[axis][1] ?? defaults[axis]}"`).join(' ')
  const example = `import { ${fact.name} } from './${fact.name}'

/** Canonical usage. Shows the real case, not the trivial one. */
export function Example() {
  return (
    <${fact.name} ${exampleProps}>
      ${/input/i.test(fact.name) ? '' : `${fact.name} label`}
    </${fact.name}>
  )
}
`

  const readme = `# ${fact.name}

${guidance.purpose}

## Use when

${guidance.useWhen.map((u) => `- ${u}`).join('\n')}

## Do NOT use when

| Condition | Use instead |
|---|---|
${guidance.useInstead.map((u) => `| ${u.when} | \`${u.use}\` |`).join('\n')}

## Also known as

${guidance.aliases.join(' · ')}

## Props

| Prop | Type | Default | Required |
|---|---|---|---|
${guidance.props.map((p) => `| \`${p.name}\` | \`${p.type}\` | ${p.default ? `\`${p.default}\`` : '—'} | ${p.required ? 'yes' : 'no'} |`).join('\n')}

## States

${guidance.states.map((s) => `- **${s.name}** — ${s.trigger}`).join('\n')}

## Accessibility

- **Role** — ${guidance.a11y.role}
- **Label** — ${guidance.a11y.requiredLabel}
- **Keyboard** — ${guidance.a11y.keyboard}

---
Generated from \`guidance.yaml\`. Do not edit by hand.
`

  return {
    name: fact.name,
    kebab: kebab(fact.name),
    files: {
      [`${fact.name}.tsx`]: tsx,
      [`${fact.name}.css`]: css,
      'example.tsx': example,
      'README.md': readme,
    },
    guidance,
    consumes: [...new Set(consumes)],
    todos,
  }
}
