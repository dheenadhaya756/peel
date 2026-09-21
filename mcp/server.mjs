#!/usr/bin/env node
/**
 * Peel MCP — the design system, served to your IDE.
 *
 * This is the point of the whole exercise. Everything the app generates is read back
 * out here, so the agent in your editor asks the system what exists instead of
 * inventing it. The two tools that matter are `get_component` and `when_not_to_use`:
 * the first closes the variant set, the second decides between lookalikes, and those
 * are the two failures that produce confident, compiling, wrong code.
 *
 * Connect it by adding this to your IDE's MCP config:
 *
 *   { "mcpServers": { "peel": { "command": "node",
 *       "args": ["<abs path>/mcp/server.mjs"] } } }
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DB = path.join(ROOT, 'data', 'peel.db')
const WORKSPACES = path.join(ROOT, 'data', 'workspaces')

const db = () => new DatabaseSync(DB, { readOnly: true })

const outputDir = (id) => path.join(WORKSPACES, id, 'agent-ready')

function systems() {
  if (!fs.existsSync(DB)) return []
  try {
    return db()
      .prepare('SELECT id, name, converted, after_json, selected FROM systems ORDER BY created_at DESC')
      .all()
  } catch {
    return []
  }
}

/** Resolve a system by id or name; default to the most recently converted one. */
function resolveSystem(ref) {
  const all = systems()
  if (!all.length) return null
  if (!ref) return all.find((s) => s.converted) ?? all[0]
  return (
    all.find((s) => s.id === ref) ??
    all.find((s) => s.name.toLowerCase() === String(ref).toLowerCase()) ??
    null
  )
}

function manifestOf(system) {
  const file = path.join(outputDir(system.id), 'manifest.json')
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

const readOutput = (system, rel) => {
  const file = path.join(outputDir(system.id), rel)
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
}

const text = (s) => ({ content: [{ type: 'text', text: s }] })
const json = (o) => text(JSON.stringify(o, null, 2))

/* ------------------------------------------------------------------ the tools */

const TOOLS = [
  {
    name: 'list_systems',
    description:
      'List the design systems Peel has ingested, with their agent-readiness score and whether they have been converted. Call this first if you do not know which system to use.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_components',
    description:
      'List every component in a converted design system, with its one-line purpose and the other names people call it. Read this BEFORE writing any UI element — if something is not listed here, this system does not have it.',
    inputSchema: {
      type: 'object',
      properties: { system: { type: 'string', description: 'System id or name. Defaults to the most recent.' } },
    },
  },
  {
    name: 'get_component',
    description:
      'The full contract for one component: every prop with its type and default, every variant axis with its CLOSED set of allowed values, states, accessibility requirements and the tokens it consumes. Never pass a variant value that is not in the returned set.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Component name, e.g. Button' },
        system: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'when_not_to_use',
    description:
      'For a component, the conditions under which it is the WRONG choice and what to use instead. Call this whenever two components could plausibly render the same thing — a static mockup cannot tell them apart, and picking by appearance is the most common wrong answer.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, system: { type: 'string' } },
      required: ['name'],
    },
  },
  {
    name: 'find_component',
    description:
      'Find the component for something you are trying to build, by what it LOOKS like or what you would call it elsewhere ("segmented control", "pill", "tag"). Searches names, aliases and purposes.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, system: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'get_tokens',
    description:
      'The token layer. Components and screens consume the SEMANTIC tier only; primitives exist to be referenced by semantic tokens and by nothing else. Never write a raw hex or px value — use a name from here.',
    inputSchema: {
      type: 'object',
      properties: {
        tier: { type: 'string', enum: ['semantic', 'primitive', 'all'] },
        system: { type: 'string' },
      },
    },
  },
  {
    name: 'get_rules',
    description:
      'The do/do-not card for this system. Read this WHOLE file before writing anything against the system. Every rule here comes from a real audit finding on this system, not a generic template.',
    inputSchema: { type: 'object', properties: { system: { type: 'string' } } },
  },
  {
    name: 'check_code',
    description:
      'Check code you have written against the system: raw hex/px values, invented variant values, hand-rolled elements the system provides, and appearance utilities on system components. Run this on any UI you generate before returning it.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The JSX/TSX you wrote' },
        system: { type: 'string' },
      },
      required: ['code'],
    },
  },
]

/* ------------------------------------------------------------- implementations */

