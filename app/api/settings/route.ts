/**
 * GET/POST/DELETE /api/settings — the OpenRouter connection.
 *
 * The key is stored in the gitignored local SQLite file and is **never returned to
 * the browser**. A GET reports only whether one is set and a masked tail, so the key
 * cannot be read back out of the UI, out of the network tab, or out of a screen
 * share. It is only ever sent to openrouter.ai.
 */
import { NextRequest, NextResponse } from 'next/server'
import { clearSetting, getSetting, setSetting } from '@/lib/store'

export const runtime = 'nodejs'

const KEY = 'openrouter_api_key'
const MODEL = 'openrouter_model'
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.5'

/** Enough to recognise which key is in use, never enough to use it. */
const mask = (k: string) => (k.length <= 10 ? '••••' : `${k.slice(0, 7)}…${k.slice(-4)}`)

export async function GET() {
  const stored = getSetting(KEY)
  const fromEnv = process.env.OPENROUTER_API_KEY
  const key = stored ?? fromEnv ?? null
  return NextResponse.json({
    connected: Boolean(key),
    source: stored ? 'app' : fromEnv ? 'env' : null,
    masked: key ? mask(key) : null,
    model: getSetting(MODEL) ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
  })
}

export async function POST(req: NextRequest) {
  const { apiKey, model } = (await req.json()) as { apiKey?: string; model?: string }

  if (model) setSetting(MODEL, model.trim())

  if (apiKey !== undefined) {
    const k = apiKey.trim()
    if (!k) return NextResponse.json({ error: 'Paste a key.' }, { status: 400 })
    if (!k.startsWith('sk-or-')) {
      return NextResponse.json(
        { error: 'That does not look like an OpenRouter key — they start with sk-or-. Get one at openrouter.ai/keys.' },
        { status: 400 },
      )
    }

    // Verify before storing, so a bad key fails here rather than mid-conversation.
    try {
      const res = await fetch('https://openrouter.ai/api/v1/key', {
        headers: { authorization: `Bearer ${k}` },
      })
      if (!res.ok) {
        const body = await res.text()
        let detail = `${res.status}`
        try {
          detail = JSON.parse(body)?.error?.message ?? detail
        } catch { /* keep the status */ }
        return NextResponse.json({ error: `OpenRouter rejected that key — ${detail}` }, { status: 400 })
      }
    } catch (err) {
      return NextResponse.json(
        { error: `Could not reach OpenRouter to verify the key: ${err instanceof Error ? err.message : String(err)}` },
        { status: 400 },
      )
    }

    setSetting(KEY, k)
  }

  const stored = getSetting(KEY)
  return NextResponse.json({
    connected: Boolean(stored),
    source: 'app',
    masked: stored ? mask(stored) : null,
    model: getSetting(MODEL) ?? DEFAULT_MODEL,
  })
}

export async function DELETE() {
  clearSetting(KEY)
  return NextResponse.json({ connected: Boolean(process.env.OPENROUTER_API_KEY), source: null, masked: null })
}
