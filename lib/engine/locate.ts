/**
 * Locate the design system inside whatever was handed over.
 *
 * A real repository is usually a monorepo: the component package sits beside a docs
 * site, a registry of demos and an examples folder. Scanning all of it counts every
 * `AccordionDemo` as a component and produces a number nobody can act on — so the
 * package has to be found before anything is measured.
 */
import fs from 'node:fs'
import path from 'node:path'

/** Directories whose contents are never the design system itself. */
export const NON_LIBRARY = new RegExp(
  `(^|[\\\\/])(` +
    ['examples?', 'demos?', 'docs?', 'website', 'www', 'playground', 'sandbox',
     'stories', 'storybook', '__tests__', 'test', 'tests', 'e2e', 'fixtures',
     'registry', 'templates?', 'scripts', 'benchmarks?'].join('|') +
  `)([\\\\/]|$)`,
  'i',
)

export interface Located {
  root: string
  /** How the choice was made, so it can be shown and disputed. */
  reason: string
  candidates: Array<{ dir: string; components: number; name: string }>
}

const UI_DEPS = /class-variance-authority|tailwind-variants|@radix-ui|@ark-ui|styled-components|@emotion|@vanilla-extract|@stitches/

function countComponents(dir: string, depth = 0): number {
  if (depth > 6) return 0
  let n = 0
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      if (NON_LIBRARY.test(full)) continue
      n += countComponents(full, depth + 1)
    } else if (/\.(tsx|jsx)$/.test(e.name) && !/\.(test|spec|stories)\./.test(e.name)) {
      n++
    }
  }
  return n
}

export function locate(root: string): Located {
  const candidates: Array<{ dir: string; components: number; name: string; score: number }> = []

  const consider = (dir: string) => {
    const pkgPath = path.join(dir, 'package.json')
    if (!fs.existsSync(pkgPath)) return
    let pkg: Record<string, unknown>
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    } catch {
      return
    }
    const name = String(pkg.name ?? path.basename(dir))
    const deps = JSON.stringify({ ...(pkg.dependencies ?? {}), ...(pkg.peerDependencies ?? {}) })
    const components = countComponents(dir)
    if (components === 0) return

    let score = components
    // A package whose name or path says "ui" is far more likely to be the library
    // than the docs site that happens to import it.
    if (/\b(ui|design[-_]?system|components?|kit)\b/i.test(name)) score += 400
    if (/[\\/]packages?[\\/]/.test(dir)) score += 250
    if (UI_DEPS.test(deps)) score += 200
    if (pkg.exports || pkg.types || pkg.typings) score += 120
    // The docs site is the usual false positive: lots of files, no library intent.
    if (/\b(www|docs?|website|app)\b/i.test(name)) score -= 500
    candidates.push({ dir, components, name, score })
  }

  consider(root)
  for (const parent of ['packages', 'apps', 'libs', 'src']) {
    const p = path.join(root, parent)
    if (!fs.existsSync(p)) continue
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      if (e.isDirectory() && !e.name.startsWith('.')) consider(path.join(p, e.name))
    }
  }

  if (!candidates.length) {
    return { root, reason: 'no inner package found — auditing the whole tree', candidates: [] }
  }

  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0]
  const rest = candidates.slice(1, 5).map(({ dir, components, name }) => ({ dir, components, name }))

  if (best.dir === root) {
    return { root, reason: `single package \`${best.name}\``, candidates: rest }
  }
  return {
    root: best.dir,
    reason: `picked \`${best.name}\` (${best.components} component files) out of ${candidates.length} packages`,
    candidates: rest,
  }
}
