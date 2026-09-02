---
name: frontend-style-guide
metadata:
  internal: true
description: Apply the Lightdash frontend style guide and design principles when working on React components or styling frontend code. Use when editing TSX files, building or reviewing UI, fixing styling issues, or when the user mentions Mantine, design, styling, or CSS modules.
allowed-tools: Read, Edit, Write, Glob, Grep
---

# Lightdash Frontend Style Guide

Apply these rules when working on any frontend component in `packages/frontend/`.

## Mantine 8

The app runs on Mantine 8 (`@mantine/core`), with the theme in `src/theme/`.

## Design principles

The theme is neutral and quiet, in the spirit of shadcn, Radix and Kumo: one ink accent, flat surfaces, soft borders, a tight type scale. Most of what "looks right" comes from using the defaults. Check each rule before you add a colour, a shadow or a size.

1. **One accent, and it is ink.** The primary action on a surface is the theme primary (near-black in light, near-white in dark). Never colour a Button or ActionIcon `blue`, `dark`, `indigo` or `ldDark` for emphasis. Colour on a control means state: `red` destructive, `yellow` warning, `teal` "copied", `orange` favourite, `green` only for the existing verify/merge actions. Indigo belongs to AI surfaces. Links are the only blue text.
2. **Hierarchy comes from variant, not colour.** `filled` is the one primary action per card, header or modal footer. `default` (bordered) is secondary. `light` is a tertiary or toggle-like action ("Add filter"). `subtle` is for icon buttons and inline actions; it is the ActionIcon default. If a surface has two filled buttons, one of them is wrong.
3. **Surfaces are flat.** Paper and Card are bordered with no shadow and a 12px radius by default; shadows only on floating layers (Menu and Popover `md`, Modal `lg`). Do not pass `withBorder`, `shadow` or `radius` to restate that. Empty or placeholder sections use `<Paper variant="dotted">`.
4. **Neutrals are tokens, never hand-picked pairs.** `--mantine-color-body` (surface), `--ld-color-page` (canvas), `default-border`, `default-hover`, `text`, `dimmed`, `placeholder`. `ldGray.N` already resolves per scheme (0 canvas, 1 muted fill, 2 border, 3 strong border, 5 tertiary text, 6 = dimmed, 7 label, 9 text), so `light-dark(ldGray-x, ldDark-y)` and `@mixin dark` blocks for neutrals are always a smell. Secondary text is `c="dimmed"`.
5. **Type is a scale, not a slider.** Body is 14/20. Headings are 600 on `Title` orders 1 to 6 (28 to 14px); labels and table headers are 500; everything else 400. Use `fz="xs|sm|md"`, never `fz={13}`. Card and section titles are `Title order={5}`; page tops use `PageHeader`.
6. **Space on the token grid.** Card padding `md`, group gaps `xs`/`sm`, section gaps `lg`, page gutters `lg`/`xl`. No pixel margins; if a layout needs `margin-top: 20px` it is `mt="lg"`.
7. **Icons are quiet.** `MantineIcon` at stroke 1.5, 16px next to text and 14px in xs controls, coloured `dimmed` when they are secondary. Every icon-only button has an `aria-label` and a Tooltip.
8. **Inputs are calm.** Default variant, soft border, focus is a darker border with no ring. `size="xs"` controls carry compact secondary labels automatically. Selects mark the selected option with a check; filter value pickers are the standard combobox, not a custom list.
9. **Motion is functional.** Dropdowns pop from their anchor and modals fade, both from the theme. Nothing else animates unless it shows progress.
10. **Dark mode is designed, not derived.** Check both schemes before you finish. Never read `useMantineColorScheme` to pick a colour; use a token. Editors take `useEditorTheme()`; only JS consumers with no CSS (ECharts, Leaflet) read `useComputedColorScheme`.
11. **States are shared components.** `EmptyStateLoader` for loading, `InlineErrorState` for a failed section, `SuboptimalState` for a failed page, `<Paper variant="dotted">` for "nothing here".
12. **Before writing CSS, look for the thing that already exists:** a variant, a token, an `ld-*` utility class, or a shared control (`CopyActionIcon`, `FavoriteActionIcon`, `ConfirmDeleteButton`, `TruncatedText`, `FilterFacet`, `NumberInput`, `MantineModal`).

