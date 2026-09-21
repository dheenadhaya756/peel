/**
 * Fact extraction. Everything here is MEASURED from the AST or the file system —
 * nothing is inferred, and nothing is asked of a model. If a fact cannot be read,
 * it is absent rather than guessed.
 */
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'
import type { ComponentFact, Evidence, PropFact, SystemFacts, TokenFact } from './types'
import { NON_LIBRARY, locate } from './locate'

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist-types', 'coverage', '.turbo'])

export function walk(root: string, out: string[] = [], depth = 0): string[] {
  if (depth > 12) return out
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.peel' && e.name !== '.storybook') continue
    const full = path.join(root, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      walk(full, out, depth + 1)
    } else {
      out.push(full)
    }
  }
  return out
}

const read = (f: string) => {
  try {
    return fs.readFileSync(f, 'utf8')
  } catch {
    return null
  }
}

const lineOf = (text: string, pos: number) => text.slice(0, pos).split('\n').length

/* ------------------------------------------------------------------ raw values */

/**
 * Raw colour and size literals. These are the hallucination budget: every one is a
 * value an agent will copy and then invent variations of.
 *
 * NOTE the shape of the AST walk below. `ts.forEachChild` STOPS as soon as the
 * callback returns something truthy, so the callback must not return a value —
 * otherwise only the leftmost spine of the tree is ever visited and most findings
 * are silently missed while the checker still exits clean.
 */
const HEX = /#[0-9a-fA-F]{3,8}\b/g
const PX = /(?<![\w-])(\d{1,4})px\b/g
const RGB = /\brgba?\(\s*\d+\s*,/g

export function findRawValues(file: string, text: string): Evidence[] {
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const hits: Evidence[] = []
  const seen = new Set<string>()

  const record = (raw: string, pos: number) => {
    const line = lineOf(text, pos)
    const key = `${line}:${raw}`
    if (seen.has(key)) return
    seen.add(key)
    hits.push({
      file: path.basename(file),
      line,
      excerpt: (text.split('\n')[line - 1] ?? '').trim().slice(0, 140),
    })
  }

  const scan = (value: string, pos: number) => {
    for (const re of [HEX, PX, RGB]) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(value))) {
        // 0px and 1px are borders/resets, not design decisions worth flagging
        if (re === PX && (m[1] === '0' || m[1] === '1')) continue
        record(m[0], pos)
      }
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      scan(node.text, node.getStart(src))
    } else if (ts.isTemplateExpression(node)) {
      scan(node.getText(src), node.getStart(src))
    }
    ts.forEachChild(node, (n) => {
      visit(n)
    })
  }
  visit(src)
  return hits
}

/* --------------------------------------------------------------------- cva map */

interface CvaResult {
  variants: Record<string, string[]>
  /** The literal class string each branch applies — the only place the real
   *  styling of a variant can be recovered from. */
  variantClasses: Record<string, Record<string, string>>
  defaultVariants: Record<string, string>
}

/**
 * Variant axes and their defaults, read from the cva() / tv() call in SOURCE.
 *
 * This must read source rather than built types: `defaultVariants` is erased from
 * the emitted .d.ts, so any tool reading only built types reports zero defaults
 * across an entire library and scores it as undocumented when it is not.
 */
