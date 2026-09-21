'use client'

import * as React from 'react'
import { cx } from '../primitives'

export type Source = 'measured' | 'archetype' | 'model' | 'assumed'

export interface Proposal {
  name: string
  file: string
  exported: boolean
  purpose: string
  purposeSource: Source
  aliases: string[]
  aliasesSource: Source
  useInstead: Array<{ when: string; use: string }>
  useInsteadSource: Source
  variants: Record<string, string[]>
  defaultVariants: Record<string, string>
  props: Array<{ name: string; type: string; documented: boolean }>
  rawValues: number
  hasMarkup: boolean
  attention: string[]
}

/** Corrections a reviewer made, keyed by component name. */
export type Overrides = Record<string, {
  purpose?: string
  aliases?: string[]
  useInstead?: Array<{ when: string; use: string }>
  defaultVariants?: Record<string, string>
}>

const SOURCE_LABEL: Record<Source, { text: string; cls: string }> = {
  measured: { text: 'from source', cls: 'text-verdict-yes ring-emerald-200 bg-emerald-50' },
  archetype: { text: 'known pattern', cls: 'text-ink-soft ring-paper-edge bg-paper-sunken' },
  model: { text: 'generated', cls: 'text-verdict-maybe ring-amber-200 bg-amber-50' },
  assumed: { text: 'assumed', cls: 'text-verdict-maybe ring-amber-200 bg-amber-50' },
}

function SourceTag({ source }: { source: Source }) {
  const s = SOURCE_LABEL[source]
  return <span className={cx('chip ring-1 text-[10.5px]', s.cls)}>{s.text}</span>
}

/**
 * The curation gate.
 *
 * Everything is pre-filled from extraction, so the default action is to confirm.
 * Only what the extractor could not measure is flagged — a reviewer should be
 * looking at four things, not forty, or the gate becomes the reason nobody uses it.
 */
