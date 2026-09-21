/**
 * The chat tool surface.
 *
 * This is the whole safety model. A model may choose which of these to call and with
 * what arguments — it may not do anything else. Each executor reads or regenerates
 * through the engine, so there is no path from a chat message to an arbitrary file
 * write, and therefore no way for the assistant to invent a component, a variant or
 * a token that the engine did not measure.
 *
 * Adding a tool here widens what the assistant can do. Nothing else does.
 */
import fs from 'node:fs'
import path from 'node:path'
import { getSystem, outputDir, type SystemRow } from '../store'

export interface ToolContext {
  row: SystemRow
  facts: Record<string, any> | null
  before: Record<string, any> | null
  after: Record<string, any> | null
  manifest: Record<string, any> | null
}

export interface ToolResult {
  text: string
  data?: unknown
}

export interface ToolDef {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, { type: string; description: string; enum?: string[] }>
    required?: string[]
  }
  run: (args: Record<string, any>, ctx: ToolContext) => ToolResult
}

export function buildContext(systemId: string): ToolContext | null {
  const row = getSystem(systemId)
  if (!row) return null
  const manifestPath = path.join(outputDir(row.id), 'manifest.json')
  return {
    row,
    facts: row.facts_json ? JSON.parse(row.facts_json) : null,
    before: row.before_json ? JSON.parse(row.before_json) : null,
    after: row.after_json ? JSON.parse(row.after_json) : null,
    manifest: fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null,
  }
}

const needsConversion = (ctx: ToolContext): ToolResult | null =>
  ctx.manifest
    ? null
    : { text: `"${ctx.row.name}" has been ingested but not converted, so there is no contract to read yet. Convert it from the Report tab first.` }

const readOutput = (ctx: ToolContext, rel: string) => {
  const f = path.join(outputDir(ctx.row.id), rel)
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null
}

/* ------------------------------------------------------------------- the tools */