**Self-review before you hand a screen over:** open it in light and dark; count filled buttons per surface (max one); look for blue that is not a link; look for a shadow on a card; look for a font size or grey that is not a token; look for an icon button without a tooltip. The Explorer page is the reference surface when in doubt.

## Component Checklist

When creating/updating components:

- [ ] Use `@mantine/core` imports
- [ ] No `style` or `styles` props
- [ ] Check Mantine docs/types for available component props
- [ ] Use inline-style component props for styling when available (and follow <=3 props rule)
- [ ] Use CSS modules when component props aren't available or when more than 3 inline-style props are needed
- [ ] Theme values ('md', 'lg', 'xl', or 'ldGray.1', 'ldGray.2', 'ldDark.1', 'ldDark.2', etc) instead of magic numbers
- [ ] When using mantine colors in css modules, always use the theme awared variables:
    - `--mantine-color-${color}-text`: for text on filled background
    - `--mantine-color-${color}-filled`: for filled background (strong color)
    - `--mantine-color-${color}-filled-hover`: for filled background on hover
    - `--mantine-color-${color}-light`: for light background
    - `--mantine-color-${color}-light-hover`: for light background on hover (light color)
    - `--mantine-color-${color}-light-color`: for text on light background
    - `--mantine-color-${color}-outline`: for outlines
    - `--mantine-color-${color}-outline-hover`: for outlines on hover

## Styling Best Practices

### Core Principle: Theme First

**The goal is to use theme defaults whenever possible.** Style overrides should be the exception, not the rule.

### Styling Hierarchy

1. **Best**: No custom styles (use theme defaults and variants)
2. **Theme extension**: For repeated patterns, add a variant or rule in `src/theme/components/<Component>.module.css` (registered in `src/theme/components/index.ts`)
3. **Component props**: Simple overrides (1-3 props like `mt="xl" w={240}`)
4. **Utility class**: a single layout rule Mantine has no prop for (`ld-shrink-0`, `ld-grow`, `ld-self-center`, `ld-pointer`, `ld-nowrap`, `ld-pre-wrap`, `ld-overflow-hidden`, `ld-scroll-y` in `src/styles/global.css`)
5. **CSS modules**: Complex styling or more than 3 props

### NEVER Use

- `styles` prop (always use CSS modules instead)
- `style` prop (inline styles)

### Theme Extensions (For Repeated Patterns)

If you find yourself applying the same style override multiple times, put it in the theme. Each component has a CSS module in `src/theme/components/` and an entry in `src/theme/components/index.ts`:

```css
/* src/theme/components/Badge.module.css */
.root[data-variant='light'] {
    text-transform: none;
    font-weight: 500;
}
```

```tsx
// src/theme/components/index.ts
Badge: Badge.extend({
    defaultProps: { variant: 'light', color: 'gray' },
    classNames: badgeClasses,
}),
```

Reach for the `vars` callback only when Mantine writes the value inline (button and badge colours, NavLink fill, input font size), because CSS cannot override an inline custom property.

### Context-Specific Overrides

#### Inline-style Component Props (1-3 simple props)

```tsx
// ✅ Good
<Button mt="xl" w={240} c="blue.6">Submit</Button>

// ❌ Bad - Too many props, use CSS modules instead
<Button mt={20} mb={20} ml={10} mr={10} w={240} c="blue.6" bg="white">Submit</Button>
```

Common inline-style props:

