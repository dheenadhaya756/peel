/**
 * Progress streaming.
 *
 * The audit and the conversion each do real work in several distinct phases, and a
 * spinner that hides them is a worse answer than it looks: when the result finally
 * lands, nobody can tell what was measured or where the time went. These events make
 * the process legible, and — because each one carries what it actually found — the
 * stream doubles as a record of how the score was arrived at.
 *
 * NDJSON rather than SSE: one JSON object per line, no framing to get wrong, and it
 * reads correctly in a terminal with curl.
 */

export type StepStatus = 'start' | 'done' | 'skip' | 'error'

export interface ProgressEvent {
  type: 'step' | 'result' | 'error'
  /** Stable id, so the UI can update a row rather than append one. */
  step?: string
  label?: string
  status?: StepStatus
  /** What this step actually found — shown beside the row. */
  detail?: string
  ms?: number
  /** Terminal payload for type 'result' or 'error'. */
  data?: unknown
  message?: string
}

export interface Reporter {
  /** Begin a step. Returns a function that ends it, optionally with a detail. */
  step: (id: string, label: string) => (detail?: string, status?: StepStatus) => void
  result: (data: unknown) => void
  error: (message: string) => void
}

export function streamResponse(
  work: (report: Reporter) => Promise<void>,
): Response {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const send = (e: ProgressEvent) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'))
        } catch {
          closed = true
        }
      }

      const report: Reporter = {
        step(id, label) {
          const began = Date.now()
          send({ type: 'step', step: id, label, status: 'start' })
          return (detail, status = 'done') => {
            send({ type: 'step', step: id, label, status, detail, ms: Date.now() - began })
          }
        },
        result(data) {
          send({ type: 'result', data })
        },
        error(message) {
          send({ type: 'error', message })
        },
      }

      try {
        await work(report)
      } catch (err) {
        report.error(err instanceof Error ? err.message : String(err))
      } finally {
        closed = true
        try {
          controller.close()
        } catch { /* already closed */ }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      // Without this a proxy can buffer the whole stream and defeat the point.
      'x-accel-buffering': 'no',
    },
  })
}

/** Client helper: read an NDJSON stream, calling back per event. */
export async function readProgress(
  res: Response,
  onEvent: (e: ProgressEvent) => void,
): Promise<void> {
  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body to read')
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      try {
        onEvent(JSON.parse(line) as ProgressEvent)
      } catch { /* a partial line is not an error, just not ready */ }
    }
  }
  const tail = buffer.trim()
  if (tail) {
    try {
      onEvent(JSON.parse(tail) as ProgressEvent)
    } catch { /* ignore a truncated tail */ }
  }
}
