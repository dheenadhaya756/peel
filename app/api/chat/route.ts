/**
 * POST /api/chat — the tool-constrained assistant.
 *
 * Two routing paths, ONE tool surface. With an OpenRouter key set, a model decides
 * which tool to call; without one, a deterministic matcher does. Either way the
 * assistant can only invoke the tools in lib/chat/tools.ts, each of which reads or
 * regenerates through the engine. There is no path from a chat message to an
 * arbitrary file write, so the anti-hallucination guarantee does not depend on which
 * model is behind the key — or on there being one at all.
 */
import { NextRequest, NextResponse } from 'next/server'
import { buildContext, TOOL_BY_NAME, toolNames } from '@/lib/chat/tools'
import { hasKey, model, providerLabel, routeWithModel } from '@/lib/chat/llm'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET() {
  // The UI shows which router is live, so nobody has to guess why replies changed.
  return NextResponse.json({
    llm: hasKey(),
    model: hasKey() ? model() : null,
    provider: hasKey() ? providerLabel() : null,
    tools: toolNames(),
  })
}

export async function POST(req: NextRequest) {
  const { systemId, message, history } = (await req.json()) as {
    systemId?: string
    message: string
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  }

  const q = (message ?? '').trim()
  if (!q) return NextResponse.json({ text: 'Say what you need.', tool: 'noop' })

  if (!systemId) {
    return NextResponse.json({
      text: 'Select a design system first — everything I can do reads from one.',
      tool: 'noop',
    })
  }

  const ctx = buildContext(systemId)
  if (!ctx) return NextResponse.json({ text: 'That system no longer exists.', tool: 'noop' })

  const runTool = (name: string, args: Record<string, unknown>) => {
    const tool = TOOL_BY_NAME[name]
    if (!tool) return { text: `No such tool: ${name}` }
    try {
      return tool.run(args, ctx)
    } catch (err) {
      return { text: `${name} failed: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  if (hasKey()) {
    try {
      const turn = await routeWithModel(q, runTool, history ?? [])
      return NextResponse.json({ ...turn, router: 'llm' })
    } catch (err) {
      // A key problem should say so rather than silently degrading to the matcher.
      const detail = err instanceof Error ? err.message : String(err)
      return NextResponse.json({
        text: `The model could not be reached, so I fell back to the built-in matcher.\n\n\`${detail}\`\n\n${match(q, runTool).text}`,
        tool: 'fallback',
        router: 'fallback',
      })
    }
  }

  return NextResponse.json({ ...match(q, runTool), router: 'pattern' })
}

/* ------------------------------------------------- deterministic intent matcher */

/**
 * Used when no key is set. Intentionally conservative: anything it cannot map with
 * confidence is reported as unmapped rather than guessed at, which is the same
 * behaviour the model is instructed to follow.
 */
function match(q: string, run: (name: string, args: Record<string, unknown>) => { text: string; data?: unknown }) {
  const lower = q.toLowerCase()

  const explain = lower.match(/explain\s+([\w.-]+)/)
  if (explain) return { ...run('explain_finding', { id: explain[1] }), tool: 'explain_finding' }

  if (/\b(score|readiness|verdict|rating|how bad|how good|agentic)\b/.test(lower)) {
    return { ...run('get_score', {}), tool: 'get_score' }
  }
  if (/\b(finding|issue|problem|wrong|fail|blocker|broken)\b/.test(lower)) {
    return { ...run('list_findings', {}), tool: 'list_findings' }
  }
  if (/\b(todo|open question|needs a human|unknown)\b/.test(lower)) {
    return { ...run('list_open_questions', {}), tool: 'list_open_questions' }
  }
  if (/\btoken/.test(lower)) return { ...run('get_tokens', {}), tool: 'get_tokens' }
  if (/\brule/.test(lower)) return { ...run('get_rules', {}), tool: 'get_rules' }
  if (/\b(file|output|tree)\b/.test(lower)) return { ...run('list_files', {}), tool: 'list_files' }

  if (/\bcheck\b/.test(lower) && q.length > 20) {
    return { ...run('check_code', { code: q.replace(/^.*?check\b/i, '').trim() }), tool: 'check_code' }
  }

  const comp = q.match(/\b([A-Z][A-Za-z0-9]{2,})\b/)
  if (comp) return { ...run('get_component', { name: comp[1] }), tool: 'get_component' }

  const where = lower.match(/(?:where|which|find|looking for)\s+(?:is\s+|the\s+)?(?:a\s+)?(.+)/)
  if (where) return { ...run('find_component', { query: where[1] }), tool: 'find_component' }

  return {
    text: `I can't map that to anything I'm allowed to do, so I'm not going to guess at it.\n\nWhat I can do:\n\n\`${toolNames()}\`\n\nEverything runs through the engine — I can't write a file directly, which is why I can't invent one.\n\n*(No model connected, so intent matching is pattern-based. Connect one from the header for natural language.)*`,
    tool: 'unmapped',
  }
}
