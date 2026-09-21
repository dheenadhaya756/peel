'use client'

import * as React from 'react'
import { Empty, Spinner, VerdictChip, cx } from './primitives'
import { ReportPanel } from './panels/report'
import { CodePanel, VisualPanel } from './panels/visual'
import { ConnectButton } from './connect'
import type { ConvertResult, SystemDetail, SystemSummary } from './types'

type Tab = 'report' | 'visual' | 'code' | 'knowledge'

export function Workbench() {
  const [systems, setSystems] = React.useState<SystemSummary[]>([])
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<SystemDetail | null>(null)
  const [result, setResult] = React.useState<ConvertResult | null>(null)
  const [tab, setTab] = React.useState<Tab>('report')
  const [selected, setSelected] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState<string | null>(null)
  const [toast, setToast] = React.useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  const say = (tone: 'ok' | 'bad', text: string) => {
    setToast({ tone, text })
    setTimeout(() => setToast(null), 6000)
  }

  const loadSystems = React.useCallback(async () => {
    const r = await fetch('/api/systems').then((x) => x.json())
    setSystems(r.systems ?? [])
    return r.systems as SystemSummary[]
  }, [])

  const loadDetail = React.useCallback(async (id: string) => {
    const d: SystemDetail = await fetch(`/api/systems/${id}`).then((x) => x.json())
    setDetail(d)
    // Default the selection to the two components with the most to fix.
    if (d.facts && !d.converted) {
      const ranked = [...d.facts.components]
        .sort((a, b) => (b.openVariants.length * 10 + b.rawValues.length) - (a.openVariants.length * 10 + a.rawValues.length))
      setSelected(ranked.slice(0, 2).map((c) => c.name))
    } else {
      setSelected(d.selected)
    }
    return d
  }, [])

  React.useEffect(() => { loadSystems() }, [loadSystems])
  React.useEffect(() => {
    if (activeId) { loadDetail(activeId); setResult(null); setTab('report') }
  }, [activeId, loadDetail])

  async function ingest(payload: Record<string, unknown> | FormData) {
    setBusy('ingest')
    try {
      const res = await fetch('/api/systems', {
        method: 'POST',
        ...(payload instanceof FormData
          ? { body: payload }
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Ingest failed')
      await loadSystems()
      setActiveId(data.id)
      say('ok', `Ingested ${data.name} — ${data.fileCount} files, scored ${data.before.composite}/100.`)
    } catch (e) {
      say('bad', e instanceof Error ? e.message : 'Ingest failed')
    } finally {
      setBusy(null)
    }
  }

  async function runConvert() {
    if (!activeId) return
    setBusy('convert')
    try {
      const res = await fetch(`/api/systems/${activeId}/convert`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ components: selected }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Conversion failed')
      setResult(data)
      await loadSystems()
      await loadDetail(activeId)
      setTab('visual')
      say('ok', `${data.before.composite} → ${data.after.composite}. ${data.todos.length} open question(s).`)
    } catch (e) {
      say('bad', e instanceof Error ? e.message : 'Conversion failed')
    } finally {
      setBusy(null)
    }
  }

  async function publish() {
    if (!activeId) return
    const repo = window.prompt('Target GitHub repository URL', detail?.origin ?? '')
    if (!repo) return
    setBusy('publish')
    try {
      const res = await fetch(`/api/systems/${activeId}/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(`${data.error}${data.how ? ` — ${data.how}` : ''}`)
      say('ok', `Pull request opened: ${data.url}`)
      window.open(data.url, '_blank')
    } catch (e) {
      say('bad', e instanceof Error ? e.message : 'Publish failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-paper">
      <TopBar />

      <div className="flex-1 min-h-0 flex">
        <Rail
          systems={systems}
          activeId={activeId}
          onSelect={setActiveId}
          onIngest={ingest}
          busy={busy === 'ingest'}
        />

        <main className="flex-1 min-w-0 flex flex-col border-x border-paper-edge bg-paper">
          {!detail ? (
            <Welcome onSample={() => ingest({ sample: true })} busy={busy === 'ingest'} />
          ) : (
            <>
              <Tabs
                tab={tab}
                setTab={setTab}
                detail={detail}
                onExport={() => window.open(`/api/systems/${activeId}/export`, '_blank')}
                onPublish={publish}
                busy={busy}
              />
              <div className="flex-1 min-h-0 overflow-y-auto">
                {tab === 'report' && detail.facts && detail.before && (
                  <ReportPanel
                    facts={detail.facts}
                    before={detail.before}
                    after={detail.after}
                    selected={selected}
                    onSelect={setSelected}
                    onConvert={runConvert}
                    converting={busy === 'convert'}
                  />
                )}
                {tab === 'visual' && <VisualPanel system={detail} result={result} />}
                {tab === 'code' && <CodePanel system={detail} />}
                {tab === 'knowledge' && <KnowledgePanel system={detail} />}
              </div>
            </>
          )}
        </main>

        <Chat systemId={activeId} systemName={detail?.name ?? null} />
      </div>

      {toast && (
        <div className={cx(
          'fixed bottom-5 left-1/2 -translate-x-1/2 z-50 animate-rise',
          'pill-glass px-5 py-3 max-w-[70ch] text-[13px] flex items-start gap-2.5',
        )}>
          <span className={cx('mt-1.5 h-1.5 w-1.5 rounded-full shrink-0',
            toast.tone === 'ok' ? 'bg-verdict-yes' : 'bg-verdict-no')} />
          <span className="text-ink leading-relaxed">{toast.text}</span>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------- top bar */

function TopBar() {
  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-paper-edge bg-paper-raised">
      <div className="flex items-center gap-2.5">
        <span className="h-7 w-7 rounded-lg bg-glow-hero shadow-glow" />
        <span className="text-[15px] font-semibold tracking-tight">Peel</span>
        <span className="text-[12.5px] text-ink-faint hidden sm:inline">
          design systems an agent can build from
        </span>
      </div>
      <div className="flex items-center gap-2">
        <ConnectButton />
        <span className="chip ring-1 ring-paper-edge bg-paper-sunken text-ink-faint font-mono">
          MCP ready
        </span>
      </div>
    </header>
  )
}

/* ---------------------------------------------------------------------- rail */

function Rail({ systems, activeId, onSelect, onIngest, busy }: {
  systems: SystemSummary[]
  activeId: string | null
  onSelect: (id: string) => void
  onIngest: (p: Record<string, unknown> | FormData) => void
  busy: boolean
}) {
  const [url, setUrl] = React.useState('')
  const fileRef = React.useRef<HTMLInputElement>(null)

  return (
    <aside className="w-[290px] shrink-0 flex flex-col bg-paper-raised">
      <div className="p-4 space-y-2.5 border-b border-paper-edge">
        <div className="mono-label">Add a design system</div>
        <form
          onSubmit={(e) => { e.preventDefault(); if (url.trim()) { onIngest({ url }); setUrl('') } }}
          className="space-y-2"
        >
          <input
            className="field h-10 text-[13px]"
            placeholder="github.com/owner/repo"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
          />
          <div className="flex gap-2">
            <button type="submit" className="btn-flame flex-1 h-9 text-[12.5px]" disabled={busy || !url.trim()}>
              {busy ? <Spinner /> : 'Connect'}
            </button>
            <button
              type="button"
              className="btn-ghost h-9 px-3 text-[12.5px]"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              .zip
            </button>
          </div>
        </form>
        <input
          ref={fileRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const fd = new FormData()
            fd.append('file', f)
            onIngest(fd)
            e.target.value = ''
          }}
        />
        <button
          className="btn-quiet w-full h-8 text-[12px] justify-start"
          onClick={() => onIngest({ sample: true })}
          disabled={busy}
        >
          + Use the bundled sample
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-1.5">
        {!systems.length && (
          <p className="text-[12.5px] text-ink-faint px-2 py-6 leading-relaxed text-center">
            Nothing ingested yet.
          </p>
        )}
        {systems.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={cx(
              'w-full text-left rounded-inset px-3.5 py-3 ring-1 transition',
              activeId === s.id
                ? 'bg-flame-50 ring-flame-200'
                : 'bg-paper ring-paper-edge hover:ring-ink-faint/40',
            )}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[13.5px] font-medium truncate">{s.name}</span>
              <span className="font-mono text-[15px] font-semibold tabular-nums shrink-0">
                {s.after ? (
                  <><span className="text-ink-faint text-[11px]">{s.before?.composite}→</span>
                    <span className="text-flame-700">{s.after.composite}</span></>
                ) : (
                  <span className={s.before && s.before.composite < 40 ? 'text-verdict-no' : 'text-ink'}>
                    {s.before?.composite ?? '—'}
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <VerdictChip verdict={(s.after ?? s.before)?.verdict ?? null} />
              <span className="font-mono text-[10px] text-ink-faint">{s.componentCount} comp</span>
            </div>
          </button>
        ))}
      </div>

      <div className="p-3.5 border-t border-paper-edge">
        <div className="mono-label mb-1.5">Connect your IDE</div>
        <code className="block font-mono text-[10px] leading-relaxed text-ink-faint break-all bg-paper-sunken rounded-lg px-2.5 py-2">
          node ./mcp/server.mjs
        </code>
      </div>
    </aside>
  )
}

/* --------------------------------------------------------------------- tabs */

function Tabs({ tab, setTab, detail, onExport, onPublish, busy }: {
  tab: Tab; setTab: (t: Tab) => void; detail: SystemDetail
  onExport: () => void; onPublish: () => void; busy: string | null
}) {
  const tabs: Array<[Tab, string, boolean]> = [
    ['report', 'Report', true],
    ['visual', 'Visual', detail.converted],
    ['code', 'Code', detail.converted],
    ['knowledge', 'Knowledge base', detail.converted],
  ]
  return (
    <div className="h-[52px] shrink-0 flex items-center justify-between gap-4 px-5 border-b border-paper-edge bg-paper-raised">
      <div className="flex items-center gap-1">
        {tabs.map(([id, label, enabled]) => (
          <button
            key={id}
            onClick={() => enabled && setTab(id)}
            disabled={!enabled}
            className={cx(
              'h-8 px-3.5 rounded-pill text-[13px] font-medium transition',
              tab === id ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-paper-sunken',
              !enabled && 'opacity-35 pointer-events-none',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button className="btn-ghost h-8 text-[12.5px]" onClick={onExport} disabled={!detail.converted}>
          Download .zip
        </button>
        <button className="btn-primary h-8 text-[12.5px]" onClick={onPublish} disabled={!detail.converted || busy === 'publish'}>
          {busy === 'publish' ? <Spinner /> : 'Open PR'}
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ welcome */

function Welcome({ onSample, busy }: { onSample: () => void; busy: boolean }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-[560px] text-center">
        <div className="mx-auto mb-7 h-40 w-full rounded-card bg-discs-warm shadow-card relative overflow-hidden">
          <div className="absolute inset-0 texture-dots opacity-20" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="pill-glass px-5 py-3 text-left">
              <div className="text-[11px] font-mono uppercase tracking-[.14em] text-ink-soft">Verdict</div>
              <div className="text-[15px] font-semibold text-ink">Not agentic → Agentic</div>
            </div>
          </div>
        </div>
        <h1 className="text-[27px] font-semibold tracking-display mb-2.5">
          Find out whether an agent can build from your design system.
        </h1>
        <p className="text-[14px] text-ink-soft leading-relaxed mb-7 max-w-[52ch] mx-auto">
          Connect a GitHub repo or drop in a zip. Peel measures it against nine layers,
          tells you plainly whether it is agentic, converts it into a three-layer contract,
          and shows you every component before and after.
        </p>
        <button className="btn-flame h-11 px-6" onClick={onSample} disabled={busy}>
          {busy ? <Spinner /> : 'Try it with the bundled sample'}
        </button>
        <p className="text-[12px] text-ink-faint mt-4">
          A real design system with real defects — scores 12/100.
        </p>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- knowledge base */

function KnowledgePanel({ system }: { system: SystemDetail }) {
  const KB = ['AGENTS.md', 'llms.txt', 'RULES.md', 'curation.json', 'design.md', 'manifest.json', 'SCORECARD.md']
  const present = KB.filter((f) => system.output.includes(f))
  const [active, setActive] = React.useState(present[0] ?? null)
  const [body, setBody] = React.useState('')

  React.useEffect(() => {
    if (!active) return
    fetch(`/api/systems/${system.id}/file?path=${encodeURIComponent(active)}`)
      .then((r) => r.json())
      .then((d) => setBody(d.content ?? d.error ?? ''))
  }, [active, system.id])

  if (!system.converted) {
    return <Empty title="No knowledge base yet" body="Layer 3 is generated from layer 2, so it appears once the system has been converted." />
  }

  return (
    <div className="px-8 py-7">
      <h3 className="text-[15px] font-medium mb-1">Layer 3 — knowledge</h3>
      <p className="text-[13px] text-ink-soft mb-5 max-w-[70ch] leading-relaxed">
        Generated <em>from</em> the contract layer, never written alongside it. That direction is
        what stops the docs and the code drifting apart.
      </p>
      <div className="flex flex-wrap gap-1.5 mb-5">
        {present.map((f) => (
          <button
            key={f}
            onClick={() => setActive(f)}
            className={cx(
              'chip ring-1 h-8 px-3.5 font-mono text-[11.5px] transition',
              active === f ? 'bg-ink text-paper ring-ink' : 'bg-white ring-paper-edge text-ink-soft hover:ring-ink-faint/50',
            )}
          >
            {f}
          </button>
        ))}
      </div>
      <pre className="card p-6 font-mono text-[12px] leading-[1.75] text-ink-soft whitespace-pre-wrap overflow-x-auto">
        {body || 'Loading…'}
      </pre>
    </div>
  )
}

/* ---------------------------------------------------------------------- chat */

function Chat({ systemId, systemName }: { systemId: string | null; systemName: string | null }) {
  const [log, setLog] = React.useState<Array<{ role: 'you' | 'peel'; text: string; tool?: string }>>([])
  const [input, setInput] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [router, setRouter] = React.useState<{ llm: boolean; model: string | null } | null>(null)
  const endRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [log])
  React.useEffect(() => { fetch('/api/chat').then((r) => r.json()).then(setRouter).catch(() => {}) }, [])

  async function send(text: string) {
    if (!text.trim()) return
    setLog((l) => [...l, { role: 'you', text }])
    setInput('')
    setBusy(true)
    try {
      // Only the last few turns travel — the tools carry the facts, not the transcript.
      const history = log.slice(-6).map((m) => ({
        role: m.role === 'you' ? ('user' as const) : ('assistant' as const),
        content: m.text,
      }))
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ systemId, message: text, history }),
      }).then((x) => x.json())
      setLog((l) => [...l, { role: 'peel', text: r.text, tool: r.tool }])
    } catch (e) {
      setLog((l) => [...l, { role: 'peel', text: String(e), tool: 'error' }])
    } finally {
      setBusy(false)
    }
  }

  const suggestions = ['score', 'findings', 'todos', 'Button', 'rules']

  return (
    <aside className="w-[330px] shrink-0 flex flex-col bg-paper-raised">
      <div className="px-4 h-[52px] shrink-0 flex items-center justify-between border-b border-paper-edge">
        <span className="text-[13.5px] font-medium">Ask</span>
        <span className="mono-label truncate max-w-[150px]">{systemName ?? 'no system'}</span>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3">
        {!log.length && (
          <div className="text-[12.5px] text-ink-soft leading-relaxed">
            <p className="mb-2.5">
              A fixed set of tools over the audit — it reads and regenerates through the
              engine, and cannot write a file directly. If a request doesn&apos;t map to a
              tool, it says so instead of guessing.
            </p>
            <p className="mb-3 text-[11.5px]">
              {router === null ? null : router.llm ? (
                <span className="text-verdict-yes">
                  Natural language on · <span className="font-mono">{router.model}</span>
                </span>
              ) : (
                <span className="text-verdict-maybe">
                  No model connected — intent matching is pattern-based. Use{' '}
                  <strong>Connect model</strong> in the header.
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button key={s} onClick={() => send(s)} className="chip ring-1 ring-paper-edge bg-paper hover:ring-ink-faint/50 font-mono text-[11px]">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {log.map((m, i) => (
          <div key={i} className={cx('rounded-inset px-3.5 py-2.5 text-[12.5px] leading-relaxed',
            m.role === 'you' ? 'bg-ink text-paper ml-6' : 'bg-paper ring-1 ring-paper-edge')}>
            {m.role === 'peel' && m.tool && (
              <div className="mono-label mb-1.5">{m.tool}</div>
            )}
            <div className="whitespace-pre-wrap break-words">{m.text}</div>
          </div>
        ))}
        {busy && <div className="text-[12px] text-ink-faint px-1"><Spinner /> thinking</div>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input) }}
        className="p-3 border-t border-paper-edge"
      >
        <input
          className="field h-10 text-[13px]"
          placeholder={systemId ? 'score · findings · Button · rules' : 'select a system first'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!systemId || busy}
        />
      </form>
    </aside>
  )
}
