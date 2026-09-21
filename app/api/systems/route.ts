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

  try {
    let name = 'design-system'
    let source = 'upload'
    let origin: string | undefined
    let fileCount = 0

    const contentType = req.headers.get('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file')
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'No file was attached.' }, { status: 400 })
      }
      const buf = new Uint8Array(await file.arrayBuffer())
      const r = await ingestZip(buf, dest, file.name)
      name = r.name
      fileCount = r.files
      origin = file.name
    } else {
      const body = (await req.json()) as { url?: string; localPath?: string; sample?: boolean }

      if (body.sample) {
        const r = ingestLocal(path.join(process.cwd(), 'fixtures', 'aurora-ui'), dest)
        name = r.name
        fileCount = r.files
        source = 'sample'
        origin = 'bundled sample'
      } else if (body.url) {
        const r = await ingestGithub(body.url, dest)
        name = r.name
        fileCount = r.files
        source = 'github'
        origin = body.url
      } else if (body.localPath) {
        const r = ingestLocal(body.localPath, dest)
        name = r.name
        fileCount = r.files
        source = 'local'
        origin = body.localPath
      } else {
        return NextResponse.json({ error: 'Provide a GitHub URL, a local path, or a zip.' }, { status: 400 })
      }
    }

    const facts = extract(dest)
    const before = score(facts)

    createSystem({ id, name: facts.packageName || name, source, origin })
    saveAudit(id, JSON.stringify(facts), JSON.stringify(before))

    return NextResponse.json({ id, name: facts.packageName || name, fileCount, facts, before })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingest failed.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