export function ReviewPanel({
  proposals, onBack, onConfirm, converting,
}: {
  proposals: Proposal[]
  onBack: () => void
  onConfirm: (overrides: Overrides) => void
  converting: boolean
}) {
  const [overrides, setOverrides] = React.useState<Overrides>({})
  const [open, setOpen] = React.useState<string | null>(
    proposals.find((p) => p.attention.length)?.name ?? proposals[0]?.name ?? null,
  )

  const set = (name: string, patch: Overrides[string]) =>
    setOverrides((o) => ({ ...o, [name]: { ...o[name], ...patch } }))

  const flagged = proposals.filter((p) => p.attention.length).length
  const edited = Object.keys(overrides).length

  return (
    <div className="px-8 py-7 space-y-5">
      <section className="card overflow-hidden">
        <div className="relative bg-mesh-warm px-7 py-6">
          <div className="absolute inset-0 texture-dots opacity-[.14]" aria-hidden />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="mono-label text-ink-soft">Before anything is written</div>
              <h2 className="text-[21px] font-semibold mt-1 tracking-display">
                Confirm the contract
              </h2>
              <p className="text-[13px] text-ink-soft mt-1.5 max-w-[62ch] leading-relaxed">
                Everything below was extracted or inferred and is ready to go. A machine can
                read a prop surface; it cannot know a component is misnamed or what your team
                means by &ldquo;use this instead&rdquo;. Correct anything wrong — the rest is
                already right.
              </p>
            </div>
            <div className="pill-glass px-4 py-2.5 text-[12.5px]">
              <div className="font-semibold text-ink">{proposals.length} component{proposals.length === 1 ? '' : 's'}</div>
              <div className="text-ink-soft mt-0.5">
                {flagged ? `${flagged} worth a look` : 'nothing flagged'}
                {edited ? ` · ${edited} corrected` : ''}
              </div>
            </div>
          </div>
        </div>
      </section>

      {proposals.map((p) => {
        const o = overrides[p.name] ?? {}
        const isOpen = open === p.name
        return (
          <section key={p.name} className="card overflow-hidden">
            <button
              onClick={() => setOpen(isOpen ? null : p.name)}
              className="w-full flex items-start justify-between gap-4 px-6 py-4 text-left"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="text-[15px] font-medium">{p.name}</span>
                  {!p.exported && (
                    <span className="chip ring-1 ring-flame-200 bg-flame-50 text-verdict-no">not exported</span>
                  )}
                  {p.attention.length > 0 && (
                    <span className="chip ring-1 ring-amber-200 bg-amber-50 text-verdict-maybe">
                      {p.attention.length} to check
                    </span>
                  )}
                </div>
                <div className="text-[12.5px] text-ink-soft mt-1 line-clamp-2 max-w-[80ch]">
                  {o.purpose ?? p.purpose}
                </div>
                <div className="font-mono text-[11px] text-ink-faint mt-1">{p.file}</div>
              </div>
              <span className="mono-label pt-1 shrink-0">{isOpen ? 'collapse' : 'review'}</span>
            </button>

            {isOpen && (
              <div className="px-6 pb-6 space-y-5 border-t border-paper-edge pt-5">
                {p.attention.length > 0 && (
                  <div className="rounded-inset ring-1 ring-amber-200 bg-amber-50/60 px-4 py-3">
                    <div className="text-[12px] font-medium text-verdict-maybe mb-1.5">Worth a look</div>
                    <ul className="space-y-1">
                      {p.attention.map((a, i) => (
                        <li key={i} className="text-[12.5px] text-ink-soft leading-relaxed">— {a}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <Field label="Purpose" source={p.purposeSource}>
                  <textarea
                    className="w-full rounded-inset bg-white ring-1 ring-paper-edge px-3.5 py-2.5 text-[13px] leading-relaxed outline-none focus:ring-2 focus:ring-flame-400 resize-y"
                    rows={2}
                    value={o.purpose ?? p.purpose}
                    onChange={(e) => set(p.name, { purpose: e.target.value })}
                  />
                </Field>

                <Field
                  label="Also known as"
                  source={p.aliasesSource}
                  hint="How a model searching from a screenshot would name this. Comma separated."
                >
                  <input
                    className="field h-10 text-[13px]"
                    value={(o.aliases ?? p.aliases).join(', ')}
                    onChange={(e) => set(p.name, { aliases: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  />
                </Field>

                <Field
                  label="When NOT to use"
                  source={p.useInsteadSource}
                  hint="The field that decides between lookalikes. Without it an agent picks by appearance."
                >
                  <div className="space-y-2">
                    {(o.useInstead ?? p.useInstead).map((u, i) => (
                      <div key={i} className="grid grid-cols-[1fr_auto_180px_auto] items-center gap-2">
                        <input
                          className="field h-9 text-[12.5px]"
                          value={u.when}
                          onChange={(e) => {
                            const next = [...(o.useInstead ?? p.useInstead)]
                            next[i] = { ...next[i], when: e.target.value }
                            set(p.name, { useInstead: next })
                          }}
                        />
                        <span className="text-[12px] text-ink-faint">use</span>
                        <input
                          className="field h-9 text-[12.5px] font-mono"
                          value={u.use}
                          onChange={(e) => {
                            const next = [...(o.useInstead ?? p.useInstead)]
                            next[i] = { ...next[i], use: e.target.value }
                            set(p.name, { useInstead: next })
                          }}
                        />
                        <button
                          className="btn-quiet h-8 px-2 text-[16px] leading-none"
                          onClick={() => set(p.name, { useInstead: (o.useInstead ?? p.useInstead).filter((_, j) => j !== i) })}
                          title="remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      className="btn-ghost h-8 text-[12px]"
                      onClick={() => set(p.name, { useInstead: [...(o.useInstead ?? p.useInstead), { when: '', use: '' }] })}
                    >
                      + Add a rule
                    </button>
                  </div>
                </Field>

                {Object.keys(p.variants).length > 0 && (
                  <Field label="Variant axes" source="measured" hint="Read from the source. Pick the default for each.">
                    <div className="space-y-2.5">
                      {Object.entries(p.variants).map(([axis, values]) => {
                        const current = (o.defaultVariants ?? {})[axis] ?? p.defaultVariants[axis] ?? values[0]
                        const declared = Boolean(p.defaultVariants[axis])
                        return (
                          <div key={axis}>
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="font-mono text-[12px] font-medium">{axis}</span>
                              {!declared && (
                                <span className="chip ring-1 ring-amber-200 bg-amber-50 text-verdict-maybe">
                                  no default declared
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {values.map((v) => (
                                <button
                                  key={v}
                                  onClick={() => set(p.name, { defaultVariants: { ...(o.defaultVariants ?? p.defaultVariants), [axis]: v } })}
                                  className={cx(
                                    'chip ring-1 font-mono text-[11px] transition',
                                    current === v
                                      ? 'bg-ink text-paper ring-ink'
                                      : 'bg-paper ring-paper-edge text-ink-soft hover:ring-ink-faint/50',
                                  )}
                                >
                                  {v}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </Field>
                )}

                <div className="text-[12px] text-ink-faint">
                  {p.props.length} prop{p.props.length === 1 ? '' : 's'} ·{' '}
                  {p.props.filter((x) => x.documented).length} documented in source ·{' '}
                  {p.rawValues} raw value{p.rawValues === 1 ? '' : 's'} ·{' '}
                  {p.hasMarkup ? 'markup recovered' : 'no markup recovered'}
                </div>
              </div>
            )}
          </section>
        )
      })}

      <div className="flex items-center justify-between gap-4 pt-1">
        <button className="btn-ghost" onClick={onBack} disabled={converting}>
          Back
        </button>
        <div className="flex items-center gap-3">
          <span className="text-[12.5px] text-ink-faint">
            {edited ? `${edited} correction${edited === 1 ? '' : 's'} will be applied` : 'no corrections — proposal accepted as-is'}
          </span>
          <button className="btn-flame" onClick={() => onConfirm(overrides)} disabled={converting}>
            {converting ? 'Converting…' : `Convert ${proposals.length} component${proposals.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, source, hint, children }: {
  label: string
  source: Source
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[12.5px] font-medium">{label}</span>
        <SourceTag source={source} />
      </div>
      {hint && <p className="text-[12px] text-ink-faint mb-2 leading-relaxed max-w-[74ch]">{hint}</p>}
      {children}
    </div>
  )
}
