'use client'

import * as React from 'react'
import { AxisBar, ScoreDial, SeverityTag, VerdictChip, cx } from '../primitives'
import type { Check, Facts, Scorecard } from '../types'

const LAYER_LABEL: Record<string, string> = {
  L0: 'Distribution & manifest', L1: 'Token layer', L2: 'Cascade & CSS delivery',
  L3: 'Component contract', L4: 'Variant layer', L5: 'Type surface',
  L6: 'Knowledge base', L7: 'Enforcement', L8: 'Provenance & drift',
}

export function ReportPanel({
  facts, before, after, selected, onSelect, onConvert, converting,
}: {
  facts: Facts
  before: Scorecard
  after: Scorecard | null
  selected: string[]
  onSelect: (names: string[]) => void
  onConvert: () => void
  converting: boolean
}) {
  const [showPassing, setShowPassing] = React.useState(false)
  const failing = before.checks.filter((c) => c.status === 'fail')
  const unscored = before.checks.filter((c) => c.status === 'unscored')
  const passing = before.checks.filter((c) => c.status === 'pass')

  const grouped = React.useMemo(() => {
    const shown = showPassing ? before.checks : [...failing, ...unscored]
    const map = new Map<string, Check[]>()
    for (const c of shown) {
      if (!map.has(c.layer)) map.set(c.layer, [])
      map.get(c.layer)!.push(c)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [before.checks, failing, unscored, showPassing])

  return (
    <div className="px-8 py-7 space-y-7">
      {/* ---- the verdict, stated plainly ---- */}
      <section className="card overflow-hidden">
        <div className="relative bg-glow-hero px-8 py-7 text-white">
          <div className="absolute inset-0 texture-dots opacity-[.18]" aria-hidden />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="text-[12.5px] font-medium opacity-80 mb-2">
                Agent readiness
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-[52px] font-semibold leading-none tracking-[-.04em]">
                  {after ? after.composite : before.composite}
                </span>
                {after && (
                  <span className="text-[20px] font-medium opacity-75">
                    was {before.composite}
                  </span>
                )}
              </div>
              <p className="mt-3 text-[15px] font-medium max-w-[46ch]">
                {(after ?? before).verdict.headline}
              </p>
              <p className="mt-1 text-[13px] opacity-85 max-w-[56ch] leading-relaxed">
                {(after ?? before).verdict.meaning}
              </p>
            </div>
            <div className="pill-glass px-4 h-8 flex items-center text-[12.5px] font-semibold text-ink">
              <span className={cx('h-1.5 w-1.5 rounded-full mr-2', {
                no: 'bg-verdict-no', maybe: 'bg-verdict-maybe', yes: 'bg-verdict-yes',
              }[(after ?? before).verdict.key])} />
              {(after ?? before).verdict.label}
            </div>
          </div>
        </div>

        <div className="grid gap-7 px-8 py-6 md:grid-cols-2">
          <div className="space-y-2.5">
            <div className="mono-label">By axis</div>
            {before.axes.map((a, i) => (
              <AxisBar key={a.id} label={a.label} before={a.value} after={after?.axes[i]?.value ?? null} />
            ))}
          </div>
          <div className="space-y-2.5">
            <div className="mono-label">Findings</div>
            <div className="grid grid-cols-2 gap-2.5">
              <Stat n={before.counts.blockers} label="blockers" tone="bad" />
              <Stat n={failing.length} label="failing" tone="bad" />
              <Stat n={passing.length} label="passing" tone="good" />
              <Stat n={unscored.length} label="unscored" tone="flat" />
            </div>
            {before.appliedCap && (
              <p className="text-[12px] text-ink-soft leading-relaxed pt-1">
                <span className="font-medium text-verdict-no">Capped at {before.appliedCap.cap}.</span>{' '}
                {before.appliedCap.reason}. The uncapped score would be {before.uncapped}.
              </p>
            )}
            {facts.degraded && (
              <p className="text-[12px] text-verdict-maybe leading-relaxed pt-1">
                Degraded read — {facts.degradedReason}. Contract checks report{' '}
                <span className="font-mono">unscored</span> rather than passing, so this score
                is a floor, not a ceiling.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ---- what to convert ---- */}
      {!after && (
        <section className="card p-6">
          <div className="flex items-baseline justify-between gap-4 mb-1">
            <h3 className="text-[15px] font-medium">Convert to a three-layer contract</h3>
            <span className="mono-label">{selected.length} selected</span>
          </div>
          <p className="text-[13px] text-ink-soft mb-4 max-w-[68ch] leading-relaxed">
            Pick the components to convert. Each one becomes code with closed unions and tokens
            (L1), a machine-readable contract (L2), and knowledge an agent reads before it picks
            (L3). Your source is never modified.
          </p>
          <div className="flex flex-wrap gap-2 mb-5">
            {facts.components.map((c) => {
              const on = selected.includes(c.name)
              return (
                <button
                  key={c.name}
                  onClick={() => onSelect(on ? selected.filter((n) => n !== c.name) : [...selected, c.name])}
                  className={cx(
                    'chip ring-1 h-8 px-3.5 text-[12.5px] transition',
                    on
                      ? 'bg-ink text-paper ring-ink'
                      : 'bg-white ring-paper-edge text-ink-soft hover:ring-ink-faint/50',
                  )}
                >
                  {c.name}
                  <span className={cx('font-mono text-[10px]', on ? 'opacity-70' : 'text-ink-faint')}>
                    {c.openVariants.length ? `${c.openVariants.length} open` : `${c.rawValues.length} raw`}
                  </span>
                </button>
              )
            })}
          </div>
          <button className="btn-flame" onClick={onConvert} disabled={!selected.length || converting}>
            {converting ? 'Converting…' : `Convert ${selected.length} component${selected.length === 1 ? '' : 's'}`}
          </button>
        </section>
      )}

      {/* ---- ranked fixes ---- */}
      {before.ladder.length > 0 && (
        <section className="card p-6">
          <h3 className="text-[15px] font-medium mb-1">What to do first</h3>
          <p className="text-[13px] text-ink-soft mb-4 max-w-[68ch] leading-relaxed">
            Ranked by points bought per hour, not by severity. Severity says what hurts;
            points-per-hour says what to do on Monday.
          </p>
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-ink-faint">
                  <th className="mono-label text-left pb-2 font-normal">Fix</th>
                  <th className="mono-label text-right pb-2 font-normal w-16">Hours</th>
                  <th className="mono-label text-right pb-2 font-normal w-16">Points</th>
                  <th className="mono-label text-right pb-2 font-normal w-16">Pts/h</th>
                </tr>
              </thead>
              <tbody>
                {before.ladder.slice(0, 8).map((r) => (
                  <tr key={r.id} className="border-t border-paper-sunken">
                    <td className="py-2.5 pr-4">
                      <div className="font-medium">{r.title}</div>
                      <div className="text-[12px] text-ink-soft mt-0.5">{r.fix}</div>
                    </td>
                    <td className="py-2.5 text-right font-mono text-[12px] text-ink-faint tabular-nums">{r.hours}</td>
                    <td className="py-2.5 text-right font-mono text-[12px] text-ink-faint tabular-nums">+{r.points}</td>
                    <td className="py-2.5 text-right font-mono text-[12px] font-medium tabular-nums">{r.perHour}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---- every finding, with its evidence ---- */}
      <section className="card p-6">
        <div className="flex items-baseline justify-between gap-4 mb-1">
          <h3 className="text-[15px] font-medium">Findings</h3>
          <button className="btn-quiet h-7 text-[12px]" onClick={() => setShowPassing((v) => !v)}>
            {showPassing ? 'Hide passing' : `Show all ${before.checks.length}`}
          </button>
        </div>
        <p className="text-[13px] text-ink-soft mb-5 max-w-[68ch] leading-relaxed">
          Every finding carries the line that proves it. A finding without evidence is an
          opinion, and you cannot check an opinion in ten seconds.
        </p>

        <div className="space-y-5">
          {grouped.map(([layer, checks]) => (
            <div key={layer}>
              <div className="flex items-baseline gap-2.5 mb-2">
                <span className="font-mono text-[11px] font-medium text-ink">{layer}</span>
                <span className="text-[12px] text-ink-faint">{LAYER_LABEL[layer]}</span>
              </div>
              <div className="space-y-1.5">
                {checks.map((c) => <Finding key={c.id} check={c} />)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Stat({ n, label, tone }: { n: number; label: string; tone: 'bad' | 'good' | 'flat' }) {
  return (
    <div className={cx(
      'rounded-inset ring-1 px-3.5 py-2.5',
      tone === 'bad' && 'bg-flame-50 ring-flame-200',
      tone === 'good' && 'bg-emerald-50 ring-emerald-200',
      tone === 'flat' && 'bg-paper-sunken ring-paper-edge',
    )}>
      <div className={cx(
        'text-[22px] font-semibold leading-none tabular-nums',
        tone === 'bad' && 'text-verdict-no',
        tone === 'good' && 'text-verdict-yes',
        tone === 'flat' && 'text-ink-faint',
      )}>{n}</div>
      <div className="mono-label mt-1">{label}</div>
    </div>
  )
}

function Finding({ check }: { check: Check }) {
  const [open, setOpen] = React.useState(false)
  const failing = check.status === 'fail'

  return (
    <div className={cx(
      'rounded-inset ring-1 transition',
      failing ? 'ring-paper-edge bg-paper' : check.status === 'unscored' ? 'ring-paper-edge bg-paper-sunken/50' : 'ring-paper-edge bg-white',
    )}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left"
      >
        <span className="pt-0.5">
          {check.status === 'pass'
            ? <span className="chip ring-1 ring-emerald-200 bg-emerald-50 text-verdict-yes font-mono text-[10px]">PASS</span>
            : check.status === 'unscored'
              ? <span className="chip ring-1 ring-paper-edge bg-paper-sunken text-ink-faint font-mono text-[10px]">N/A</span>
              : <SeverityTag severity={check.severity} />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-medium">{check.title}</span>
          <span className="block text-[12.5px] text-ink-soft mt-0.5 leading-relaxed">{check.detail}</span>
          {check.status === 'unscored' && check.unscoredReason && (
            <span className="block text-[12px] text-verdict-maybe mt-1">
              Not measured — {check.unscoredReason}. Reported as unscored rather than passing.
            </span>
          )}
        </span>
        {check.evidence.length > 0 && (
          <span className="mono-label pt-1 shrink-0">{open ? '−' : `${check.evidence.length} ✓`}</span>
        )}
      </button>

      {open && check.evidence.length > 0 && (
        <div className="px-4 pb-3.5 -mt-0.5 space-y-1.5">
          {check.evidence.map((e, i) => (
            <div key={i} className="rounded-lg bg-paper-sunken/70 px-3 py-2">
              <div className="evidence font-medium text-ink-soft">
                {e.file}{e.line ? `:${e.line}` : ''}
              </div>
              <div className="evidence mt-0.5">{e.excerpt}</div>
            </div>
          ))}
          {check.fix && (
            <div className="text-[12.5px] text-ink-soft pt-1">
              <span className="font-medium text-ink">Fix — </span>{check.fix}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