function callTool(name, args) {
  if (name === 'list_systems') {
    const all = systems()
    if (!all.length) return text('No design systems have been ingested yet. Open the Peel app and add one.')
    return json(
      all.map((s) => {
        const after = s.after_json ? JSON.parse(s.after_json) : null
        return {
          id: s.id,
          name: s.name,
          converted: Boolean(s.converted),
          score: after?.composite ?? null,
          verdict: after?.verdict?.label ?? null,
          components: s.selected ? JSON.parse(s.selected) : [],
        }
      }),
    )
  }

  const system = resolveSystem(args.system)
  if (!system) return text('No such design system. Call list_systems to see what is available.')

  const manifest = manifestOf(system)
  if (!manifest) {
    return text(
      `"${system.name}" has been ingested but not converted, so there is no contract to serve yet. Convert it in the Peel app first.`,
    )
  }

  switch (name) {
    case 'list_components':
      return json({
        system: system.name,
        components: manifest.components.map((c) => ({
          name: c.name,
          purpose: c.purpose,
          aliases: c.aliases,
          variants: Object.fromEntries(Object.entries(c.variants).map(([k, v]) => [k, v])),
          import: c.import,
        })),
        note: 'If what you need is not in this list, this system does not have it. Say so rather than building a replacement.',
      })

    case 'get_component': {
      const c = manifest.components.find((x) => x.name.toLowerCase() === args.name.toLowerCase())
      if (!c) {
        const names = manifest.components.map((x) => x.name).join(', ')
        return text(`"${args.name}" is not in this system. Available: ${names}. Do not build a replacement — say it is missing.`)
      }
      return json({
        ...c,
        warning: 'Every variant axis above is a CLOSED set. A value not listed is a type error, not a new option.',
      })
    }

    case 'when_not_to_use': {
      const c = manifest.components.find((x) => x.name.toLowerCase() === args.name.toLowerCase())
      if (!c) return text(`"${args.name}" is not in this system.`)
      return json({ component: c.name, useWhen: c.useWhen, useInstead: c.useInstead })
    }

    case 'find_component': {
      const q = String(args.query).toLowerCase()
      const hits = manifest.components
        .map((c) => {
          const hay = [c.name, ...(c.aliases ?? []), c.purpose].join(' ').toLowerCase()
          const score = hay.includes(q) ? 2 : q.split(/\s+/).some((w) => hay.includes(w)) ? 1 : 0
          return { c, score }
        })
        .filter((h) => h.score > 0)
        .sort((a, b) => b.score - a.score)
      if (!hits.length) {
        return text(
          `Nothing in "${system.name}" matches "${args.query}". Check curation.json → genuinelyAbsent, then say it is missing rather than building it.`,
        )
      }
      return json(hits.map((h) => ({ name: h.c.name, purpose: h.c.purpose, aliases: h.c.aliases, useInstead: h.c.useInstead })))
    }

    case 'get_tokens': {
      const tier = args.tier ?? 'semantic'
      const all = manifest.tokens ?? []
      const picked = tier === 'all' ? all : all.filter((t) => t.tier === tier)
      return json({
        tier,
        count: picked.length,
        tokens: picked,
        rule: 'Components and screens use the semantic tier only. A primitive in a screen is a defect.',
      })
    }

    case 'get_rules':
      return text(readOutput(system, 'RULES.md') ?? 'No RULES.md was generated for this system.')

    case 'check_code': {
      const findings = []
      const code = String(args.code)
      const semantic = (manifest.tokens ?? []).filter((t) => t.tier === 'semantic').map((t) => t.name)
      const byName = Object.fromEntries(manifest.components.map((c) => [c.name, c]))

      code.split('\n').forEach((line, i) => {
        const n = i + 1
        for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b|(?<![\w-])\d{2,4}px\b/g)) {
          findings.push({
            line: n, rule: 'raw-value', problem: `raw value ${m[0]}`,
            fix: `use a semantic token, e.g. --${semantic[0] ?? 'bg-action-primary'}`,
          })
        }
        for (const m of line.matchAll(/<([A-Z][A-Za-z0-9]*)\s[^>]*?\b(\w+)="([^"]+)"/g)) {
          const [, comp, axis, value] = m
          const allowed = byName[comp]?.variants?.[axis]
          if (allowed && !allowed.includes(value)) {
            findings.push({
              line: n, rule: 'invented-variant',
              problem: `${comp} ${axis}="${value}" is not in the closed set`,
              fix: `use one of: ${allowed.join(', ')}`,
            })
          }
        }
        for (const m of line.matchAll(/<(button|input)\b/g)) {
          const better = m[1] === 'button' ? 'Button' : 'Input'
          if (byName[better]) {
            findings.push({
              line: n, rule: 'hand-rolled',
              problem: `<${m[1]}> written by hand`,
              fix: `use <${better}> — hand-rolling loses every variant and the focus ring`,
            })
          }
        }
      })

      return json({
        clean: findings.length === 0,
        findings,
        summary: findings.length
          ? `${findings.length} finding(s). Each names its fix — apply them rather than working around them.`
          : 'Clean. No raw values, no invented variants, nothing hand-rolled.',
      })
    }

    default:
      return text(`Unknown tool: ${name}`)
  }
}

/* ---------------------------------------------------------------------- wiring */

const server = new Server(
  { name: 'peel', version: '0.1.0' },
  { capabilities: { tools: {}, resources: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  try {
    return callTool(req.params.name, req.params.arguments ?? {})
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
  }
})

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resources = []
  for (const s of systems()) {
    if (!s.converted) continue
    for (const f of ['AGENTS.md', 'llms.txt', 'RULES.md', 'design.md', 'curation.json', 'manifest.json']) {
      if (fs.existsSync(path.join(outputDir(s.id), f))) {
        resources.push({
          uri: `peel://${s.id}/${f}`,
          name: `${s.name} — ${f}`,
          mimeType: f.endsWith('.json') ? 'application/json' : 'text/markdown',
        })
      }
    }
  }
  return { resources }
})

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const m = req.params.uri.match(/^peel:\/\/([^/]+)\/(.+)$/)
  if (!m) throw new Error(`Unrecognised uri: ${req.params.uri}`)
  const file = path.join(outputDir(m[1]), m[2])
  if (!fs.existsSync(file)) throw new Error(`Not generated: ${m[2]}`)
  return { contents: [{ uri: req.params.uri, text: fs.readFileSync(file, 'utf8') }] }
})

await server.connect(new StdioServerTransport())
