# The playbook and the storybook

A score nobody can see is a number to argue with. A score next to the thing it
describes is a finding.

Two renders, and they do different jobs:

| | When | What it proves |
|---|---|---|
| **Playbook I** | After scoring, before generating | What is there now — and whether extraction actually worked |
| **Playbook II** | After generating | What changed, side by side, from real code on both sides |
| **Storybook** | After generating | Every variant and state, rendered from the contract |

Both playbooks are **one self-contained HTML file**: no bundler, no server, no
install, nothing fetched. Open it, or print it to PDF.

---

## Rendering the BEFORE side honestly

This is where it is easiest to cheat and most damaging to.

**Render the markup the component really returns**, recovered by walking its JSX —
real elements, real class names. Then apply the base and variant classes to the root
so each specimen is the real thing rather than a generic one.

### Compile the utilities the source actually uses

A component styling itself with `bg-[#3b82f6]` renders as nothing without Tailwind.
Emit the exact CSS those arbitrary utilities stand for:

```css
.bg-\[\#3b82f6\] { background-color: #3b82f6 }
.h-\[28px\]      { height: 28px }
```

That is not flattering the source — it is what Tailwind would generate. Leaving it
out makes the before state look broken, which is a different lie.

### Scope the source stylesheet, or it repaints the page

Inlining a design system's CSS verbatim hands it the **whole document**. On one real
system that meant a dark `body` rule repainting the report, eleven `position: fixed`
overlays floating above it, and the entire docs-site stylesheet — headers, dropdowns,
changelog badges — landing on a page that is not a docs site.

The CSS still has to be real, so **scope it rather than edit it**:

- Walk brace-balanced. Recurse into `@media`, `@supports`, `@layer`; leave
  `@keyframes` and `@font-face` alone.
- Prefix every selector with the before-specimen container.
- `:root` / `html` / `body` / `*` — keep **only** the custom property declarations,
  emitted globally so tokens resolve. Drop everything else in the block.
- Rewrite `position: fixed` to `absolute`; a fixed element escapes any scope.

Exclude stylesheets under `apps/`, `docs/`, `website/`, `examples/`, `playground/`
outright — they describe a site, not a component. Unless filtering leaves nothing, in
which case the docs CSS was all there was.

### When there is nothing to render

Say so. `no markup could be recovered from source` is an honest specimen and a real
finding. A box with the component's name in it is neither — and it makes every
structural component look identical, which is how a broken renderer hides for weeks.

---

## Rendering the AFTER side

The generated component, with its generated CSS, consuming the token layer.

- The preview carries the base class and one variant's modifier baked in. **Strip the
  modifier before adding this specimen's**, or two apply at once and the winner is
  decided by the order rules happen to appear in.
- Merge into the existing `class` attribute. A second `class=` is invalid HTML and the
  browser keeps only the first, so the variant silently never applies.
- Substitute placeholders with a **plain global replace**, not a word-boundary one:
  BEM children like `ROOT__icon` and `ROOT--error` do not match `\bROOT\b` because
  `_` and `-` are word characters. Missing them leaves the literal placeholder in the
  markup while the CSS has already been renamed.

---

## The layout

Per component, per variant axis: both specimens side by side, then the prop surfaces,
then the when-NOT-to-use table.

**A component with no variant axes still has to be shown.** Rendering rows only per
axis means anything without a variant map — most of a real design system — produces
an empty panel. Fall back to a single `base` row.

### The prop surface

**Two identical code blocks read as "nothing happened"** and waste the space that
should be carrying the argument.

- Unchanged → collapse to **one** panel saying so. That is usually a *pass*: the props
  were already closed in the source, which is exactly what the audit wants to find.
- Changed → compare **by prop name** so a reordering does not read as a rewrite, mark
  the changed lines on both sides, and count them in the header.

### The scoreboard

Before → after, by axis, plus the measured counts: raw values, open unions, semantic
tokens, recorded decisions. Lead with the verdict in words.

### Decisions taken

Every assumption, stated plainly. **Not** "needs a human" — the output has to stand on
its own. A value the source did not state, resolved from the available evidence and
written down so it can be corrected, is a decision. A blocking marker is an excuse.

---

## The storybook

One story per variant value, one per state, **generated from the contract** and never
hand-written — a hand-written story drifts from what it demonstrates within a release.

```tsx
export default { title: 'After/Button', component: Button }

export const VariantPrimary = () => <Button variant="primary">Button primary</Button>
export const Disabled       = () => <Button disabled>Button disabled</Button>

/** Every variant of every axis, side by side. */
export const AllVariants = () => ( … )
```

Group as `Before/*` and `After/*`, both loading the same token stylesheet, so any
visual difference is real.

This answers two things a scorecard cannot: whether remediation changed the visuals
(it usually should not), and whether the states a component *claims* actually render.

**A variant or state that cannot be rendered from its own contract is a finding**, not
a broken story. It means that criterion was over-scored. Go back and correct it.

An unexpected diff between `Before/*` and `After/*` is a bug you introduced, unless a
raw value in the source was genuinely wrong. Investigate before defending it.

---

## Pacing

The work is fast — a whole conversion runs in about 60ms, most phases at 0ms.
Streamed raw, every phase lands in one frame and none of it is readable.

Pace the **reveal**, not the work: ~260ms per step, with the **true** measured
duration shown on each row. Nothing is padded and the server never waits; only the
read-out is slowed to human speed. Hold the panel until the queue drains, or the last
steps vanish before they can be read.

Each event carries what that phase actually found — `21 raw values removed · 2 axes
closed (variant, size) · 17 tokens consumed` — so the stream is a record of how the
number was arrived at rather than a progress bar.
