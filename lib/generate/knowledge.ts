/**
 * Archetype knowledge — the judgment layer.
 *
 * These are the fields no compiler can measure: what else people call a thing, when
 * to reach for it, and — the expensive one — when NOT to, and what to use instead.
 *
 * Everything here is recorded knowledge about well-known UI archetypes, matched by
 * name and shape. A component that matches NO archetype does not get invented
 * guidance: it gets `TODO(human)` with the specific question to answer. A guessed
 * rule is worse than an absent one, because it will be trusted.
 */

export interface Archetype {
  aliases: string[]
  purpose: string
  useWhen: string[]
  useInstead: { when: string; use: string }[]
  a11y: { role: string; requiredLabel: string; keyboard: string }
  composition?: {
    minChildren?: number
    maxChildren?: number
    allowedChildren?: string[]
    allowedParents?: string[]
    maxNestingDepth?: number
  }
  content?: { labelMinChars?: number; labelMaxChars?: number; overflow?: string }
  /** Components an agent reaches for by mistake instead of this one. */
  nearMiss: { reachesFor: string; actually: string }[]
}

export const ARCHETYPES: Record<string, Archetype> = {
  button: {
    aliases: ['btn', 'cta', 'action', 'call to action', 'submit button', 'pressable'],
    purpose: 'A single action the user can take, triggered by click or Enter/Space.',
    useWhen: [
      'the element performs an action rather than navigating to a new page',
      'the action is the direct result of the user pressing it',
      'the label names the action in one to three words',
    ],
    useInstead: [
      { when: 'it navigates to another page or view', use: 'Link' },
      { when: 'there are 2-4 mutually exclusive options', use: 'ButtonGroup' },
      { when: 'it toggles a single boolean on and off', use: 'Switch' },
      { when: 'the action is destructive and irreversible', use: 'Button variant="danger" inside a confirm dialog' },
    ],
    a11y: {
      role: 'button',
      requiredLabel: 'visible text, or aria-label when the button is icon-only',
      keyboard: 'Enter and Space activate; it is a single tab stop',
    },
    content: { labelMinChars: 2, labelMaxChars: 24, overflow: 'labels never truncate — shorten the label instead' },
    nearMiss: [
      { reachesFor: 'a <button> element styled with utilities', actually: 'Button — hand-rolling loses every variant and the focus ring' },
      { reachesFor: 'Button with an href', actually: 'Link — a button that navigates breaks middle-click and open-in-new-tab' },
    ],
  },

  card: {
    aliases: ['panel', 'tile', 'surface', 'container', 'box', 'well'],
    purpose: 'A bounded surface grouping related content into one visual unit.',
    useWhen: [
      'the content inside belongs together and is separable from what surrounds it',
      'the group needs its own background, border or elevation',
      'the card is a repeated unit in a list or grid, or a standalone section',
    ],
    useInstead: [
      { when: 'the surface is a full page region with no elevation', use: 'Panel' },
      { when: 'the content is a transient message', use: 'Alert' },
      { when: 'the whole surface is clickable and navigates', use: 'Card wrapped in Link, never a Card with onClick' },
      { when: 'it overlays the page and traps focus', use: 'Dialog' },
    ],
    a11y: {
      role: 'group when it has a heading, otherwise none',
      requiredLabel: 'aria-labelledby pointing at the card title when a heading is present',
      keyboard: 'the card itself is not focusable; interactive children keep their own tab stops',
    },
    composition: { maxNestingDepth: 1, allowedParents: ['Panel', 'Grid', 'Stack', 'main'] },
    nearMiss: [
      { reachesFor: 'a <div> with a border and padding utilities', actually: 'Card — hand-rolling drifts from the elevation scale' },
      { reachesFor: 'Card for a warning message', actually: 'Alert — a Card carries no severity semantics' },
      { reachesFor: 'nested Cards', actually: 'one Card containing Panels — nested elevation reads as a rendering bug' },
    ],
  },

  badge: {
    aliases: ['tag', 'chip', 'pill', 'label', 'status indicator', 'counter'],
    purpose: 'A short status or category marker attached to other content.',
    useWhen: [
      'the text is one or two words of status, category or count',
      'it labels something adjacent rather than standing alone',
      'it is not interactive',
    ],
    useInstead: [
      { when: 'the user can click it or dismiss it', use: 'Chip' },
      { when: 'it is a standalone message with a body', use: 'Alert' },
      { when: 'it is the primary action', use: 'Button' },
    ],
    a11y: {
      role: 'status when the value changes at runtime, otherwise none',
      requiredLabel: 'colour alone must never carry the meaning — the text does',
      keyboard: 'not focusable',
    },
    content: { labelMaxChars: 16, overflow: 'never truncate a badge — shorten the vocabulary instead' },
    nearMiss: [
      { reachesFor: 'Badge as a button', actually: 'Button — a Badge has no press affordance or focus ring' },
    ],
  },

  input: {
    aliases: ['text field', 'textbox', 'form field', 'entry'],
    purpose: 'A single-line free-text value entered by the user.',
    useWhen: [
      'the value is short free text the user types',
      'there is no fixed set of acceptable values',
    ],
    useInstead: [
      { when: 'the value is one of a fixed set', use: 'Select' },
      { when: 'the text runs to multiple lines', use: 'Textarea' },
      { when: 'the value is a number with a range', use: 'NumberInput' },
      { when: 'the value is a date', use: 'DatePicker' },
    ],
    a11y: {
      role: 'textbox',
      requiredLabel: 'a visible <label> bound by id — placeholder is not a label',
      keyboard: 'standard text editing; a single tab stop',
    },
    nearMiss: [
      { reachesFor: 'placeholder text as the field label', actually: 'the label prop — placeholder disappears on focus and is invisible to many screen readers' },
    ],
  },

  panel: {
    aliases: ['section', 'region', 'well', 'container', 'group'],
    purpose: 'A flat page region grouping content without elevation.',
    useWhen: [
      'the grouping is structural rather than a repeated unit',
      'the region needs a subdued background but no border or shadow',
    ],
    useInstead: [
      { when: 'the unit repeats in a list or grid', use: 'Card' },
      { when: 'the region needs elevation', use: 'Card tone="raised"' },
    ],
    a11y: {
      role: 'region when it has a heading',
      requiredLabel: 'aria-labelledby pointing at the heading',
      keyboard: 'not focusable',
    },
    nearMiss: [
      { reachesFor: 'Panel for a repeated list item', actually: 'Card — Panel has no elevation scale' },
    ],
  },

  alert: {
    aliases: ['callout', 'banner', 'notice', 'message', 'inline message', 'toast'],
    purpose: 'A message about the state of the system or the result of an action.',
    useWhen: [
      'the message is about system state, not page content',
      'the severity changes what the user should do next',
    ],
    useInstead: [
      { when: 'it disappears on its own after a few seconds', use: 'Toast' },
      { when: 'it blocks the page until acknowledged', use: 'Dialog' },
      { when: 'it is a short status marker on other content', use: 'Badge' },
    ],
    a11y: {
      role: 'alert for errors, status for everything else',
      requiredLabel: 'the severity must be in the text, not only in the colour',
      keyboard: 'not focusable unless it contains an action',
    },
    nearMiss: [
      { reachesFor: 'Card with a red border', actually: 'Alert severity="error" — a Card announces nothing to a screen reader' },
    ],
  },
}

/** Match a component to an archetype by name, then by common suffix. */
export function archetypeFor(name: string): { key: string; archetype: Archetype } | null {
  const lower = name.toLowerCase()
  if (ARCHETYPES[lower]) return { key: lower, archetype: ARCHETYPES[lower] }
  for (const key of Object.keys(ARCHETYPES)) {
    if (lower.endsWith(key) || lower.startsWith(key)) return { key, archetype: ARCHETYPES[key] }
  }
  return null
}

/** The marker used wherever a real answer is unknown. Never a guess. */
export const todo = (question: string) => `TODO(human): ${question}`
