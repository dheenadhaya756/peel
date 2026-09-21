/**
 * POST /api/systems — ingest a design system and audit it.
 * GET  /api/systems — list what has been ingested.
 *
 * The audit runs synchronously on ingest, because a system in the list with no
 * score is a system nobody can act on.
 */
import { NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import { extract } from '@/lib/engine/extract'
import { score } from '@/lib/engine/rubric'
import { ingestGithub, ingestLocal, ingestZip } from '@/lib/ingest'
import { streamResponse } from '@/lib/progress'
import { createSystem, listSystems, newId, saveAudit, sourceDir } from '@/lib/store'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET() {
  const rows = listSystems().map((r) => {
    const before = r.before_json ? JSON.parse(r.before_json) : null
    const after = r.after_json ? JSON.parse(r.after_json) : null
    const facts = r.facts_json ? JSON.parse(r.facts_json) : null
    return {
      id: r.id,
      name: r.name,
      source: r.source,
      origin: r.origin,
      createdAt: r.created_at,
      converted: Boolean(r.converted),
      selected: r.selected ? JSON.parse(r.selected) : [],
      componentCount: facts?.components?.length ?? 0,
      before: before ? { composite: before.composite, verdict: before.verdict } : null,
      after: after ? { composite: after.composite, verdict: after.verdict } : null,
    }
  })
  return NextResponse.json({ systems: rows })
}

export async function POST(req: NextRequest) {
  const id = newId()
  const dest = sourceDir(id)

  const contentType = req.headers.get('content-type') ?? ''
  // Read the body before the stream opens — it cannot be read once streaming starts.
  const form = contentType.includes('multipart/form-data') ? await req.formData() : null
  const body = form ? null : ((await req.json().catch(() => ({}))) as {
    url?: string; localPath?: string; sample?: boolean
  })

  return streamResponse(async (report) => {
    let name = 'design-system'
    let source = 'upload'
    let origin: string | undefined
    let fileCount = 0

    /* ---- 1. fetch ---- */
    if (form) {
      const file = form.get('file')
      if (!(file instanceof File)) return report.error('No file was attached.')
      const end = report.step('fetch', `Unpack ${file.name}`)
      const buf = new Uint8Array(await file.arrayBuffer())
      const r = await ingestZip(buf, dest, file.name)
      name = r.name
      fileCount = r.files
      origin = file.name
      end(`${r.files} source files`)
    } else if (body?.sample) {
      const end = report.step('fetch', 'Copy the bundled sample')
      const r = ingestLocal(path.join(process.cwd(), 'fixtures', 'aurora-ui'), dest)
      name = r.name
      fileCount = r.files
      source = 'sample'
      origin = 'bundled sample'
      end(`${r.files} files · source is copied, never read in place`)
    } else if (body?.url) {
      const end = report.step('fetch', `Download ${body.url.replace(/^https?:\/\/(www\.)?github\.com\//, '')}`)
      const r = await ingestGithub(body.url, dest)
      name = r.name
      fileCount = r.files
      source = 'github'
      origin = body.url
      end(`${r.files} source files from branch ${r.ref} · non-source files skipped`)
    } else if (body?.localPath) {
      const end = report.step('fetch', 'Copy the local folder')
      const r = ingestLocal(body.localPath, dest)
      name = r.name
      fileCount = r.files
      source = 'local'
      origin = body.localPath
      end(`${r.files} files`)
    } else {
      return report.error('Provide a GitHub URL, a local path, or a zip.')
    }

    /* ---- 2. locate + extract ---- */
    const endExtract = report.step('extract', 'Locate the package and read the prop surface')
    const facts = extract(dest)
    endExtract(
      `${facts.locatedReason} · ${facts.components.length} components · ${facts.tokens.length} tokens · ${facts.rawValueTotal} raw values`,
    )

    if (facts.degraded) {
      report.step('degraded', 'Degraded read')(
        `${facts.degradedReason} — contract checks will report unscored, never pass`,
        'skip',
      )
    }

    /* ---- 3. score ---- */
    const endScore = report.step('score', 'Score nine layers across four axes')
    const before = score(facts)
    endScore(
      `${before.composite}/100 — ${before.verdict.label} · ${before.counts.blockers} blocker(s), ${before.counts.fail} failing, ${before.counts.unscored} unscored`,
    )

    const endSave = report.step('save', 'Store the audit')
    createSystem({ id, name: facts.packageName || name, source, origin })
    saveAudit(id, JSON.stringify(facts), JSON.stringify(before))
    endSave('source kept read-only for the conversion')

    report.result({ id, name: facts.packageName || name, fileCount, facts, before })
  })
}
