/**
 * POST /api/systems/:id/publish — open a pull request adding the generated output.
 *
 * Additive only. The commit creates `agent-ready/**` and touches nothing that was
 * already in the repository, which is what makes this safe to run against a client
 * repo: the PR can be read, reverted, or closed with no trace.
 *
 * The token is read from the environment (GITHUB_TOKEN in .env.local), never from
 * the request body and never from a chat message. A token pasted into a
 * conversation is exposed the moment it is typed.
 */
import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { getSystem, outputDir } from '@/lib/store'
import { parseRepo } from '@/lib/ingest'

export const runtime = 'nodejs'
export const maxDuration = 300

const API = 'https://api.github.com'

function collect(root: string, base = root, out: Array<{ rel: string; body: string }> = []) {
  if (!fs.existsSync(root)) return out
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, e.name)
    if (e.isDirectory()) collect(p, base, out)
    else out.push({ rel: path.relative(base, p).replace(/\\/g, '/'), body: fs.readFileSync(p, 'utf8') })
  }
  return out
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const row = getSystem(id)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const token = process.env.GITHUB_TOKEN
  if (!token) {
    return NextResponse.json(
      {
        error: 'No GitHub token configured.',
        how: 'Create a fine-grained token with Contents + Pull requests write on the target repo, then put it in .env.local as GITHUB_TOKEN=... and restart the dev server. Never paste a token into a chat message.',
      },
      { status: 400 },
    )
  }

  const body = (await req.json().catch(() => ({}))) as { repo?: string; branch?: string; base?: string }
  const repoUrl = body.repo ?? row.origin ?? ''
  const parsed = parseRepo(repoUrl)
  if (!parsed) {
    return NextResponse.json({ error: 'Provide the target repository as a github.com URL.' }, { status: 400 })
  }
  const { owner, repo } = parsed

  const files = collect(outputDir(id))
  if (!files.length) {
    return NextResponse.json({ error: 'Nothing to publish — convert the system first.' }, { status: 400 })
  }

  const gh = async (url: string, init?: RequestInit) => {
    const res = await fetch(url.startsWith('http') ? url : `${API}${url}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'peel',
        ...(init?.headers ?? {}),
      },
    })
    const text = await res.text()
    const json = text ? JSON.parse(text) : {}
    if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${json.message ?? res.statusText}`)
    return json
  }

  try {
    const repoInfo = await gh(`/repos/${owner}/${repo}`)
    const base = body.base ?? repoInfo.default_branch
    const branch = body.branch ?? `peel/agent-ready-${Date.now().toString(36)}`

    const baseRef = await gh(`/repos/${owner}/${repo}/git/ref/heads/${base}`)
    const baseSha = baseRef.object.sha
    const baseCommit = await gh(`/repos/${owner}/${repo}/git/commits/${baseSha}`)

    // One blob per generated file, then one tree, then one commit. Because the tree
    // uses base_tree, every existing path is preserved untouched.
    const tree = []
    for (const f of files) {
      const blob = await gh(`/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: f.body, encoding: 'utf-8' }),
      })
      tree.push({ path: `agent-ready/${f.rel}`, mode: '100644', type: 'blob', sha: blob.sha })
    }

    const newTree = await gh(`/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }),
    })

    const before = row.before_json ? JSON.parse(row.before_json) : null
    const after = row.after_json ? JSON.parse(row.after_json) : null

    const commit = await gh(`/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message: `Add agent-ready design system output\n\nScore ${before?.composite ?? '?'} -> ${after?.composite ?? '?'} (measured).\nAdditive only: nothing outside agent-ready/ is modified.`,
        tree: newTree.sha,
        parents: [baseSha],
      }),
    })

    await gh(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    })

    const pr = await gh(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title: `Agent-ready design system (${before?.composite ?? '?'} → ${after?.composite ?? '?'})`,
        head: branch,
        base,
        body: prBody(row.name, before, after, files.length, row.selected),
      }),
    })

    return NextResponse.json({ ok: true, url: pr.html_url, branch, files: files.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Publish failed.' },
      { status: 400 },
    )
  }
}

function prBody(
  name: string,
  before: { composite: number; verdict: { label: string }; axes: Array<{ label: string; value: number | null }> } | null,
  after: { composite: number; verdict: { label: string }; axes: Array<{ label: string; value: number | null }> } | null,
  fileCount: number,
  selected: string | null,
): string {
  const components = selected ? (JSON.parse(selected) as string[]) : []
  return `## Agent-ready output for \`${name}\`

This PR **only adds** \`agent-ready/\`. No existing file is modified.

### Score

| | Before | After |
|---|---|---|
| **Composite** | ${before?.composite ?? '—'} | ${after?.composite ?? '—'} |
| Verdict | ${before?.verdict.label ?? '—'} | ${after?.verdict.label ?? '—'} |
${(before?.axes ?? []).map((a, i) => `| ${a.label} | ${a.value ?? '—'} | ${after?.axes[i]?.value ?? '—'} |`).join('\n')}

Both numbers are measured by running the same audit against the generated output.

### What is in here

- \`agent-ready/components/\` — ${components.join(', ') || 'converted components'}, each with \`guidance.yaml\`, generated CSS, a story and a README
- \`agent-ready/tokens/\` — two-tier token layer; components consume the semantic tier only
- \`agent-ready/AGENTS.md\`, \`llms.txt\`, \`RULES.md\`, \`curation.json\`, \`design.md\` — the knowledge base
- \`agent-ready/scripts/\` — conformance and docs-freshness gates
- \`agent-ready/visual-book.html\` — every component before and after, printable
- \`agent-ready/SCORECARD.md\` — including every open question that still needs a human

${fileCount} files total.

### Before merging

Read \`SCORECARD.md\` → **Needs a human**. Those are values that could not be measured
from the source and were deliberately left as questions rather than guessed.
`
}
