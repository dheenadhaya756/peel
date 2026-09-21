/**
 * OpenRouter — the model that decides WHICH tool to call.
 *
 * Deliberately narrow: the model is given the tool surface and the user's message,
 * and its only job is to pick a tool and its arguments. It is never asked to
 * produce component code, token values, or any other content the engine could
 * measure instead. If it answers without calling a tool, that answer is passed
 * through as prose and nothing in the system changes.
 *
 * That boundary is what keeps the anti-hallucination guarantee intact regardless of
 * which model is behind the key.
 */
import { TOOLS } from './tools'
import { getSetting } from '../store'

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

/** A key pasted into the app wins over one in .env.local, so the UI is authoritative. */
export const apiKey = () => getSetting('openrouter_api_key') ?? process.env.OPENROUTER_API_KEY ?? null
export const hasKey = () => Boolean(apiKey())
export const model = () =>
  getSetting('openrouter_model') ?? process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4.5'

const SYSTEM = `You are the assistant inside Peel, a tool that measures whether a design system is ready for AI agents to build from, and converts it so that it is.

You answer questions about ONE design system that has already been ingested and scored.

Rules you follow without exception:

1. Call a tool for anything factual. Never state a score, a component name, a prop, a
   variant value or a token from memory — every one of those is measured, and the tools
   return the measurement.
2. Never invent a component, a prop, a variant value or a token. If a tool says
   something is absent, say it is absent. That is a useful answer, not a gap to fill.
3. If the user asks for something outside the tools — restyling, redesigning, opinions
   about aesthetics, writing arbitrary code — say plainly that you cannot do it and
   name what you can do. Do not improvise around it.
4. Be brief and concrete. Quote the evidence line (file:line) when a tool gives you one.
5. Never soften a bad score. The number exists to be acted on.`

export interface LlmTurn {
  text: string
  tool: string
  data?: unknown
}

interface ToolCall {
  id: string
  function: { name: string; arguments: string }
}

/**
 * One round-trip: the model picks tools, the engine runs them, the model writes the
 * answer from what came back. Tools always execute locally — the model never sees
 * the design system except through their return values.
 */
export async function routeWithModel(
  message: string,
  runTool: (name: string, args: Record<string, unknown>) => { text: string; data?: unknown },
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
): Promise<LlmTurn> {
  const key = apiKey()
  if (!key) throw new Error('No OpenRouter key is configured')

  const tools = TOOLS.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: SYSTEM },
    ...history.slice(-6),
    { role: 'user', content: message },
  ]

  const post = async (body: unknown) => {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'HTTP-Referer': 'http://localhost:3210',
        'X-Title': 'Peel',
      },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    if (!res.ok) {
      let detail = text
      try {
        detail = JSON.parse(text)?.error?.message ?? text
      } catch { /* keep the raw body */ }
      throw new Error(`OpenRouter ${res.status}: ${detail}`)
    }
    return JSON.parse(text)
  }

  const first = await post({ model: model(), messages, tools, tool_choice: 'auto', temperature: 0 })
  const choice = first.choices?.[0]?.message
  const calls: ToolCall[] = choice?.tool_calls ?? []

  if (!calls.length) {
    return { text: choice?.content ?? 'No answer came back.', tool: 'answer' }
  }

  // Run every requested tool locally, then let the model phrase the result.
  messages.push(choice)
  const used: string[] = []
  let lastData: unknown
  for (const call of calls) {
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(call.function.arguments || '{}')
    } catch { /* a malformed argument object is the same as none */ }
    const result = runTool(call.function.name, args)
    used.push(call.function.name)
    lastData = result.data
    messages.push({ role: 'tool', tool_call_id: call.id, content: result.text })
  }

  const second = await post({ model: model(), messages, temperature: 0 })
  return {
    text: second.choices?.[0]?.message?.content ?? 'No answer came back.',
    tool: used.join(' + '),
    data: lastData,
  }
}
