/**
 * Recover the markup a component actually renders.
 *
 * This is the difference between showing a component and showing its name in a box.
 * The JSX a component returns is a real element tree with real class names; walking
 * it produces static HTML that, with the source's own stylesheet, renders the actual
 * component rather than a placeholder.
 *
 * Everything here is MEASURED from the AST. Where a value cannot be resolved — a
 * computed class, a child component, an interpolated string — the slot is filled
 * with something visibly representative and the fact is recorded, never invented.
 */
import ts from 'typescript'

export interface MarkupResult {
  html: string
  /** Class names referenced, so a stylesheet can be checked for them. */
  classes: string[]
  /** Slots that could not be resolved statically. */
  unresolved: string[]
}

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Attributes worth carrying into static HTML. Handlers and refs are dropped. */
const KEEP_ATTR = /^(class|className|style|role|type|href|src|alt|placeholder|value|aria-[\w-]+|data-[\w-]+)$/

/**
 * Pull every string literal out of an expression.
 *
 * `cn('base', active && 'is-active')` yields both; a conditional cannot be resolved
 * statically, so taking all branches renders the fullest version of the component
 * rather than an arbitrary one.
 */
function literalsIn(node: ts.Node, src: ts.SourceFile, out: string[] = []): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    out.push(node.text)
  } else if (ts.isTemplateExpression(node)) {
    out.push(node.head.text)
    for (const span of node.templateSpans) out.push(span.literal.text)
  }
  ts.forEachChild(node, (n) => {
    literalsIn(n, src, out)
  })
  return out
}

