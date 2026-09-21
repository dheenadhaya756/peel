/** GET /api/systems/:id/book — the visual book, served for viewing or printing to PDF. */
import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import { getSystem, outputDir } from '@/lib/store'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!getSystem(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const file = `${outputDir(id)}/visual-book.html`
  if (!fs.existsSync(file)) {
    return NextResponse.json({ error: 'Convert the system first — the book is generated from the output.' }, { status: 404 })
  }
  return new NextResponse(fs.readFileSync(file, 'utf8'), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}