function readCva(src: ts.SourceFile): CvaResult {
  const out: CvaResult = { variants: {}, variantClasses: {}, defaultVariants: {} }

  const objectOf = (node: ts.Node | undefined) =>
    node && ts.isObjectLiteralExpression(node) ? node : undefined

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(src)
      if (callee === 'cva' || callee === 'tv' || callee.endsWith('.cva')) {
        const config = node.arguments.find((a) => ts.isObjectLiteralExpression(a))
        const cfg = objectOf(config)
        if (cfg) {
          for (const prop of cfg.properties) {
            if (!ts.isPropertyAssignment(prop)) continue
            const key = prop.name.getText(src).replace(/['"]/g, '')

            if (key === 'variants') {
              const axes = objectOf(prop.initializer)
              if (!axes) continue
              for (const axis of axes.properties) {
                if (!ts.isPropertyAssignment(axis)) continue
                const axisName = axis.name.getText(src).replace(/['"]/g, '')
                const values = objectOf(axis.initializer)
                if (!values) continue
                const branches = values.properties
                  .filter((v): v is ts.PropertyAssignment => ts.isPropertyAssignment(v))
                out.variants[axisName] = branches.map((v) => v.name.getText(src).replace(/['"]/g, ''))
                out.variantClasses[axisName] = Object.fromEntries(
                  branches.map((v) => [
                    v.name.getText(src).replace(/['"]/g, ''),
                    // The branch value is a string literal (or a joined array) of classes.
                    v.initializer.getText(src).replace(/^['"`]|['"`]$/g, '').trim(),
                  ]),
                )
              }
            }

            if (key === 'defaultVariants') {
              const defs = objectOf(prop.initializer)
              if (!defs) continue
              for (const d of defs.properties) {
                if (!ts.isPropertyAssignment(d)) continue
                out.defaultVariants[d.name.getText(src).replace(/['"]/g, '')] =
                  d.initializer.getText(src).replace(/['"]/g, '')
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, (n) => {
      visit(n)
    })
  }
  visit(src)
  return out
}

/* ------------------------------------------------------------------- prop types */

const OPEN_TYPES = new Set(['string', 'any', 'object', 'unknown', 'String', 'Object'])

const VARIANT_SHAPED = /^(variant|size|tone|intent|color|colour|appearance|kind|status|severity)$/i

/**
 * @param axes variant axis names recovered from the cva map. A prop whose name
 *   matches a real axis and is typed `string` is the expensive case: the value is
 *   constrained in the styling map but not in the type system, so an invented
 *   value like variant="cta" COMPILES and nothing catches it.
 */
function readProps(
  src: ts.SourceFile,
  text: string,
  axes: string[] = [],
): { props: PropFact[]; open: string[] } {
  const props: PropFact[] = []
  const open: string[] = []
  const axisSet = new Set(axes.map((a) => a.toLowerCase()))

  const capture = (members: ts.NodeArray<ts.TypeElement>) => {
    for (const m of members) {
      if (!ts.isPropertySignature(m) || !m.name) continue
      const name = m.name.getText(src).replace(/['"]/g, '')
      const type = m.type ? m.type.getText(src).replace(/\s+/g, ' ').trim() : 'unknown'
      const isOpen = OPEN_TYPES.has(type)
      props.push({ name, type, required: !m.questionToken, open: isOpen })
      if (isOpen && (axisSet.has(name.toLowerCase()) || VARIANT_SHAPED.test(name))) {
        open.push(name)
      }
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && /Props$/.test(node.name.text)) capture(node.members)
    if (
      ts.isTypeAliasDeclaration(node) &&
      /Props$/.test(node.name.text) &&
      ts.isTypeLiteralNode(node.type)
    ) {
      capture(node.type.members)
    }
    ts.forEachChild(node, (n) => {
      visit(n)
    })
  }
  visit(src)
  return { props, open }
}

function readExportedNames(src: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) names.add(el.name.text)
    }
    const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
    const isExported = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    if (isExported) {
      if (ts.isVariableStatement(node)) {
        for (const d of node.declarationList.declarations) names.add(d.name.getText(src))
      } else if (
        (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
        node.name
      ) {
        names.add(node.name.text)
      }
    }
    ts.forEachChild(node, (n) => {
      visit(n)
    })
  }
  visit(src)
  return names
}

const STATE_WORDS = [
  'hover', 'focus', 'active', 'disabled', 'loading', 'error', 'selected',
  'checked', 'pressed', 'invalid', 'readonly', 'expanded',
]

/* ------------------------------------------------------------------- components */

function extractComponents(root: string, files: string[], rootExports: Set<string>): ComponentFact[] {
  const out: ComponentFact[] = []

  for (const file of files) {
    if (!/\.(tsx|jsx)$/.test(file)) continue
    if (/\.(test|spec|stories)\./.test(file)) continue
    // Demos, docs and registries are not the library, and counting them turns
    // every `AccordionDemo` into a component.
    if (NON_LIBRARY.test(file)) continue
    const text = read(file)
    if (!text) continue

    const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
    const exported = readExportedNames(src)
    const base = path.basename(file).replace(/\.(tsx|jsx)$/, '')
    // A component is a PascalCase export; fall back to the filename for default exports.
    const candidates = [...exported].filter((n) => /^[A-Z][A-Za-z0-9]*$/.test(n))
    const name = candidates.find((c) => c === base) ?? candidates[0] ?? (/^[A-Z]/.test(base) ? base : null)
    if (!name) continue

    const cva = readCva(src)
    const { props, open } = readProps(src, text, Object.keys(cva.variants))
    const raw = findRawValues(file, text)
    const tokens = [...new Set((text.match(/var\(--[a-zA-Z0-9-]+\)/g) ?? []).map((t) => t.slice(6, -1)))]
    const states = STATE_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(text))

    const dir = path.dirname(file)
    const hasDoc =
      fs.existsSync(path.join(dir, `${name}.md`)) ||
      fs.existsSync(path.join(dir, 'README.md')) ||
      /\/\*\*[\s\S]{40,}?\*\//.test(text)

    out.push({
      name,
      file: path.relative(root, file).replace(/\\/g, '/'),
      exported: rootExports.size === 0 ? true : rootExports.has(name),
      props,
      variants: cva.variants,
      variantClasses: cva.variantClasses,
      defaultVariants: cva.defaultVariants,
      openVariants: open,
      rawValues: raw,
      tokensUsed: tokens,
      states,
      hasDoc,
      loc: text.split('\n').length,
    })
  }

  // Deduplicate by name, keeping the richest record (source beats a re-export).
  const byName = new Map<string, ComponentFact>()
  for (const c of out) {
    const prev = byName.get(c.name)
    if (!prev || Object.keys(c.variants).length > Object.keys(prev.variants).length) byName.set(c.name, c)
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/* ----------------------------------------------------------------------- tokens */

/** Primitive names describe appearance; semantic names describe purpose. */
const PRIMITIVE_RE = /^--(?:[a-z]+-)?(?:\d{2,3}|(?:blue|red|green|gray|grey|slate|zinc|orange|yellow|purple|pink|teal|cyan)-?\d{0,3})$/i
const SEMANTIC_HINT = /(bg|text|fg|border|surface|action|danger|success|warning|muted|accent|brand|content|ring|shadow|space|radius|font)-/i

function extractTokens(root: string, cssFiles: string[]): TokenFact[] {
  const tokens: TokenFact[] = []
  for (const file of cssFiles) {
    const text = read(file)
    if (!text) continue
    const lines = text.split('\n')
    lines.forEach((line, i) => {
      const m = line.match(/^\s*(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/)
      if (!m) return
      const [, name, value] = m
      let tier: TokenFact['tier'] = 'unknown'
      if (PRIMITIVE_RE.test(name)) tier = 'primitive'
      else if (SEMANTIC_HINT.test(name)) tier = value.trim().startsWith('var(') ? 'semantic' : 'semantic'
      else if (/^--[a-z]+-[a-z]+-[a-z]+/.test(name)) tier = 'component'
      tokens.push({
        name: name.slice(2),
        value: value.trim(),
        tier,
        file: path.relative(root, file).replace(/\\/g, '/'),
        line: i + 1,
      })
    })
  }
  return tokens
}

/**
 * Cascade position per selector.
 *
 * Unlayered CSS beats layered CSS unconditionally — regardless of specificity or
 * source order. So a consumer utility aimed at an unlayered component rule is not
 * merely weak, it is INERT and does nothing at all. A library where some families
 * are layered and others are not produces mixed override outcomes, which neither a
 * person nor a model can reason about.
 */
function analyseCascade(cssFiles: string[]) {
  const layers: string[] = []
  let layered = 0
  let unlayered = 0

  for (const file of cssFiles) {
    const text = read(file)
    if (!text) continue
    for (const m of text.matchAll(/@layer\s+([a-zA-Z0-9_,\s-]+)[;{]/g)) {
      for (const n of m[1].split(',')) {
        const name = n.trim()
        if (name && !layers.includes(name)) layers.push(name)
      }
    }
    // Track brace depth, marking whether we are inside an @layer block.
    let depth = 0
    const layerDepths: number[] = []
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === '{') {
        const before = text.slice(Math.max(0, i - 200), i)
        const isLayer = /@layer\s+[a-zA-Z0-9_,\s-]+\s*$/.test(before)
        depth++
        if (isLayer) layerDepths.push(depth)
      } else if (ch === '}') {
        if (layerDepths.at(-1) === depth) layerDepths.pop()
        depth--
      } else if (ch === '.' || ch === '#') {
        const rest = text.slice(i, i + 160)
        if (/^[.#][a-zA-Z0-9_-]+[^{}]*\{/.test(rest) && depth === (layerDepths.length ? layerDepths.at(-1)! : 0)) {
          if (layerDepths.length) layered++
          else unlayered++
        }
      }
    }
  }
  return { layers, layered, unlayered }
}

/* ------------------------------------------------------------------------ entry */

export function extract(inputRoot: string): SystemFacts {
  const located = locate(inputRoot)
  const root = located.root
  const files = walk(root)
  const rel = (f: string) => path.relative(root, f).replace(/\\/g, '/')

  // package.json: the shallowest one that is not a fixture
  const pkgFiles = files.filter((f) => path.basename(f) === 'package.json')
  pkgFiles.sort((a, b) => a.split(path.sep).length - b.split(path.sep).length)
  const pkgPath = pkgFiles[0] ?? null
  let pkg: Record<string, unknown> | null = null
  if (pkgPath) {
    try {
      pkg = JSON.parse(read(pkgPath) ?? '{}')
    } catch {
      pkg = null
    }
  }
  const pkgRoot = pkgPath ? path.dirname(pkgPath) : root

  // Built types are authoritative — a consumer resolves those, not src.
  const dts = files.filter((f) => f.endsWith('.d.ts'))
  const entryDts = dts.find((f) => /index\.d\.ts$/.test(f))
  let rootExports = new Set<string>()
  if (entryDts) {
    const t = read(entryDts)
    if (t) rootExports = readExportedNames(ts.createSourceFile(entryDts, t, ts.ScriptTarget.Latest, true))
  }
  if (rootExports.size === 0) {
    const entryTs = files.find((f) => /src[\\/]index\.tsx?$/.test(f))
    const t = entryTs ? read(entryTs) : null
    if (t && entryTs) {
      rootExports = readExportedNames(ts.createSourceFile(entryTs, t, ts.ScriptTarget.Latest, true))
    }
  }

  const components = extractComponents(root, files, rootExports)
  const cssFiles = files.filter((f) => /\.(css|scss)$/.test(f) && !/node_modules/.test(f))
  const tokens = extractTokens(root, cssFiles)
  const cascade = analyseCascade(cssFiles)

  const findFile = (name: string) => {
    const hit = files.find((f) => path.basename(f).toLowerCase() === name.toLowerCase())
    return hit ? rel(hit) : null
  }

  const knowledgeFiles = {
    'AGENTS.md': findFile('AGENTS.md'),
    'llms.txt': findFile('llms.txt'),
    'components.json': findFile('components.json'),
    'curation.json': findFile('curation.json'),
    'RULES.md': findFile('RULES.md'),
    'design.md': findFile('design.md'),
  }

  const readBuiltTypes = Boolean(entryDts)
  // Degraded when we found component files but resolved almost no prop surface:
  // that means contract checks have nothing to inspect and must NOT report pass.
  const withProps = components.filter((c) => c.props.length > 0 || Object.keys(c.variants).length > 0)
  const degraded = components.length > 0 && withProps.length / components.length < 0.34
  const rawValueTotal = components.reduce((n, c) => n + c.rawValues.length, 0)

  return {
    root,
    locatedReason: located.reason,
    locatedCandidates: located.candidates,
    packageName: (pkg?.name as string) ?? path.basename(root),
    packageJson: pkg,
    private: pkg?.private === true,
    hasExports: Boolean(pkg && 'exports' in pkg),
    hasTypes: Boolean(pkg && ('types' in pkg || 'typings' in pkg)) || readBuiltTypes,
    hasAgentDocs: Boolean(pkg && 'agentDocs' in pkg),
    readBuiltTypes,
    degraded,
    degradedReason: degraded
      ? `resolved a prop surface for only ${withProps.length} of ${components.length} components`
      : undefined,
    components,
    tokens,
    cssFiles: cssFiles.map(rel),
    cssLayers: cascade.layers,
    layeredSelectors: cascade.layered,
    unlayeredSelectors: cascade.unlayered,
    knowledgeFiles,
    hasStories: files.some((f) => /\.stories\.(tsx?|jsx?|mdx)$/.test(f)),
    hasLint: files.some((f) => /eslint|biome/.test(path.basename(f))),
    hasCi: files.some((f) => /\.github[\\/]workflows/.test(f)),
    hasTests: files.some((f) => /\.(test|spec)\.(tsx?|jsx?)$/.test(f)),
    fileCount: files.length,
    rawValueTotal,
  }
}
