import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import { deleteSystem, getSystem, outputDir } from '@/lib/store'

export const runtime = 'nodejs'

/** Every file in the generated output, so the UI can show the real tree. */
function listOutput(root: string, base = root, out: string[] = []): string[] {
  if (!fs.existsSync(root)) return out
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const p = `${root}/${e.name}`
    if (e.isDirectory()) listOutput(p, base, out)
    else out.push(p.slice(base.length + 1).replace(/\\/g, '/'))
  }
  return out
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const row = getSystem(id)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    id: row.id,
    name: row.name,
    source: row.source,
    origin: row.origin,
    converted: Boolean(row.converted),
    selected: row.selected ? JSON.parse(row.selected) : [],
    facts: row.facts_json ? JSON.parse(row.facts_json) : null,
    before: row.before_json ? JSON.parse(row.before_json) : null,
    after: row.after_json ? JSON.parse(row.after_json) : null,
    output: listOutput(outputDir(id)).sort(),
  })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!getSystem(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  deleteSystem(id)
  return NextResponse.json({ ok: true })
}
