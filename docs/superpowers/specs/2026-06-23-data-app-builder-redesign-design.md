# Build a Data App — landing screen redesign

Date: 2026-06-23
Area: `packages/frontend` — data apps generate page

## Goal

Make the "Build a Data App" landing screen (`/projects/:projectUuid/apps/generate`)
feel more like a single, polished, chat-first surface instead of a multi-step
wizard. Three concrete changes drive the redesign:

1. **The chat composer is always shown** on the initial screen.
2. **The four starting-point options become cards fanned in an arch** (like a hand
   of cards) sitting above the composer — replacing the 2×2 `SimpleGrid`.
3. **Theme moves into the composer** as a small pill button on the input's bottom
   bar (bottom-left), rather than a separate labelled `THEME` row.

Visual direction confirmed in the brainstorm mockup
(`.superpowers/brainstorm/.../data-app-redesign-v4.html`):

- Dark/neutral accent for the selected card (`#0d0f12` border + light grey fill +
  dark icon chip + dark ✓ badge) — **not** blue.
- **Nothing selected by default.** No template is pre-highlighted; the helper line
  reads "Pick a starting point" until the user chooses one. Clicking a selected
  card deselects it.

## Current behaviour (what we're replacing)

`AppGenerate.tsx` drives the new-app flow through three layout stages:

- `showTemplatePicker` — full-viewport centered card rendering `AppTemplatePicker`
  (the 2×2 grid + `THEME` row + "Let's go!" button). No composer.
- `composeMode` — after a template is picked, a centered composer card (back
  button + prompt input) replaces the picker, morphing via View Transition.
- Full split layout — after the first prompt submits, chat panel + preview.

`AppTemplatePicker.tsx` owns the grid, the inlined `ThemePicker`, and a
pre-selected `'dashboard'` highlight that the user confirms with "Let's go!".

## New behaviour

Collapse `showTemplatePicker` and `composeMode` into **one** screen:

- Title + subtitle, then the **fanned arch of template cards**, then the **always
  present composer**.
- Selecting a card sets the in-flight template (dark-accent highlight). Selecting
  nothing is allowed — submitting with no selection is equivalent to today's
  `'custom'` / "From scratch" starting point.
- The composer's bottom bar carries the **theme pill** (bottom-left, opens the
  existing `ThemePicker` popover) and the **send button** (bottom-right). The
  separate `THEME` label/description row and the "Let's go!" button are removed —
  submitting the composer is the single forward action.
- On submit, the layout morphs to the split sidebar exactly as today (the
  existing View Transition path is preserved).

The full split layout (chat + preview, after first prompt) is **unchanged**.

## Components

### `AppTemplatePicker.tsx` → fanned arch

- Replace `SimpleGrid` with an absolutely-positioned arch (`.fan` container,
  `.card` items placed by per-index CSS custom props `--x/--y/--rot`). Geometry
  from the approved mockup: indices 0–3 at x ∈ {−258, −88, 88, 258}px, y ∈
  {44, 2, 2, 44}px, rot ∈ {−15, −5, 5, 15}deg; cards 184×166, lift in place on
  hover/selected (`translateY ~−26px`, rotation × 0.35, `scale 1.04`).
- Selected state uses neutral accent tokens, not blue. Per the frontend style
  guide, prefer `ldDark.X` / default neutral tokens over `gray.X`; encode the
  arch geometry and accent in `AppTemplatePicker.module.css` (CSS module is the
  right tier — far more than 3 layout props).
- `highlighted` initial state becomes `null` (was `'dashboard'`). Clicking the
  already-selected card clears it.
- Remove the inlined `THEME` row and the "Let's go!" `Button` — selection no
  longer needs confirmation; the composer's send button is the forward action.
- New prop contract: the picker becomes a *controlled* selection surface —
  `selected: DataAppTemplate | null` + `onSelectedChange`. Theme props move out
  (theme now lives in the composer). The picker no longer calls a one-shot
  `onSelect`; `AppGenerate` reads the current selection at submit time.

### `AppGenerate.tsx` — merge the stages

- Drop the `composeMode` stage. The new-app screen renders: arch picker +
  composer together, centered, no split, while `messages.length === 0 &&
  !isLoading && isNewApp`.
- Remove `wizardStage` ('pick' | 'confirm') and `wizardCoversInput` — there's no
  longer a pick→confirm hop; the composer is always visible. `selectedTemplate`
  (nullable, default `null`) is read on submit; `null` → `'custom'`.
- Mount the existing composer (prompt input, attachments, model picker) on this
  screen with the theme pill added to its bottom bar. Reuse the current
  `ThemePicker` for the popover; render it as a compact pill trigger.
- Preserve the View Transition morph from this centered screen to the split
  layout on first submit (`view-transition-name: app-composer`).

### `ThemePicker` reuse

No behaviour change to theme selection/iteration logic
(`handleThemeChange`, new-vs-existing app paths stay intact). Only its placement
and trigger styling change: a pill in the composer bottom bar instead of a
labelled row in the picker.

## Out of scope / unchanged

- Split layout (chat + preview), message history, optimistic queue, model
  override, attachments, clarifications — all unchanged.
- Existing-app edit route (`/apps/:appUuid`) — unchanged; the redesign only
  affects the new-app landing (`isNewApp && messages.length === 0`).
- No backend/API changes. `DataAppTemplate` values are unchanged.

## Open decisions (default chosen, can revisit in plan)

- **Fan after build starts:** the fan + standalone screen disappear once the
  layout morphs to split (same as today's picker disappearing). The selected
  template continues to surface via the existing template chip in the split
  layout. No persistent fan in the split view.
- **Responsive/narrow widths:** below the arch's min width, fall back to a
  vertical stack (no fan) so cards stay readable. Exact breakpoint settled in
  implementation.

## Testing

- Existing RTL tests around `AppTemplatePicker` / `AppGenerate` updated for the
  new prop contract (no "Let's go!" button, nullable selection, no pre-select).
- Manual verification via Chrome DevTools MCP against the running app: default
  (nothing selected), select/deselect, theme pill popover, submit → morph to
  split layout.
