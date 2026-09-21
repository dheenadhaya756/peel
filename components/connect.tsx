'use client'

import * as React from 'react'
import { Spinner, cx } from './primitives'

export interface ConnectionState {
  connected: boolean
  source: 'app' | 'env' | null
  masked: string | null
  model: string
}

/** A short list so the common choices are one click, with free text for anything else. */
const MODELS = [
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-opus-4.1',
  'openai/gpt-4.1',
  'google/gemini-2.5-pro',
  'meta-llama/llama-3.3-70b-instruct',
]

export function ConnectButton({ onChange }: { onChange?: (s: ConnectionState) => void }) {
  const [state, setState] = React.useState<ConnectionState | null>(null)
  const [open, setOpen] = React.useState(false)

  const refresh = React.useCallback(async () => {
    const s = await fetch('/api/settings').then((r) => r.json())
    setState(s)
    onChange?.(s)
    return s as ConnectionState
  }, [onChange])

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
        title={state?.connected ? `OpenRouter connected (${state.masked})` : 'Connect OpenRouter to enable natural language'}
      >
        <span className={cx('h-1.5 w-1.5 rounded-full', state?.connected ? 'bg-verdict-yes' : 'bg-verdict-no animate-pulseSoft')} />
        {state?.connected ? 'OpenRouter' : 'Connect OpenRouter'}
      </button>

      {open && (
        <ConnectDialog
          state={state}
          onClose={() => setOpen(false)}
          onSaved={async () => { await refresh() }}
        />
      )}
    </>
  )
}

function ConnectDialog({ state, onClose, onSaved }: {
  state: ConnectionState | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [key, setKey] = React.useState('')
  const [model, setModel] = React.useState(state?.model ?? MODELS[0])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [ok, setOk] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => { inputRef.current?.focus() }, [])
  React.useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: key || undefined, model }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not save')
      setKey('')
      setOk(true)
      await onSaved()
      setTimeout(onClose, 900)
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-ink/25 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-[460px] card overflow-hidden animate-rise">
        <div className="relative bg-mesh-warm px-6 py-5">
          <div className="absolute inset-0 texture-dots opacity-[.14]" aria-hidden />
          <div className="relative">
            <div className="mono-label text-ink-soft">LLM provider</div>
            <h2 className="text-[19px] font-semibold mt-1">OpenRouter</h2>
            <p className="text-[12.5px] text-ink-soft mt-1 leading-relaxed max-w-[42ch]">
              Turns the chat pane from a fixed command list into natural language. One key
              routes to any model.
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
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
            <label className="mono-label block mb-1.5">
              {state?.connected ? 'Replace key' : 'API key'}
            </label>
            <input
              ref={inputRef}
              type="password"
              className="field font-mono text-[12px]"
              placeholder="sk-or-v1-…"
              value={key}
              onChange={(e) => { setKey(e.target.value); setOk(false); setError(null) }}
              onKeyDown={(e) => e.key === 'Enter' && key && save()}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-[11.5px] text-ink-faint mt-1.5 leading-relaxed">
              Stored in the local gitignored database, never returned to the browser, and
              only ever sent to openrouter.ai.{' '}
              <a
                className="text-flame-700 underline underline-offset-2"
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
              >
                Get a key
              </a>
            </p>
          </div>

          <div>
            <label className="mono-label block mb-1.5">Model</label>
            <input
              className="field font-mono text-[12px]"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {MODELS.map((m) => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  className={cx(
                    'chip ring-1 font-mono text-[10.5px] transition',
                    model === m ? 'bg-ink text-paper ring-ink' : 'bg-paper ring-paper-edge text-ink-soft hover:ring-ink-faint/50',
                  )}
                >
                  {m.split('/')[1]}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-inset ring-1 ring-flame-200 bg-flame-50 px-4 py-3 text-[12.5px] text-verdict-no leading-relaxed">
              {error}
            </div>
          )}
          {ok && !error && (
            <div className="rounded-inset ring-1 ring-emerald-200 bg-emerald-50 px-4 py-3 text-[12.5px] text-verdict-yes">
              Verified and saved. Natural language is on.
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button className="btn-quiet h-9" onClick={onClose}>Close</button>
            <button className="btn-flame h-9" onClick={save} disabled={busy || (!key && model === state?.model)}>
              {busy ? <><Spinner /> Verifying</> : state?.connected && !key ? 'Save model' : 'Verify & save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
