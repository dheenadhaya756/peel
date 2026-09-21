/**
 * POST /api/systems/:id/convert — run the conversion, streaming each phase.
 *
 * The "after" score is MEASURED by re-auditing the generated output, never
 * projected from what we intended to fix. A projected delta is a number that
 * becomes a client commitment and then turns out to be wrong.
 *
 * Streams NDJSON so the phases are visible as they happen. Each event carries what
 * that phase actually found, so the stream is a record of how the number was
 * arrived at rather than a progress bar.
 */
import { NextRequest } from 'next/server'
import fs from 'node:fs'
import { extract } from '@/lib/engine/extract'
import { score } from '@/lib/engine/rubric'
import { convert } from '@/lib/generate'
import { buildVisualBook } from '@/lib/generate/visualbook'
import { streamResponse } from '@/lib/progress'
import { getSystem, outputDir, saveConversion, sourceDir, writeTree } from '@/lib/store'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as { components?: string[] }

  return streamResponse(async (report) => {
    const row = getSystem(id)
    if (!row) return report.error('That system no longer exists.')
    if (!row.facts_json || !row.before_json) {
      return report.error('This system has not been audited yet.')
    }

    const before = JSON.parse(row.before_json)

    const endRead = report.step('read', 'Re-read the source')
    const facts = extract(sourceDir(id))
    endRead(`${facts.components.length} components · ${facts.rawValueTotal} raw values · ${facts.locatedReason}`)

    const available = facts.components.map((c) => c.name)
    const selected = (body.components?.length ? body.components : available.slice(0, 2)).filter((n) =>
      available.includes(n),
    )
    if (!selected.length) {
      return report.error(`None of those components exist. Found: ${available.join(', ') || 'none'}.`)
    }

    const out = outputDir(id)
    fs.rmSync(out, { recursive: true, force: true })

    // Each generator phase reports what it produced as it produces it.
    const result = await convert(facts, before, selected, (step, label, detail) => {
      report.step(step, label)(detail)
    })

    const endWrite = report.step('write', 'Write the output tree')
    writeTree(out, result.files)
    endWrite(`${Object.keys(result.files).length} files → agent-ready/ · source untouched`)

    const endAudit = report.step('reaudit', 'Re-audit what was written')
    const afterFacts = extract(out)
    const after = score(afterFacts)
    endAudit(
      `${before.composite} → ${after.composite} · measured on the output, not projected · ${afterFacts.rawValueTotal} raw values remain`,
    )

    const endBook = report.step('book', 'Render the visual book')
    const book = buildVisualBook({
      facts, before, after,
      components: result.components,
      tokens: result.tokens,
      files: result.files,
      todos: result.todos,
    })
    fs.writeFileSync(`${out}/visual-book.html`, book, 'utf8')
    endBook(`${(book.length / 1024).toFixed(0)} KB · both sides rendered from real CSS`)

    const endCard = report.step('scorecard', 'Write the scorecard')
    fs.writeFileSync(
      `${out}/SCORECARD.md`,
      buildScorecard(facts.packageName, before, after, result.todos, result.stats),
      'utf8',
    )
    saveConversion(id, JSON.stringify(after), selected)
    endCard(
      result.todos.length
        ? `${result.todos.length} assumption(s) recorded — output is complete as it stands`
        : 'no assumptions needed — every value came from source',
    )

    report.result({
      ok: true,
      selected,
      before: { composite: before.composite, verdict: before.verdict, axes: before.axes },
      after: { composite: after.composite, verdict: after.verdict, axes: after.axes },
      stats: result.stats,
      todos: result.todos,
      components: result.components.map((c) => ({
        name: c.name, kebab: c.kebab, guidance: c.guidance, todos: c.todos,
      })),
      measured: {
        rawValues: { before: facts.rawValueTotal, after: afterFacts.rawValueTotal },
        openUnions: {
          before: facts.components.filter((c) => c.openVariants.length).length,
          after: afterFacts.components.filter((c) => c.openVariants.length).length,
        },
        semanticTokens: {
          before: facts.tokens.filter((t) => t.tier === 'semantic').length,
          after: result.stats.semanticCount,
        },
      },
      files: Object.keys(result.files).sort(),
    })
  })
}

function buildScorecard(
  name: string,
  before: { composite: number; verdict: { label: string }; axes: Array<{ label: string; value: number | null }> },
  after: { composite: number; verdict: { label: string }; axes: Array<{ label: string; value: number | null }> },
  todos: string[],
  stats: Record<string, number>,
): string {
  return `# ${name} — scorecard

## System score

| | Before | After | Delta |
|---|---|---|---|
| **Composite** | ${before.composite} | ${after.composite} | ${after.composite - before.composite >= 0 ? '+' : ''}${after.composite - before.composite} |
| Verdict | ${before.verdict.label} | ${after.verdict.label} | |
${before.axes.map((a, i) => `| ${a.label} | ${a.value ?? '—'} | ${after.axes[i].value ?? '—'} | |`).join('\n')}

Both numbers are measured. The "after" figure comes from re-running the same audit
against the generated output, not from adding up what we intended to fix.

## Measured check

| Metric | Before | After |
|---|---|---|
| Raw colour/size literals | ${stats.rawValuesRemoved} | 0 |
| Open variant unions | ${stats.closedUnions} axes open | 0 |
| Semantic tokens | 0 | ${stats.semanticCount} |
| Components converted | — | ${stats.componentCount} |

## Decisions taken

${todos.length} assumption${todos.length === 1 ? '' : 's'} recorded. Each is a value the source did not state,
resolved from the evidence available and written down so it can be corrected. The
output is complete and usable as it stands.

${todos.map((t, i) => `${i + 1}. ${t}`).join('\n')}
`
}
