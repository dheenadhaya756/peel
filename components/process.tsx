'use client'

import * as React from 'react'
import { cx } from './primitives'
import type { ProgressEvent, StepStatus } from '@/lib/progress'

export interface Step {
  id: string
  label: string
  status: StepStatus
  detail?: string
  ms?: number
}

/**
 * Reduce a stream of events into an ordered step list.
 *
 * Keyed by id so a step updates in place rather than appending a second row —
 * otherwise every phase appears twice, once starting and once finished.
 */
/**
 * Minimum time a step stays on screen before the next one appears.
 *
 * The work is genuinely fast — a whole conversion runs in about 60ms — so without
 * pacing every phase lands in the same frame and nobody can read any of it. Only
 * the REVEAL is paced: each row still shows the real measured duration, so the
 * timings on screen are the true ones and nothing is padded.
 */
const DWELL_MS = 260

export function useProcess(dwell = DWELL_MS) {
  const [steps, setSteps] = React.useState<Step[]>([])
  const [running, setRunning] = React.useState(false)
  const [failed, setFailed] = React.useState<string | null>(null)

  // Events arrive in a burst; release them on a readable cadence.
  const queue = React.useRef<ProgressEvent[]>([])
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const reset = React.useCallback(() => {
    queue.current = []
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    setSteps([])
    setFailed(null)
  }, [])

  const commit = React.useCallback((e: ProgressEvent) => {
    if (e.type === 'error') {
      setFailed(e.message ?? 'Failed')
      setSteps((prev) =>
        prev.map((s, i) => (i === prev.length - 1 && s.status === 'start' ? { ...s, status: 'error' } : s)),
      )
      return
    }
    if (e.type !== 'step' || !e.step) return
    setSteps((prev) => {
      const next = [...prev]
      const at = next.findIndex((s) => s.id === e.step)
      const row: Step = {
        id: e.step!,
        label: e.label ?? e.step!,
        status: e.status ?? 'start',
        detail: e.detail,
        ms: e.ms,
      }
      if (at >= 0) next[at] = { ...next[at], ...row }
      else next.push(row)
      return next
    })
  }, [])

  const drain = React.useCallback(() => {
    const next = queue.current.shift()
    if (!next) { timer.current = null; return }
    commit(next)
    timer.current = setTimeout(drain, dwell)
  }, [commit, dwell])

  const apply = React.useCallback(
    (e: ProgressEvent) => {
      // A 'start' followed immediately by its 'done' would show one frame of
      // "running" and be invisible, so both go through the same queue.
      queue.current.push(e)
      if (!timer.current) drain()
    },
    [drain],
  )

  /** Resolves once every queued event has been shown. */
  const flushed = React.useCallback(
    () =>
      new Promise<void>((resolve) => {
        const tick = () => {
          if (!queue.current.length && !timer.current) return resolve()
          setTimeout(tick, 60)
        }
        tick()
      }),
    [],
  )

  React.useEffect(
    () => () => { if (timer.current) clearTimeout(timer.current) },
    [],
  )

  return { steps, running, setRunning, failed, setFailed, reset, apply, flushed }
}

const DOT: Record<StepStatus, string> = {
  start: 'bg-flame-400 animate-pulseSoft',
  done: 'bg-verdict-yes',
  skip: 'bg-verdict-maybe',
  error: 'bg-verdict-no',
}

export function ProcessList({ steps, failed, compact }: {
  steps: Step[]
  failed?: string | null
  compact?: boolean
}) {
  if (!steps.length && !failed) return null

  return (
    <div className={cx('space-y-0', compact && 'text-[12px]')}>
      {steps.map((s, i) => (
        <div
          key={s.id}
          className="relative flex gap-3 animate-rise"
          style={{ animationDelay: `${Math.min(i, 8) * 20}ms` }}
        >
          {/* rail */}
          <div className="relative flex flex-col items-center w-3 shrink-0">
            <span className={cx('mt-[7px] h-2 w-2 rounded-full shrink-0 ring-2 ring-paper-raised', DOT[s.status])} />
            {i < steps.length - 1 && <span className="flex-1 w-px bg-paper-edge my-1" />}
          </div>

          <div className={cx('min-w-0 flex-1', i < steps.length - 1 ? 'pb-3' : 'pb-0.5')}>
            <div className="flex items-baseline gap-2">
              <span
                className={cx(
                  'text-[13px] font-medium',
                  s.status === 'start' && 'text-ink',
                  s.status === 'done' && 'text-ink',
                  s.status === 'skip' && 'text-verdict-maybe',
                  s.status === 'error' && 'text-verdict-no',
                )}
              >
                {s.label}
              </span>
              {s.ms != null && (
                <span className="font-mono text-[10px] text-ink-faint tabular-nums">
                  {s.ms < 1000 ? `${s.ms}ms` : `${(s.ms / 1000).toFixed(1)}s`}
                </span>
              )}
              {s.status === 'start' && (
                <span className="font-mono text-[10px] text-flame-600">running</span>
              )}
            </div>
            {s.detail && (
              <div className="text-[12px] text-ink-soft leading-relaxed mt-0.5 break-words">
                {s.detail}
              </div>
            )}
          </div>
        </div>
      ))}

      {failed && (
        <div className="mt-3 rounded-inset ring-1 ring-flame-200 bg-flame-50 px-4 py-3 text-[12.5px] text-verdict-no leading-relaxed">
          {failed}
        </div>
      )}
    </div>
  )
}

/** The full-height panel shown in the canvas while work is running. */
export function ProcessPanel({ title, subtitle, steps, failed }: {
  title: string
  subtitle: string
  steps: Step[]
  failed?: string | null
}) {
  return (
    <div className="px-8 py-7">
      <div className="card overflow-hidden">
        <div className="relative bg-mesh-warm px-7 py-6">
          <div className="absolute inset-0 texture-dots opacity-[.14]" aria-hidden />
          <div className="relative">
            <div className="mono-label text-ink-soft">In progress</div>
            <h2 className="text-[21px] font-semibold mt-1 tracking-display">{title}</h2>
            <p className="text-[13px] text-ink-soft mt-1 max-w-[60ch] leading-relaxed">{subtitle}</p>
          </div>
        </div>
        <div className="px-7 py-6">
          <ProcessList steps={steps} failed={failed} />
        </div>
      </div>
    </div>
  )
}
