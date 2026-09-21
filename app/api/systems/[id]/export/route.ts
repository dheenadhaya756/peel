/** GET /api/systems/:id/export — the generated output as a .zip. */
import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { zipSync } from 'fflate'
import { getSystem, outputDir } from '@/lib/store'

export const runtime = 'nodejs'

function collect(root: string, base = root, out: Record<string, Uint8Array> = {}) {
  if (!fs.existsSync(root)) return out
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, e.name)
    if (e.isDirectory()) collect(p, base, out)
    else out[path.relative(base, p).split(path.sep).join('/')] = new Uint8Array(fs.readFileSync(p))
  }
  return out
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const row = getSystem(id)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const files = collect(outputDir(id))
  if (!Object.keys(files).length) {
    return NextResponse.json({ error: 'Nothing to export — convert the system first.' }, { status: 400 })
  }

  const zipped = zipSync(files, { level: 6 })
  const body = new Uint8Array(zipped)
  return new NextResponse(body, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${row.name}-agent-ready.zip"`,
    },
  })
}