- Layout: `mt`, `mb`, `ml`, `mr`, `m`, `p`, `pt`, `pb`, `pl`, `pr`
- Sizing: `w`, `h`, `maw`, `mah`, `miw`, `mih`
- Colors: `c` (color), `bg` (background)
- Font: `ff`, `fs`, `fw`
- Text: `ta`, `lh`

#### CSS Modules (complex styles or >3 props)

Create a `.module.css` file in the same folder as the component:

```css
/* Component.module.css */
.customCard {
    transition: transform 0.2s ease;
    cursor: pointer;
}

.customCard:hover {
    transform: translateY(-2px);
    box-shadow: var(--mantine-shadow-lg);
}
```

```tsx
import styles from './Component.module.css';

<Card className={styles.customCard}>{/* content */}</Card>;
```

**Do NOT include `.css.d.ts` files** - Vite handles this automatically.

## Color Guidelines

**Prefer default component colors.** Buttons, ActionIcons and Badges get the right neutral or ink from the theme; a `color` prop on a control should only ever name a state (see Design principles).

```tsx
// ❌ Bad - restates the theme, and is a near-black button in dark mode
<Button color="dark">Apply</Button>
<ActionIcon color="ldGray.6" variant="subtle" />

// ✅ Good - the theme already renders these
<Button>Apply</Button>
<ActionIcon />

// ❌ Bad - hand-picked grey
<Text c="ldGray.6">Secondary text</Text>

// ✅ Good - semantic token
<Text c="dimmed">Secondary text</Text>
```

### Neutral tokens

| Token | Purpose |
| ----- | ------- |
| `--mantine-color-body` | Surface (cards, inputs, menus) |
| `--ld-color-page` | Page canvas behind surfaces |
| `--mantine-color-default-border` / `default-hover` | Borders and hover fills of neutral controls |
| `--mantine-color-text` / `dimmed` / `placeholder` | Primary, secondary and tertiary text |
| `ldGray.0-9` | Same role in both schemes: 0 canvas, 1 muted fill, 2 border, 3 strong border, 4 faint icon, 5 tertiary text, 6 dimmed, 7 label, 9 text |

### Dark Mode in CSS Modules

Neutrals need no dark-mode branch: the tokens and `ldGray.N` already resolve per scheme.

```css
/* ❌ Bad */
.row:hover {
    background-color: var(--mantine-color-ldGray-0);

    @mixin dark {
        background-color: var(--mantine-color-ldDark-5);
    }
}

/* ✅ Good */
.row:hover {
    background-color: var(--mantine-color-default-hover);
}
```

Use `light-dark()` only for a non-neutral pair that has no token, such as an accent tint:

```css
.highlight {
    background-color: light-dark(
        var(--mantine-color-indigo-0),
        var(--mantine-color-indigo-9)
    );
}
```

## Always Use Theme Tokens

```tsx
// ❌ Bad - Magic numbers
<Box p={16} mt={24}>

// ✅ Good - Theme tokens
<Box p="md" mt="lg">
```

## Remove Dead Styles

Before moving styles to CSS modules, check if they're actually needed:

```tsx
// ❌ Unnecessary - display: block has no effect on flex children
<Flex justify="flex-end">
    <Button style={{display: 'block'}}>Submit</Button>
</Flex>

// ✅ Better - Remove the style entirely
<Flex justify="flex-end">
    <Button>Submit</Button>
</Flex>
```

## Shared Layout CSS Variables (heights, widths, z-indexes)

Cross-cutting layout constants (navbar/header/banner/footer heights, page content
widths, sidebar dimensions, dashboard header/tab heights and z-indexes) are exposed
as **global CSS variables** so CSS modules can use them directly:

```css
/* ✅ Reference the global var — resolves on :root everywhere */
.myPanel {
    top: var(--dashboard-header-height);
    max-width: var(--page-content-max-width-large);
}
```

```css
/* ❌ Don't hardcode the literal — drifts from the source of truth */
.myPanel {
    top: 50px;
}
```