/** Inline style object, keeping only literal values. */
function styleFrom(node: ts.Node, src: ts.SourceFile): string {
  const decls: string[] = []
  const walk = (n: ts.Node) => {
    if (ts.isObjectLiteralExpression(n)) {
      for (const p of n.properties) {
        if (!ts.isPropertyAssignment(p)) continue
        const key = p.name.getText(src).replace(/['"]/g, '')
        const init = p.initializer
        let value: string | null = null
        if (ts.isStringLiteral(init)) value = init.text
        else if (ts.isNumericLiteral(init)) value = /width|height|size|top|left|right|bottom|margin|padding|radius/i.test(key) ? `${init.text}px` : init.text
        if (value) decls.push(`${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${value}`)
      }
    }
    ts.forEachChild(n, (c) => { walk(c) })
  }
  walk(node)
  return decls.join(';')
}

/** Representative text for a slot that only exists at runtime. */
function slotText(name: string): string {
  if (/children/i.test(name)) return 'Content'
  if (/label|title|heading|text|name/i.test(name)) return 'Label'
  if (/icon/i.test(name)) return '◆'
  if (/count|number|value/i.test(name)) return '3'
  return ''
}

/**
 * Local variables that hold an element type.
 *
 * `const Comp = asChild ? Slot : 'nav'` is the Radix polymorphic pattern and it is
 * everywhere. Without resolving it, `<Comp>` looks like a nested component, the
 * whole root element disappears into a marker, and the preview shows a chip instead
 * of the nav the component actually renders.
 *
 * The string-literal branch is the real default — the other branch only applies when
 * a consumer passes `asChild`.
 */
function resolveElementAliases(src: ts.SourceFile): Record<string, string> {
  const out: Record<string, string> = {}
  const visit = (node: ts.Node): void => {
    if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        const name = d.name.getText(src)
        if (!/^[A-Z]/.test(name) || !d.initializer) continue
        const init = d.initializer

        // `cond ? Slot : 'nav'` — take whichever branch is a string literal.
        if (ts.isConditionalExpression(init)) {
          for (const branch of [init.whenFalse, init.whenTrue]) {
            if (ts.isStringLiteral(branch)) { out[name] = branch.text; break }
          }
        } else if (ts.isStringLiteral(init)) {
          out[name] = init.text
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

export function extractMarkup(
  src: ts.SourceFile,
  componentName: string,
  maxDepth = 6,
): MarkupResult | null {
  const classes: string[] = []
  const unresolved: string[] = []
  const elementAliases = resolveElementAliases(src)

  /** The JSX returned by the component's own declaration. */
  const findReturnJsx = (): ts.Node | null => {
    let body: ts.Node | null = null
    const findBody = (node: ts.Node): void => {
      if (body) return
      if (ts.isVariableStatement(node)) {
        for (const d of node.declarationList.declarations) {
          if (d.name.getText(src) !== componentName || !d.initializer) continue
          if (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) {
            body = d.initializer.body
          } else if (ts.isCallExpression(d.initializer)) {
            for (const a of d.initializer.arguments) {
              if (ts.isArrowFunction(a) || ts.isFunctionExpression(a)) body = a.body
            }
          }
        }
      } else if (ts.isFunctionDeclaration(node) && node.name?.text === componentName && node.body) {
        body = node.body
      } else if (ts.isClassDeclaration(node) && node.name?.text === componentName) {
        for (const m of node.members) {
          if (ts.isMethodDeclaration(m) && m.name.getText(src) === 'render' && m.body) body = m.body
        }
      }
      ts.forEachChild(node, (n) => { findBody(n) })
    }
    findBody(src)
    if (!body) return null

    // An arrow with an expression body returns its JSX directly.
    if (ts.isParenthesizedExpression(body) || ts.isJsxElement(body) || ts.isJsxSelfClosingElement(body) || ts.isJsxFragment(body)) {
      return body
    }

    // Otherwise take the LAST return that contains JSX — earlier ones are usually
    // early-exit branches rendering a degenerate case.
    let best: ts.Node | null = null
    const findReturn = (node: ts.Node): void => {
      if (ts.isReturnStatement(node) && node.expression) {
        const hasJsx = (n: ts.Node): boolean => {
          if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) return true
          let found = false
          ts.forEachChild(n, (c) => { if (!found) found = hasJsx(c) })
          return found
        }
        if (hasJsx(node.expression)) best = node.expression
      }
      ts.forEachChild(node, (n) => { findReturn(n) })
    }
    findReturn(body)
    return best
  }

  const attrsOf = (node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string => {
    const parts: string[] = []
    for (const a of node.attributes.properties) {
      if (!ts.isJsxAttribute(a)) continue
      const name = a.name.getText(src)
      if (!KEEP_ATTR.test(name)) continue

      let value = ''
      if (!a.initializer) value = 'true'
      else if (ts.isStringLiteral(a.initializer)) value = a.initializer.text
      else if (ts.isJsxExpression(a.initializer) && a.initializer.expression) {
        const expr = a.initializer.expression
        if (name === 'style') {
          value = styleFrom(expr, src)
        } else {
          const lits = literalsIn(expr, src).filter((s) => s.trim())
          value = lits.join(' ').trim()
          if (!value) {
            unresolved.push(`${name}={${expr.getText(src).slice(0, 40)}}`)
            continue
          }
        }
      }
      if (!value) continue
      const attr = name === 'className' ? 'class' : name
      if (attr === 'class') classes.push(...value.split(/\s+/).filter(Boolean))
      parts.push(`${attr}="${esc(value)}"`)
    }
    return parts.length ? ' ' + parts.join(' ') : ''
  }

  const render = (node: ts.Node, depth: number): string => {
    if (depth > maxDepth) return ''

    if (ts.isParenthesizedExpression(node)) return render(node.expression, depth)

    if (ts.isJsxFragment(node)) {
      return node.children.map((c) => render(c, depth)).join('')
    }

    if (ts.isJsxText(node)) {
      const t = node.text.replace(/\s+/g, ' ')
      return t.trim() ? esc(t) : ''
    }

    if (ts.isJsxExpression(node)) {
      if (!node.expression) return ''
      // A conditional renders its consequent so the fuller state is shown.
      if (ts.isConditionalExpression(node.expression)) {
        return render(node.expression.whenTrue, depth)
      }
      if (ts.isJsxElement(node.expression) || ts.isJsxSelfClosingElement(node.expression)) {
        return render(node.expression, depth)
      }
      // `{children}`, `{label}` and friends are runtime slots.
      const text = node.expression.getText(src)
      const lits = literalsIn(node.expression, src).filter((s) => s.trim())
      if (lits.length) return esc(lits[0])
      const filled = slotText(text)
      if (!filled) unresolved.push(`{${text.slice(0, 30)}}`)
      return filled ? esc(filled) : ''
    }

    if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
      const open = ts.isJsxElement(node) ? node.openingElement : node
      const raw = open.tagName.getText(src)
      // A polymorphic alias resolves to the tag it actually renders.
      const tagName = elementAliases[raw] ?? raw
      const isHost = /^[a-z]/.test(tagName)
      const attrs = attrsOf(open)

      // A nested design-system component cannot be expanded without resolving the
      // import, so it becomes a labelled inline marker rather than vanishing.
      if (!isHost) {
        unresolved.push(`<${tagName}/>`)
        const inner = ts.isJsxElement(node)
          ? node.children.map((c) => render(c, depth + 1)).join('')
          : ''
        return `<span class="pl-slot" data-component="${esc(tagName)}">${inner || esc(tagName)}</span>`
      }

      const tag = tagName.toLowerCase()
      if (VOID_TAGS.has(tag)) return `<${tag}${attrs} />`

      const children = ts.isJsxElement(node)
        ? node.children.map((c) => render(c, depth + 1)).join('')
        : ''
      return `<${tag}${attrs}>${children}</${tag}>`
    }

    return ''
  }

  const jsx = findReturnJsx()
  if (!jsx) return null
  const html = render(jsx, 0).trim()
  if (!html) return null

  return { html, classes: [...new Set(classes)], unresolved: [...new Set(unresolved)] }
}
