/**
 * GET/POST/DELETE /api/settings — the LLM connection.
 *
 * Provider-agnostic: a base URL plus a key. Defaults to the local OmniRoute gateway,
 * and works unchanged against OpenRouter, OpenAI, or anything else speaking the
 * OpenAI chat-completions shape.
 *
 * The key is stored in the gitignored local SQLite file and is **never returned to
 * the browser**. A GET reports only whether one is set and a masked tail, so it
 * cannot be read back out of the UI, the network tab, or a screen share.
 */
import { NextRequest, NextResponse } from 'next/server'
import { clearSetting, getSetting, setSetting } from '@/lib/store'
import {
  DEFAULT_BASE_URL, DEFAULT_MODEL, apiKey, baseUrl, listModels, model, providerLabel, verify,
} from '@/lib/chat/llm'

export const runtime = 'nodejs'
export const maxDuration = 60

const K_KEY = 'llm_api_key'
const K_URL = 'llm_base_url'
const K_MODEL = 'llm_model'

/** Enough to recognise which key is in use, never enough to use it. */
const mask = (k: string) => (k.length <= 10 ? '••••' : `${k.slice(0, 7)}…${k.slice(-4)}`)

async function state(includeModels = false) {
  const key = apiKey()
  return {
    connected: Boolean(key),
    source: getSetting(K_KEY) ? 'app' : key ? 'env' : null,
    masked: key ? mask(key) : null,
    baseUrl: baseUrl(),
    provider: providerLabel(),
    model: model(),
    defaults: { baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL },
    models: includeModels ? await listModels() : undefined,
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json(await state(req.nextUrl.searchParams.has('models')))
}

export async function POST(req: NextRequest) {
  const { apiKey: newKey, baseUrl: newUrl, model: newModel } =
    (await req.json()) as { apiKey?: string; baseUrl?: string; model?: string }

  const url = (newUrl ?? baseUrl()).replace(/\/+$/, '')

  // A key change, or a URL change against a stored key, is re-verified. A bad pair
  // should fail here rather than halfway through a conversation.
  if (newKey !== undefined || newUrl !== undefined) {
    const key = newKey?.trim() || apiKey()
    if (!key) return NextResponse.json({ error: 'Paste a key.' }, { status: 400 })

    try {
      new URL(url)
    } catch {
      return NextResponse.json({ error: `"${url}" is not a valid URL.` }, { status: 400 })
    }

    try {
      const { total, models } = await verify(url, key)
      if (newUrl !== undefined) setSetting(K_URL, url)
      if (newKey?.trim()) setSetting(K_KEY, key)
      // Keep the chosen model only if the gateway actually serves it.
      const chosen = newModel?.trim() || model()
      setSetting(K_MODEL, models.includes(chosen) ? chosen : (models[0] ?? DEFAULT_MODEL))
      return NextResponse.json({ ...(await state()), verified: { total, toolCalling: models.length } })
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      const local = /localhost|127\.0\.0\.1/.test(url)
      return NextResponse.json(
        {
          error:
            /fetch failed|ECONNREFUSED|other side closed/i.test(detail) && local
              ? `Nothing is answering at ${url}. Is OmniRoute running? Start it with \`omniroute\` and try again.`
              : `Rejected: ${detail}`,
        },
        { status: 400 },
      )
    }
  }

  if (newModel) setSetting(K_MODEL, newModel.trim())
  return NextResponse.json(await state())
}

export async function DELETE() {
  clearSetting(K_KEY)
  clearSetting(K_URL)
  clearSetting(K_MODEL)
  return NextResponse.json(await state())
}
