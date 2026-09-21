/**
 * The model that decides WHICH tool to call.
 *
 * Provider-agnostic: anything speaking the OpenAI chat-completions shape works, so
 * the same code serves a local OmniRoute gateway, OpenRouter, or an OpenAI key.
 * Only the base URL changes.
 *
 * Deliberately narrow. The model is given the tool surface and the user's message,
 * and its only job is to pick a tool and its arguments. It is never asked to produce
 * component code, token values, or anything else the engine could measure instead.
 * If it answers without calling a tool, that answer is passed through as prose and
 * nothing in the system changes.
 *
 * That boundary is what keeps the anti-hallucination guarantee intact regardless of
 * which model is behind the key.
 */
import { TOOLS } from './tools'
import { getSetting } from '../store'

/** OmniRoute's default. Local-first, and what this machine runs. */
export const DEFAULT_BASE_URL = 'http://localhost:20128/v1'

/**
 * A concrete model, deliberately NOT one of OmniRoute's `auto/*` aliases.
 *
 * The `auto/*` profiles are agentic coding routes that inject their own tool set
 * (list_dir, read_file and so on). They keep emitting tool calls for tools this app
 * never declared — even when asked for prose with tool_choice:'none' — so the turn
 * never resolves to an answer. Concrete ids behave normally.
 */
export const DEFAULT_MODEL = 'agy/claude-sonnet-4-6'

/** True for routing profiles that carry their own tools and cannot be used here. */
export const isAgenticAlias = (id: string) => id.startsWith('auto/')

/** A value set in the app wins over .env.local, so the UI is authoritative. */
export const apiKey = () => getSetting('llm_api_key') ?? process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY ?? null
export const baseUrl = () =>
  (getSetting('llm_base_url') ?? process.env.LLM_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
export const model = () => getSetting('llm_model') ?? process.env.LLM_MODEL ?? DEFAULT_MODEL
export const hasKey = () => Boolean(apiKey())

/** A local gateway is recognisable, and worth naming in the UI. */
export function providerLabel(url = baseUrl()): string {
  if (/localhost:20128|127\.0\.0\.1:20128/.test(url)) return 'OmniRoute (local)'
  if (/openrouter\.ai/.test(url)) return 'OpenRouter'
  if (/api\.openai\.com/.test(url)) return 'OpenAI'
  if (/localhost|127\.0\.0\.1/.test(url)) return 'Local gateway'
  return new URL(url).host
}

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

async function post(path: string, body: unknown) {
  const key = apiKey()
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      // OpenRouter asks for these; other gateways ignore them.
      'HTTP-Referer': 'http://localhost:3210',
      'X-Title': 'Peel',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    let detail = text.slice(0, 300)
    try {
      detail = JSON.parse(text)?.error?.message ?? detail
    } catch { /* keep the raw body */ }
    throw new Error(`${providerLabel()} ${res.status}: ${detail}`)
  }
  return JSON.parse(text)
}

/** Verify a key and base URL before storing them, so a bad pair fails at entry. */
export async function verify(url: string, key: string) {
  const res = await fetch(`${url.replace(/\/+$/, '')}/models`, {
    headers: { authorization: `Bearer ${key}` },
  })
  const text = await res.text()
  if (!res.ok) {
    let detail = text.slice(0, 200)
    try {
      detail = JSON.parse(text)?.error?.message ?? detail
    } catch { /* keep the raw body */ }
    throw new Error(detail || `${res.status} ${res.statusText}`)
  }
  const data = JSON.parse(text)?.data ?? []
  // Only models that can call tools are usable here — the assistant's entire job is
  // choosing a tool, so a model without tool calling would have to improvise instead.
  const withTools = data.filter(
    (m: { id: string; capabilities?: { tool_calling?: boolean } }) =>
      m.capabilities?.tool_calling !== false && !isAgenticAlias(m.id),
  )
  return {
    total: data.length,
    models: withTools.map((m: { id: string }) => m.id),
  }
}

export async function listModels() {
  const key = apiKey()
  if (!key) return []
  try {
    const { models } = await verify(baseUrl(), key)
    return models
  } catch {
    return []
  }
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
  if (!apiKey()) throw new Error('No API key is configured')

  const tools = TOOLS.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: SYSTEM },
    ...history.slice(-6),
    { role: 'user', content: message },
  ]

  const known = new Set(TOOLS.map((t) => t.name))
  const used: string[] = []
  const collected: string[] = []
  let lastData: unknown

  // Loop rather than assuming one round. Some models chain calls, and some keep
  // emitting calls for tools they were never given — both have to terminate.
  for (let round = 0; round < 4; round++) {
    const last = round === 3
    const res = await post('/chat/completions', {
      model: model(),
      messages,
      ...(last ? { tool_choice: 'none' } : { tools, tool_choice: 'auto' }),
      temperature: 0,
    })
    const choice = res.choices?.[0]?.message
    const calls: ToolCall[] = choice?.tool_calls ?? []

    if (!calls.length) {
      const text = choice?.content?.trim()
      if (text) return { text, tool: used.join(' + ') || 'answer', data: lastData }
      break
    }

    messages.push(choice)
    for (const call of calls) {
      const name = call.function.name
      if (!known.has(name)) {
        // The model reached for a tool this app never declared — usually a routing
        // profile with its own baked-in tool set. Say so rather than looping.
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: `There is no tool named "${name}". The only tools available are: ${[...known].join(', ')}. Answer using what you already have.`,
        })
        continue
      }
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(call.function.arguments || '{}')
      } catch { /* a malformed argument object is the same as none */ }
      const result = runTool(name, args)
      used.push(name)
      lastData = result.data
      collected.push(result.text)
      messages.push({ role: 'tool', tool_call_id: call.id, content: result.text })
    }
  }

  // The model never produced prose. The measurement is what matters, so return it
  // directly rather than reporting nothing — the tool output is already the answer.
  if (collected.length) {
    return {
      text: collected.join('\n\n---\n\n'),
      tool: used.join(' + ') || 'tools',
      data: lastData,
    }
  }

  throw new Error(
    `${model()} did not return an answer. If it is an "auto/*" routing profile, pick a concrete model — those aliases carry their own tools and never resolve to prose.`,
  )
}
