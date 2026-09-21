# When the system is not Tailwind + CVA

The default path assumes Tailwind utilities with `class-variance-authority`. Most real
systems are not that. Call the topology out loud before measuring, and say which
checks are substituted — an unstated substitution is a silent measurement error.

```bash
grep -l 'class-variance-authority\|tailwind-variants' <pkg>/package.json
grep -l 'styled-components\|@emotion'                 <pkg>/package.json
grep -l '@vanilla-extract'                            <pkg>/package.json
grep -l '@mui/\|antd\|@chakra-ui'                     <pkg>/package.json
ls <pkg>/src/**/*.module.css  <pkg>/src/**/*.scss
```

---

## CSS Modules + plain classes

**Very common, and the case the default path handles worst.** Components carry
`className="btn btn--primary"` and the styling lives in a separate stylesheet — often
a separate *package*.

- **Variants** come from the type system, not a cva map. Resolve string-union aliases
  (`type Variant = 'solid' | 'light'`) and inline literal unions.
- **Defaults** come from the signature: `({ variant = 'solid' })`.
- **Raw values** live in the CSS, not the TSX, so a low raw-value count means nothing.
  Scan the stylesheets too before concluding the component is tokenised.
- **L3 `no-raw-values` should be read against the CSS**, not the component source.

## CSS-in-JS — styled-components, Emotion

- Variants are template-literal interpolations keyed on props. The axis is often a
  union type on the props interface; take it from there.
- Raw values sit inside the template literal — scan `TemplateExpression` nodes, not
  just string literals.
- **L2 cascade is unscorable.** Styles are injected at runtime with generated class
  names and no `@layer`. Report `unscored` and say why. Do not infer a cap.
- The override question changes shape: a consumer overrides by wrapping with
  `styled(Component)`, not by passing a class. `RULES.md` must say that instead.

## vanilla-extract

- Variants come from `recipe({ variants: … })` — the same shape as cva, different
  import. Read it the same way.
- Tokens are already a typed contract (`createThemeContract`). L1 usually passes
  outright; check tier separation rather than existence.

## A wrapper over MUI / Ant / Chakra

The awkward case: most of the contract belongs to the underlying library.

- **Score what the wrapper adds**, and say explicitly that the base library's surface
  is out of scope. A wrapper inherits hundreds of props it never documents; counting
  those against it produces a number nobody can act on.
- `curation.json` matters more here than anywhere else: the near-miss is almost always
  *the base library's component used directly instead of the wrapper*.
- Check whether the wrapper **narrows** the base API or merely re-exports it. A
  re-export with no narrowing is not a design system, and saying so plainly is more
  useful than scoring it.

## SCSS with `@extend` and mixins

- Variants are often mixin names, not props. There may be no runtime variant axis at
  all — the contract is the class name.
- The looks-like index carries more weight, since an agent cannot discover a class
  name from a type.
- L4 is frequently `unscored` rather than failing. A system with no variant props does
  not have open ones.

## Web components

- Props are attributes; the contract is the custom-element definition plus `observedAttributes`.
- Shadow DOM makes the cascade question moot — report L2 `unscored`, and note that
  consumer overrides require exposed CSS custom properties or `::part`.
- Whether `::part` is exposed is the real contract question, and worth a finding.

## A monorepo

Covered in `SKILL.md` step 0 and worth repeating, because it is the single biggest
measurement error available:

- **Components are package-scoped. Tokens are system-wide.**
- Score the component package, but read stylesheets from the whole tree.
- Name the package you audited and list the others you saw, so the call can be
  disputed.

---

## Two questions worth asking before scoring anything

**Is this a design system, or a component folder?** A folder of components with no
token layer, no documentation and no distribution story is not a design system that
scored badly — it is a different kind of thing. Say that, and the conversation
improves.

**Is the styling even in this repository?** One real system references
`@salesforce-ux/design-system` for every visual. The markup can be recovered and the
contract scored, but nothing renders and no raw values appear. Both facts need stating
or the report reads as a pass on the token layer.
