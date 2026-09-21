'use client'

import * as React from 'react'

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

/* ---------------------------------------------------------------- verdict chip */

const VERDICT_STYLE = {
  no: 'text-verdict-no ring-flame-200 bg-flame-50',
  maybe: 'text-verdict-maybe ring-amber-200 bg-amber-50',
  yes: 'text-verdict-yes ring-emerald-200 bg-emerald-50',
} as const

export function VerdictChip({ verdict, size = 'sm' }: {
  verdict: { key: 'no' | 'maybe' | 'yes'; label: string } | null
  size?: 'sm' | 'lg'
}) {
  if (!verdict) {
    return <span className="chip ring-paper-edge bg-paper-sunken text-ink-faint">unscored</span>
  }
  return (
    <span
      className={cx(
        'chip ring-1',
        VERDICT_STYLE[verdict.key],
        size === 'lg' && 'h-8 px-4 text-[13px]',
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', {
        no: 'bg-verdict-no', maybe: 'bg-verdict-maybe', yes: 'bg-verdict-yes',
      }[verdict.key])} />
      {verdict.label}
    </span>
  )
}

/* ------------------------------------------------------------------ score ring */

export function ScoreDial({ before, after }: { before: number; after?: number | null }) {
  const shown = after ?? before
  const pct = Math.max(0, Math.min(100, shown))
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="text-[44px] font-semibold leading-none tracking-[-.04em]">
        {after != null ? (
          <>
            <span className="text-ink-faint text-[28px]">{before}</span>
            <span className="text-ink-faint text-[22px] mx-1.5">→</span>
            <span className="text-flame-700">{after}</span>
          </>
        ) : (
          before
        )}
      </span>
      <span className="mono-label pb-1">/ 100</span>
      <span className="sr-only">{pct} out of 100</span>
    </div>
  )
}

/* ------------------------------------------------------------------- axis bars */

export function AxisBar({ label, before, after }: {
  label: string
  before: number | null
  after?: number | null
}) {
  return (
    <div className="grid grid-cols-[84px_1fr_62px] items-center gap-3">
      <span className="text-[12px] text-ink-soft truncate">{label}</span>
      <span className="relative h-[7px] rounded-pill bg-paper-sunken overflow-hidden">
        {after != null && (
          <i className="absolute inset-y-0 left-0 rounded-pill bg-paper-edge" style={{ width: `${before ?? 0}%` }} />
        )}
        <i
          className="absolute inset-y-0 left-0 rounded-pill bg-gradient-to-r from-peach to-flame-500 transition-[width] duration-700"
          style={{ width: `${(after ?? before) ?? 0}%` }}
        />
      </span>
      <span className="font-mono text-[11px] text-ink-faint text-right tabular-nums">
        {before ?? '—'}{after != null ? ` → ${after}` : ''}
      </span>
    </div>
  )
}

/* ---------------------------------------------------------------------- misc */

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx('inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-r-transparent animate-spin', className)}
      aria-hidden
    />
  )
}

export function Empty({ icon, title, body, action }: {
  icon?: React.ReactNode; title: string; body: string; action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-8">
      {icon && <div className="mb-4 text-ink-faint">{icon}</div>}
      <h3 className="text-[17px] font-medium mb-1.5">{title}</h3>
      <p className="text-[13.5px] text-ink-soft max-w-[46ch] leading-relaxed">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

/** Severity tag used beside every finding. */
export function SeverityTag({ severity }: { severity: 'BLOCK' | 'GAP' | 'WATCH' }) {
  const style = {
    BLOCK: 'text-verdict-no ring-flame-200 bg-flame-50',
    GAP: 'text-verdict-maybe ring-amber-200 bg-amber-50',
    WATCH: 'text-ink-faint ring-paper-edge bg-paper-sunken',
  }[severity]
  return <span className={cx('chip ring-1 font-mono text-[10px] tracking-wider', style)}>{severity}</span>
}
