'use client'

import * as React from 'react'
import { Spinner, cx } from './primitives'

export interface ConnectionState {
  connected: boolean
  source: 'app' | 'env' | null
  masked: string | null
  baseUrl: string
  provider: string
  model: string
  defaults: { baseUrl: string; model: string }
  models?: string[]
  verified?: { total: number; toolCalling: number }
}

/** Gateways worth one click. Anything else goes in the field. */
const PRESETS = [
  { label: 'OmniRoute (local)', url: 'http://localhost:20128/v1' },
  { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
  { label: 'OpenAI', url: 'https://api.openai.com/v1' },
]

export function ConnectButton() {
  const [state, setState] = React.useState<ConnectionState | null>(null)
  const [open, setOpen] = React.useState(false)

  const refresh = React.useCallback(async () => {
    const s = await fetch('/api/settings').then((r) => r.json())
    setState(s)
    return s as ConnectionState
  }, [])

  React.useEffect(() => { refresh() }, [refresh])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cx(
          'chip ring-1 h-7 px-3 transition',
          state?.connected
            ? 'ring-emerald-200 bg-emerald-50 text-verdict-yes'
            : 'ring-flame-200 bg-flame-50 text-verdict-no hover:ring-flame-300',
        )}
        title={state?.connected ? `${state.provider} · ${state.model}` : 'Connect a model to enable natural language'}
      >
        <span className={cx('h-1.5 w-1.5 rounded-full', state?.connected ? 'bg-verdict-yes' : 'bg-verdict-no animate-pulseSoft')} />
        {state?.connected ? state.provider : 'Connect model'}
      </button>

      {open && <ConnectDialog initial={state} onClose={() => setOpen(false)} onSaved={refresh} />}
    </>
  )
}

function ConnectDialog({ initial, onClose, onSaved }: {
  initial: ConnectionState | null
  onClose: () => void
  onSaved: () => Promise<ConnectionState>
}) {
  const [state, setState] = React.useState(initial)
  const [key, setKey] = React.useState('')
  const [url, setUrl] = React.useState(initial?.baseUrl ?? PRESETS[0].url)
  const [model, setModel] = React.useState(initial?.model ?? '')
  const [models, setModels] = React.useState<string[]>([])
  const [filter, setFilter] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [ok, setOk] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => { inputRef.current?.focus() }, [])
  React.useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  // If already connected, pull the live model list so the picker is real.
  React.useEffect(() => {
    if (!initial?.connected) return
    fetch('/api/settings?models')
      .then((r) => r.json())
      .then((s: ConnectionState) => setModels(s.models ?? []))
      .catch(() => {})
  }, [initial?.connected])

  async function save() {
    setBusy(true); setError(null); setOk(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          apiKey: key || undefined,
          baseUrl: url,
          model: model || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not save')
      setKey('')
      setState(data)
      setOk(
        data.verified
          ? `Connected. ${data.verified.toolCalling} of ${data.verified.total} models can call tools.`
          : 'Saved.',
      )
      const s = await onSaved()
      setModel(s.model)
      const withModels = await fetch('/api/settings?models').then((r) => r.json())
      setModels(withModels.models ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    await fetch('/api/settings', { method: 'DELETE' })
    await onSaved()
    setBusy(false)
    onClose()
  }

  const shown = models.filter((m) => m.toLowerCase().includes(filter.toLowerCase())).slice(0, 60)
  const isLocal = /localhost|127\.0\.0\.1/.test(url)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-ink/25 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-[520px] max-h-[86vh] card overflow-hidden flex flex-col animate-rise">
        <div className="relative bg-mesh-warm px-6 py-5 shrink-0">
          <div className="absolute inset-0 texture-dots opacity-[.14]" aria-hidden />
          <div className="relative">
            <div className="mono-label text-ink-soft">Model gateway</div>
            <h2 className="text-[19px] font-semibold mt-1">
              {state?.connected ? state.provider : 'Connect a model'}
            </h2>
            <p className="text-[12.5px] text-ink-soft mt-1 leading-relaxed max-w-[46ch]">
              Turns the chat pane from a fixed command list into natural language. The model
              only chooses which tool to call — it still cannot write a file.
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto no-scrollbar">
          {state?.connected && (
            <div className="rounded-inset ring-1 ring-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-verdict-yes">Connected</div>
                <div className="font-mono text-[11px] text-ink-soft truncate">
                  {state.masked} · from {state.source === 'env' ? '.env.local' : 'this app'}
                </div>
              </div>
              {state.source === 'app' && (
                <button className="btn-quiet h-7 text-[12px]" onClick={disconnect} disabled={busy}>
                  Disconnect
                </button>
              )}
            </div>
          )}

          <div>
            <label className="mono-label block mb-1.5">Base URL</label>
            <input
              className="field font-mono text-[12px]"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setOk(null); setError(null) }}
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {PRESETS.map((p) => (
                <button
                  key={p.url}
                  onClick={() => setUrl(p.url)}
                  className={cx(
                    'chip ring-1 text-[11px] transition',
                    url === p.url ? 'bg-ink text-paper ring-ink' : 'bg-paper ring-paper-edge text-ink-soft hover:ring-ink-faint/50',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {isLocal && (
              <p className="text-[11.5px] text-ink-faint mt-1.5">
                Local gateway — the key and every prompt stay on this machine.
              </p>
            )}
          </div>

          <div>
            <label className="mono-label block mb-1.5">
              {state?.connected ? 'Replace key' : 'API key'}
            </label>
            <input
              ref={inputRef}
              type="password"
              className="field font-mono text-[12px]"
              placeholder="sk-…"
              value={key}
              onChange={(e) => { setKey(e.target.value); setOk(null); setError(null) }}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-[11.5px] text-ink-faint mt-1.5 leading-relaxed">
              Stored in the local gitignored database and never returned to the browser.
            </p>
          </div>

          {models.length > 0 && (
            <div>
              <label className="mono-label block mb-1.5">
                Model — {models.length} available with tool calling
              </label>
              <input
                className="field font-mono text-[12px] mb-2"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                spellCheck={false}
              />
              <input
                className="field h-9 text-[12px] mb-2"
                placeholder="filter…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <div className="max-h-[140px] overflow-y-auto no-scrollbar flex flex-wrap gap-1.5">
                {shown.map((m) => (
                  <button
                    key={m}
                    onClick={() => setModel(m)}
                    className={cx(
                      'chip ring-1 font-mono text-[10.5px] transition',
                      model === m ? 'bg-ink text-paper ring-ink' : 'bg-paper ring-paper-edge text-ink-soft hover:ring-ink-faint/50',
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-inset ring-1 ring-flame-200 bg-flame-50 px-4 py-3 text-[12.5px] text-verdict-no leading-relaxed">
              {error}
            </div>
          )}
          {ok && !error && (
            <div className="rounded-inset ring-1 ring-emerald-200 bg-emerald-50 px-4 py-3 text-[12.5px] text-verdict-yes">
              {ok}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-paper-edge shrink-0">
          <button className="btn-quiet h-9" onClick={onClose}>Close</button>
          <button className="btn-flame h-9" onClick={save} disabled={busy}>
            {busy ? <><Spinner /> Verifying</> : 'Verify & save'}
          </button>
        </div>
      </div>
    </div>
  )
}
