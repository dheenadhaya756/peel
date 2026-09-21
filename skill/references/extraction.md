# Extraction — and the traps

Everything here is measured from the AST or the file system. Nothing is inferred and
nothing is asked of a model. If a fact cannot be read it is **absent**, never guessed.

Read this whole file before writing an extractor. Every trap below was found by
running against a real design system, and each one fails *silently* — the code exits
clean and reports nothing, which is worse than crashing.

---

## The traps

### 1. `.tsx` must be parsed with `ScriptKind.TSX`

```ts
ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
```

Without it, `<div>` in a `.tsx` file is parsed as a **type assertion**, so the tree
contains no `JsxElement` nodes at all. Any detection that looks for rendering finds
nothing while appearing to work perfectly.

Parse `.js`, `.jsx`, `.mjs` and `.cjs` as `ScriptKind.JSX` too — a large share of
React design systems ship JSX in plain `.js`, and skipping them reports zero
components on a system that plainly has them.

### 2. `ts.forEachChild` halts on a truthy return

```ts
ts.forEachChild(node, (n) => { visit(n) })     // correct
ts.forEachChild(node, (n) => visit(n, out))    // BUG if visit returns anything
```

It stops as soon as the callback returns something truthy. A callback returning an
accumulator array — always truthy — visits only the leftmost spine of the tree. In
practice a raw hex in `style={{ borderColor: '#E2E8F0', color: '#0F172A' }}` is never
reported, and the checker exits 0 looking clean.

### 3. `defaultVariants` is erased from the emitted `.d.ts`

Read **source**, not built types. A docs generator reading only `.d.ts` reports zero
defaults across an entire library and scores it undocumented when it is not.

### 4. Defaults also live in the signature

```tsx
const Alert = ({ variant = 'info', dismissible = false }) => …
```

That is a real default that never reaches a `.d.ts` or a cva map. On one real system,
48 of 162 components declared defaults only this way. Without reading them the
generator adopts the first variant value and records an assumption, when the answer
was in the signature.

### 5. A string-union type alias IS a closed variant set

```ts
export type AlertVariant = 'error' | 'info' | 'offline' | 'warning'
interface AlertProps { variant: AlertVariant }
```

Declared in the type system rather than a cva map. Without resolving local aliases,
`variant` reads as the opaque `AlertVariant`, the axis is invisible, and a system that
already closed its variants is reported as though it had not. On one real system this
was the difference between **0 and 53** components having variant axes.

Only treat a union as closed when **every** member is a string literal. A union
containing `string` is still open.

### 6. Type exports are not components

```ts
export { MenuDropdown, type MenuDropdownProps }
```

Collect exported **value** names only. Skip `export type { … }` clauses and
`isTypeOnly` elements. Otherwise a props interface becomes a candidate and wins
whenever it sorts first — producing a "component" with no variants, no tokens and no
visual.

Reject names ending `Props`, `Options`, `Config`, `Context`, `Type`, `Ref`, `Handle`,
`State`, `Args`, `Schema`, `Variants`, `Styles`, `Theme`.

### 7. A component must actually render

PascalCase and exported is not enough — `export const Sizes = {…}` and
`export const ButtonVariants = cva(…)` both pass that test and neither is a component.

Require evidence: JSX in the body, a `forwardRef` / `memo` / `styled` factory, or a
class extending `Component`.

### 8. Polymorphic elements hide the root

```tsx
const Comp = asChild ? Slot : 'nav'
return <Comp className={cn('sidebar-nav', className)}>…</Comp>
```

The Radix `asChild` pattern, and it is everywhere. Unresolved, `<Comp>` reads as a
nested component, the root element disappears into a marker, and the preview shows a
chip where the nav should be.

Resolve local `const X = cond ? A : 'tag'` aliases to the string-literal branch — the
other branch only applies when a consumer passes `asChild`.

### 9. Exclusion patterns must match relative paths

`NON_LIBRARY.test(absolutePath)` excludes a repository that happens to live under a
folder named `fixtures/` or `test/`. Always test the path **relative to the audited
root**.

### 10. Tokens live in a different package from components

Covered in `SKILL.md` step 0, and worth repeating because it is the single biggest
measurement error available: components are package-scoped, tokens are system-wide.

---

## What to extract

### Per component

| Field | How |
|---|---|
| `name` | The rendering export matching the filename, else any rendering export |
| `exported` | Present in the entry point's value exports |
| `props` | `interface <Name>Props` members: name, type, required, **JSDoc** |
| `variants` | cva axes **merged with** type-alias axes |
| `variantClasses` | The literal class string each branch applies — the only place a variant's real styling can be recovered |
| `defaultVariants` | cva `defaultVariants` **merged with** signature defaults |
| `openVariants` | Props typed `string` whose name matches a real axis |
| `rawValues` | Hex, px, rgb literals with line numbers |
| `markup` | Static HTML recovered from the returned JSX |
| `docComment` | The component's own JSDoc — this is the purpose, already written |
| `states` | hover/focus/disabled/loading/error found in source |

### Recovering markup

Walk the JSX of the component's return statement into static HTML. Take the **last**
return containing JSX — earlier ones are usually early-exit branches rendering a
degenerate case.

- Keep `class`, `style`, `role`, `type`, `href`, `alt`, `placeholder`, `aria-*`,
  `data-*`. Drop handlers and refs.
- `className={cn('base', active && 'is-active')}` — take **all** string literals.
  A conditional cannot be resolved statically, so taking every branch renders the
  fullest version rather than an arbitrary one.
- A conditional child renders its consequent.
- `{children}`, `{label}` and friends are runtime slots — fill with representative
  content, never with the component's own name. A component's name written inside a
  box is a caption, not a rendering, and it makes every structural component look
  identical.
- A nested design-system component becomes a marked slot, expandable one level from
  the other components' markup. One level only — deeper risks a cycle.

### Per system

`package.json` (private, exports, types, agentDocs), every custom property with its
value and `file:line`, the `@layer` names in the emitted CSS, layered vs unlayered
selector counts, which knowledge-base files exist, whether stories / lint / CI /
tests are present.

### The cascade

For every component family, determine whether a consumer's utility **wins**, is
**inert**, or is **contested**. Walk the emitted stylesheet's brace structure
backwards from each selector offset to find its enclosing `@layer`.

**Unlayered CSS beats layered CSS unconditionally** — regardless of specificity or
source order. A utility aimed at an unlayered component rule is not weak, it does
nothing at all. Mixed outcomes inside one library is a **blocker**, not a gap:
neither a person nor a model can reason about it.

---

## The degraded read

Set `degraded` when a prop surface resolved for fewer than a third of the components
found. Gate every contract check on it and report `unscored`, never `pass`.

This is not theoretical. On one run with `node_modules` missing, 16 components
resolved to 1, two checks silently flipped from `fail` to `pass` because they had
nothing left to inspect, and the composite went **up**, 30 → 33. Someone runs the tool
on a client machine, gets a better number, and ships.