```tsx
// ❌ Don't bridge a constant into CSS via an inline style object
<div style={{ '--dashboard-header-height': `${DASHBOARD_HEADER_HEIGHT}px` }}>
```

**Source of truth:** the numeric values live in their `*/constants.ts` files
(e.g. `components/common/Page/constants.ts`,
`components/common/Dashboard/dashboard.constants.ts`) and are registered as CSS
variables in **`src/theme/cssVariablesResolver.ts`** (wired into the Mantine provider
via Mantine's `cssVariablesResolver`). Read that file for the full list of available
`var(--...)` names before defining your own.

**To add a new shared layout constant:** add the number to the relevant
`constants.ts`, register it in `src/theme/cssVariablesResolver.ts`, then reference
`var(--your-name)` in CSS. Don't re-declare the literal in a `.module.css` file and
don't pass it through an inline `style`. Keep using the numeric constant directly in
TS where you need it as a JS value (e.g. a Mantine `h=` prop).

## Theme-Aware Component Logic

Do not read the colour scheme to pick a colour; pass a token and let CSS resolve it. The two legitimate readers are code editors and chart libraries that consume plain JS values:

```tsx
// Monaco / Ace theme names
const { monaco, ace } = useEditorTheme();

// ECharts, Leaflet and other non-CSS consumers
const isDark = useComputedColorScheme('light') === 'dark';
```

## Use the clsx utility exported by @mantine/core

```tsx
import { clsx } from '@mantine/core';

const MyComponent = () => {
    return (
        <div className={clsx('my-class', 'my-other-class')}>My Component</div>
    );
};
```

## Select/MultiSelect grouping

```tsx
<Select
    label="Your favorite library"
    placeholder="Pick value"
    data={[
        { group: 'Frontend', items: ['React', 'Angular'] },
        { group: 'Backend', items: ['Express', 'Django'] },
    ]}
/>
```

## Reusable Components

### Modals

- **Always use `MantineModal`** from `components/common/MantineModal` - never use Mantine's Modal directly
- See `stories/Modal.stories.tsx` for usage examples
- For forms inside modals: use `id` on the form and `form="form-id"` on the submit button
- For alerts inside modals: use `Callout` with variants `danger`, `warning`, `info`

### Shared controls

- **Copy to clipboard**: `CopyActionIcon` from `components/common/CopyActionIcon` (`value`, optional `copyLabel`/`copiedLabel`/`icon`/`tooltipPosition`, plus ActionIcon props). Never hand-roll `CopyButton` + `ActionIcon` + icon swap.
- **Favourite toggle**: `FavoriteActionIcon` from `components/common/FavoriteActionIcon` (`isFavorite`, `onToggle`, optional `name` for the label).
- **Two-click delete**: `ConfirmDeleteButton` from `components/common/ConfirmDeleteButton` (`onConfirm`, `aria-label`, optional `tooltip`); arms on first click, fires on the second, disarms on blur or timeout.
- **Faceted filters** (popover with search, counts, groups, select all): `FilterFacet` from `components/common/FilterFacet`.

### Callouts

- Use `Callout` from `components/common/Callout`
- Variants: `danger`, `warning`, `info`

### Empty / Unavailable Sections (dotted style)

- **`<Paper variant="dotted">`** (also `Card`) renders a dashed border with a transparent background — the house style for empty, placeholder, or unavailable sections. Defined in `src/theme/components/Paper.module.css`; used by e.g. `FavoritesPanel` and `AiAgentKnowledgeFilesSection`.
- **Section failed to load**: use `InlineErrorState` from `components/common/InlineErrorState` — a dotted Paper with a muted message and optional `onRetry` button. Keep it quiet; a failing secondary panel shouldn't shout.
- **Placeholder values** (stat tiles etc. with no data): render an em dash (`—`) in `ldGray.5` inside a dotted container rather than fake zeros or endless skeletons. Skeletons mean "loading", dotted means "nothing here".
- Reserve `ErrorState` / `SuboptimalState` for whole-page failures.

### Polymorphic Clickable Containers

Use these when you need a layout container that is also clickable — avoids the native `<button>` background/border reset problem.

- **`PolymorphicGroupButton`** from `components/common/PolymorphicGroupButton` — a `Group` (flex row) that is polymorphic and sets `cursor: pointer`. Use for horizontal groups of elements that act as a single button.
- **`PolymorphicPaperButton`** from `components/common/PolymorphicPaperButton` — a `Paper` (card surface) that is polymorphic and sets `cursor: pointer`. Use for card-like clickable surfaces.

Both accept all props of their base component (`GroupProps` / `PaperProps`) plus a `component` prop for the underlying element.

```tsx
// ✅ Clickable row without native button style bleed
<PolymorphicGroupButton component="div" gap="sm" onClick={handleClick}>
    <MantineIcon icon={IconFolder} />
    <Text>Label</Text>
</PolymorphicGroupButton>

// ✅ Clickable card surface
<PolymorphicPaperButton component="div" p="md" onClick={handleClick}>
    Card content
</PolymorphicPaperButton>

// ❌ Avoid - native <button> brings unwanted background/border in menus and panels
<UnstyledButton>
    <Group>...</Group>
</UnstyledButton>
```

### NumberInput

- **Always use `NumberInput` from `components/common/NumberInput`** — never Mantine's NumberInput directly
- Mantine 8's onChange emits `number | string` (empty field, half-typed values like `-`/`12.`, unsafe-large integers). The wrapper's `onNumberChange` shields you: it fires with a `number`, or `undefined` when the field is cleared — transient strings never fire
- **Integer-only by default** — the wrapper defaults `decimalScale={0}` (most fields are ports, counts, timeouts). Decimal fields opt in with `decimalScale={2}` etc., or `decimalScale="unlimited"` to remove the cap
- The raw `onChange` prop remains available only for `form.getInputProps()` spreads, where the form library owns parsing

```tsx
// ✅ Good - cleared field maps to a domain decision at the call site
<NumberInput onNumberChange={(v) => setLimit(v ?? DEFAULT)} />

// ✅ Good - number-or-undefined sinks take the callback directly
<NumberInput decimalScale={2} onNumberChange={setThreshold} />

// ✅ OK - form spread owns value/onChange
<NumberInput {...form.getInputProps('warehouse.port')} />

// ❌ Avoid - hand-rolled typeof guards on the raw Mantine component
<MantineNumberInput onChange={(v) => { if (typeof v === 'number') setX(v); }} />
```

### EmptyStateLoader

- Use `EmptyStateLoader` from `components/common/EmptyStateLoader` for **any** centered loading state: page-level guards, panels, tables, empty containers
- Built on `SuboptimalState` (Mantine v8) — renders a spinner with an optional title, fully centered in its parent

### TruncatedText

- Use `TruncatedText` from `components/common/TruncatedText` whenever text may overflow a constrained width
- Pass `maxWidth` (number or string) to control the truncation boundary
- Automatically shows a tooltip with the full text **only when the text is actually truncated** (no tooltip spam for short names)
- Defaults to `fz="sm"`; override via standard `Text` props

```tsx
// ✅ Good - truncates long names, tooltip only appears when needed
<TruncatedText maxWidth={200}>{item.name}</TruncatedText>

// ✅ Accepts any Text prop
<TruncatedText maxWidth="100%" fw={500}>{space.name}</TruncatedText>
```

### Tables with search, pagination, and sorting

Use the `ContentTable` component from `components/common/ContentTable` for tables with search, pagination, and sorting.
If you need filters, use FilterFacet

## Mantine Documentation

List of all components and links to their documentation in LLM-friendly format: `https://mantine.dev/llms.txt`