export const TOOLS: ToolDef[] = [
  {
    name: 'get_score',
    description:
      'The agent-readiness score and verdict for the current system, by axis. Use for any question about how good, how bad, how ready, or whether it is agentic.',
    parameters: { type: 'object', properties: {} },
    run: (_a, ctx) => {
      const { before, after } = ctx
      if (!before) return { text: 'This system has not been audited yet.' }
      if (after) {
        return {
          text: `**${before.composite} → ${after.composite}.** ${before.verdict.label} → ${after.verdict.label}.\n\n${after.verdict.meaning}\n\nBoth numbers are measured — the second comes from re-auditing the generated output, not from adding up what the conversion intended to fix.\n\n${after.axes.map((a: any, i: number) => `- ${a.label}: ${before.axes[i].value ?? '—'} → ${a.value ?? '—'}`).join('\n')}`,
          data: { before, after },
        }
      }
      return {
        text: `**${before.composite}/100 — ${before.verdict.label}.** ${before.verdict.headline}\n\n${before.verdict.meaning}\n\n${before.counts.blockers} blocker(s), ${before.counts.fail} failing check(s), ${before.counts.unscored} unscored.${before.appliedCap ? `\n\nCapped at ${before.appliedCap.cap}: ${before.appliedCap.reason}. Uncapped it would be ${before.uncapped}.` : ''}\n\n${before.axes.map((a: any) => `- ${a.label}: ${a.value ?? '—'}`).join('\n')}`,
        data: before,
      }
    },
  },

  {
    name: 'list_findings',
    description:
      'The failing checks on the current system, each with the file and line that proves it. Use for "what is wrong", "what is broken", "why did it score that", "what are the problems".',
    parameters: {
      type: 'object',
      properties: {
        severity: { type: 'string', description: 'Filter to one severity', enum: ['BLOCK', 'GAP', 'WATCH'] },
      },
    },
    run: (args, ctx) => {
      if (!ctx.before) return { text: 'Not audited yet.' }
      let failing = ctx.before.checks.filter((c: any) => c.status === 'fail')
      if (args.severity) failing = failing.filter((c: any) => c.severity === args.severity)
      if (!failing.length) return { text: 'No failing checks match that.' }
      const lines = failing.slice(0, 10).map((c: any) => {
        const e = c.evidence[0]
        return `- \`${c.layer}\` **${c.severity}** ${c.title}\n  ${c.detail}${e ? `\n  ↳ \`${e.file}${e.line ? `:${e.line}` : ''}\`` : ''}`
      })
      return {
        text: `${failing.length} failing check(s):\n\n${lines.join('\n')}${failing.length > 10 ? `\n\n…and ${failing.length - 10} more.` : ''}`,
        data: failing,
      }
    },
  },

  {
    name: 'explain_finding',
    description:
      'The full detail and evidence for one specific check, by its id (for example l4.closed-variants) or part of its title.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Check id or part of its title' } },
      required: ['id'],
    },
    run: (args, ctx) => {
      if (!ctx.before) return { text: 'Not audited yet.' }
      const q = String(args.id).toLowerCase()
      const check =
        ctx.before.checks.find((c: any) => c.id.toLowerCase().includes(q)) ??
        ctx.before.checks.find((c: any) => c.title.toLowerCase().includes(q))
      if (!check) return { text: `No check matches "${args.id}".` }
      const ev = check.evidence.map((e: any) => `  ${e.file}${e.line ? `:${e.line}` : ''}\n    ${e.excerpt}`).join('\n')
      return {
        text: `**${check.title}** — \`${check.layer}\` ${check.severity}, status **${check.status}**\n\n${check.detail}\n\n**Evidence**\n\`\`\`\n${ev || 'none recorded'}\n\`\`\`${check.fix ? `\n**Fix** — ${check.fix}${check.hours ? ` (~${check.hours}h, +${check.points} points)` : ''}` : ''}`,
        data: check,
      }
    },
  },

  {
    name: 'get_component',
    description:
      'The full contract for one component: props, closed variant sets, defaults, states, accessibility and the tokens it consumes.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Component name, e.g. Button' } },
      required: ['name'],
    },
    run: (args, ctx) => {
      const name = String(args.name)
      const c = ctx.manifest?.components.find((x: any) => x.name.toLowerCase() === name.toLowerCase())
      if (c) {
        const variants = Object.entries(c.variants as Record<string, string[]>)
          .map(([axis, values]) => `- \`${axis}\`: ${values.map((v) => `\`${v}\``).join(' | ')} — default \`${c.defaultVariants[axis]}\``)
          .join('\n')
        return {
          text: `**${c.name}** — ${c.purpose}\n\n**Variants** (closed sets — a value not listed is a compile error)\n${variants || 'none'}\n\n**Do NOT use when**\n${(c.useInstead as any[]).map((u) => `- ${u.when} → **${u.use}**`).join('\n')}\n\n**Also called** ${c.aliases.join(', ')}\n\n**Tokens** ${c.tokens.length} consumed`,
          data: c,
        }
      }
      const fact = ctx.facts?.components.find((x: any) => x.name.toLowerCase() === name.toLowerCase())
      if (fact) {
        return {
          text: `**${fact.name}** — not converted yet.\n\nSource \`${fact.file}\`\n- ${fact.rawValues.length} raw value(s)\n- ${fact.openVariants.length ? `open variant prop(s): ${fact.openVariants.join(', ')}` : 'no open variant props'}\n- axes: ${Object.keys(fact.variants).join(', ') || 'none'}\n- ${fact.exported ? 'exported' : '**not exported** — an agent cannot import it'}`,
          data: fact,
        }
      }
      const available = (ctx.manifest?.components ?? ctx.facts?.components ?? []).map((x: any) => x.name)
      return { text: `"${name}" is not in this system. Available: ${available.join(', ') || 'none'}. Do not build a replacement — say it is missing.` }
    },
  },

  {
    name: 'find_component',
    description:
      'Find the component for something by what it LOOKS like or what it is called elsewhere — "segmented control", "pill", "tag", "banner". Searches names, aliases and purposes.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'What you are looking for' } },
      required: ['query'],
    },
    run: (args, ctx) => {
      const gate = needsConversion(ctx)
      if (gate) return gate
      const q = String(args.query).toLowerCase().replace(/[?.]/g, '').trim()
      const hits = ctx.manifest!.components.filter((c: any) =>
        [c.name, ...(c.aliases ?? []), c.purpose].join(' ').toLowerCase().includes(q))
      if (!hits.length) {
        return { text: `Nothing in "${ctx.row.name}" matches "${q}". That is an answer, not a gap to fill — check \`curation.json\` → \`genuinelyAbsent\` and say it is missing rather than building it.` }
      }
      return { text: hits.map((c: any) => `**${c.name}** — ${c.purpose}`).join('\n'), data: hits }
    },
  },

  {
    name: 'get_tokens',
    description: 'The generated token layer. Components consume the semantic tier only.',
    parameters: {
      type: 'object',
      properties: { tier: { type: 'string', description: 'Which tier', enum: ['semantic', 'primitive', 'all'] } },
    },
    run: (args, ctx) => {
      const gate = needsConversion(ctx)
      if (gate) return gate
      const tier = args.tier ?? 'semantic'
      const all = (ctx.manifest!.tokens ?? []) as Array<{ name: string; tier: string; value: string }>
      const picked = tier === 'all' ? all : all.filter((t) => t.tier === tier)
      return {
        text: `${picked.length} ${tier} token(s).\n\n${picked.slice(0, 16).map((t) => `- \`--${t.name}\` = ${t.value}`).join('\n')}${picked.length > 16 ? `\n\n…and ${picked.length - 16} more.` : ''}`,
        data: picked,
      }
    },
  },

  {
    name: 'get_rules',
    description: 'The generated do/do-not card for this system. Every rule comes from a real audit finding on it.',
    parameters: { type: 'object', properties: {} },
    run: (_a, ctx) => ({
      text: readOutput(ctx, '4-orchestration/RULES.md') ?? 'Convert the system first — RULES.md is generated from its audit findings.',
    }),
  },

  {
    name: 'list_open_questions',
    description:
      'Every value that could not be measured from the source and was recorded as a question rather than guessed. Use for "todos", "what needs a human", "what did you not know".',
    parameters: { type: 'object', properties: {} },
    run: (_a, ctx) => {
      const body = readOutput(ctx, 'SCORECARD.md')
      if (!body) return { text: 'Nothing yet — convert the system and I will list every value that could not be measured.' }
      const section = body.split('## Needs a human')[1] ?? ''
      return { text: `**Open questions**\n${section.trim() || 'none'}\n\nNothing there was guessed.` }
    },
  },

  {
    name: 'check_code',
    description:
      'Run the conformance gate over JSX the user pasted: raw hex/px values, invented variant values, hand-rolled elements the system provides.',
    parameters: {
      type: 'object',
      properties: { code: { type: 'string', description: 'The JSX/TSX to check' } },
      required: ['code'],
    },
    run: (args, ctx) => {
      const gate = needsConversion(ctx)
      if (gate) return gate
      const code = String(args.code)
      const byName = Object.fromEntries(ctx.manifest!.components.map((c: any) => [c.name, c]))
      const findings: string[] = []
      code.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b|(?<![\w-])\d{2,4}px\b/g)) {
          findings.push(`line ${i + 1}: raw value \`${m[0]}\` — use a semantic token`)
        }
        for (const m of line.matchAll(/<([A-Z][A-Za-z0-9]*)\s[^>]*?\b(\w+)="([^"]+)"/g)) {
          const allowed = (byName[m[1]] as any)?.variants?.[m[2]]
          if (allowed && !allowed.includes(m[3])) {
            findings.push(`line ${i + 1}: \`${m[1]} ${m[2]}="${m[3]}"\` is not in the closed set — use ${allowed.join(', ')}`)
          }
        }
        for (const m of line.matchAll(/<(button|input)\b/g)) {
          const better = m[1] === 'button' ? 'Button' : 'Input'
          if (byName[better]) findings.push(`line ${i + 1}: \`<${m[1]}>\` hand-rolled — use \`<${better}>\``)
        }
      })
      return {
        text: findings.length
          ? `${findings.length} finding(s):\n\n${findings.map((f) => `- ${f}`).join('\n')}`
          : 'Clean — no raw values, no invented variant values, nothing hand-rolled.',
        data: findings,
      }
    },
  },

  {
    name: 'list_files',
    description: 'The generated output file tree.',
    parameters: { type: 'object', properties: {} },
    run: (_a, ctx) => {
      const dir = outputDir(ctx.row.id)
      if (!fs.existsSync(dir)) return { text: 'Nothing generated yet.' }
      const list = fs.readdirSync(dir, { recursive: true }).filter((f) => typeof f === 'string') as string[]
      return { text: `${list.length} file(s):\n\n${list.slice(0, 40).map((f) => `- \`${f}\``).join('\n')}`, data: list }
    },
  },
]

export const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]))

export const toolNames = () => TOOLS.map((t) => t.name).join(' · ')
