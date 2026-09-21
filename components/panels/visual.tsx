'use client'

import * as React from 'react'
import { Empty, cx } from '../primitives'
import type { ConvertResult, SystemDetail } from '../types'

/**
 * The visual pane renders the generated visual book in an iframe rather than
 * re-implementing the before/after rendering here. One renderer, used in both
 * places — so what you review on screen is byte-for-byte what you hand over.
 */
export function VisualPanel({ system, result }: { system: SystemDetail; result: ConvertResult | null }) {
  const [reloadKey, setReloadKey] = React.useState(0)
  const components = result?.components ?? []

  if (!system.converted) {
    return (
      <Empty
        title="Nothing to show yet"
        body="The visual book is generated from the converted output, so there is nothing to render until the system has been converted. Run the conversion from the Report tab."
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 px-8 py-3.5 border-b border-paper-edge bg-paper-raised">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="mono-label shrink-0">Visual book</span>
          <span className="text-[12.5px] text-ink-soft truncate">
            {components.length || system.selected.length} component
            {(components.length || system.selected.length) === 1 ? '' : 's'}, before and after — rendered from the real code on both sides
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button className="btn-ghost h-8 text-[12.5px]" onClick={() => setReloadKey((k) => k + 1)}>
            Reload
          </button>
          <a className="btn-ghost h-8 text-[12.5px]" href={`/api/systems/${system.id}/book`} target="_blank" rel="noreferrer">
            Open full page
          </a>
          <a className="btn-primary h-8 text-[12.5px]" href={`/api/systems/${system.id}/book`} target="_blank" rel="noreferrer">
            Print to PDF
          </a>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-paper-sunken">
        <iframe
          key={reloadKey}
          src={`/api/systems/${system.id}/book`}
          title="Visual book"
          className="w-full h-full border-0 bg-paper"
        />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- code browser */

export function CodePanel({ system }: { system: SystemDetail }) {
  const [active, setActive] = React.useState<string | null>(null)
  const [content, setContent] = React.useState<string>('')
  const [loading, setLoading] = React.useState(false)

  const files = system.output.filter((f) => f !== 'visual-book.html')

  React.useEffect(() => {
    const first = files.find((f) => f.endsWith('.tsx')) ?? files[0]
    if (first && !active) setActive(first)
  }, [files, active])

  React.useEffect(() => {
    if (!active) return
    setLoading(true)
    fetch(`/api/systems/${system.id}/file?path=${encodeURIComponent(active)}`)
      .then((r) => r.json())
      .then((d) => setContent(d.content ?? d.error ?? ''))
      .catch((e) => setContent(String(e)))
      .finally(() => setLoading(false))
  }, [active, system.id])

  if (!system.converted) {
    return (
      <Empty
        title="No generated code yet"
        body="Convert the system first. Everything here is generated into a separate folder — your source is never modified."
      />
    )
  }

  const groups = groupFiles(files)

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[268px] shrink-0 border-r border-paper-edge overflow-y-auto no-scrollbar bg-paper-raised">
        <div className="px-4 py-3.5 border-b border-paper-edge">
          <div className="mono-label">Generated output</div>
          <div className="text-[12px] text-ink-soft mt-0.5">{files.length} files</div>
        </div>
        {groups.map(([dir, items]) => (
          <div key={dir} className="py-1.5">
            <div className="px-4 py-1 text-[11px] font-medium text-ink-faint">
              {dir}
            </div>
            {items.map((f) => (
              <button
                key={f.full}
                onClick={() => setActive(f.full)}
                className={cx(
                  'w-full text-left px-4 py-1.5 font-mono text-[11.5px] truncate transition',
                  active === f.full ? 'bg-flame-50 text-flame-800 font-medium' : 'text-ink-soft hover:bg-paper-sunken',
                )}
                title={f.full}
              >
                {f.name}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="px-6 py-3 border-b border-paper-edge bg-paper-raised flex items-center justify-between gap-4">
          <span className="font-mono text-[12px] text-ink-soft truncate">{active}</span>
          <button
            className="btn-quiet h-7 text-[12px]"
            onClick={() => navigator.clipboard?.writeText(content)}
          >
            Copy
          </button>
        </div>
        <pre className="flex-1 min-h-0 overflow-auto px-6 py-5 font-mono text-[12px] leading-[1.75] text-ink-soft whitespace-pre-wrap">
          {loading ? 'Loading…' : content}
        </pre>
      </div>
    </div>
  )
}

function groupFiles(files: string[]) {
  const map = new Map<string, Array<{ name: string; full: string }>>()
  for (const f of files) {
    const parts = f.split('/')
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '/'
    if (!map.has(dir)) map.set(dir, [])
    map.get(dir)!.push({ name: parts.at(-1)!, full: f })
  }
  return [...map.entries()].sort(([a], [b]) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)))
}
