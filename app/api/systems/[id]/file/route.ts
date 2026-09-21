/** GET /api/systems/:id/file?path=... — one generated file, for the code pane. */
import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { getSystem, outputDir } from '@/lib/store'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!getSystem(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const rel = req.nextUrl.searchParams.get('path')
  if (!rel) return NextResponse.json({ error: 'path is required' }, { status: 400 })

  const root = outputDir(id)
  const target = path.resolve(root, rel)
  // Never serve anything outside the generated output directory.
  if (!target.startsWith(path.resolve(root) + path.sep)) {
    return NextResponse.json({ error: 'path escapes the output directory' }, { status: 400 })
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    return NextResponse.json({ error: 'No such generated file' }, { status: 404 })
  }
  return NextResponse.json({ path: rel, content: fs.readFileSync(target, 'utf8') })
}
