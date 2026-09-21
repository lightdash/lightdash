---
name: developing-chart-types-locally
description: Use when editing a locally created or downloaded Lightdash custom chart type (data_app_viz) — the vizSchema/component lockstep contract, the upload-and-verify loop, the local fixture preview, and how a chart type reaches the official registry.
---

# Developing Lightdash Custom Chart Types Locally

You are editing a Lightdash **custom chart type** (a reusable visualization, the `data_app_viz` template) that was created or downloaded with the Lightdash CLI. It is ONE chart component that Lightdash hands data and settings to — not a data app.

## The contract is the reusable-visualization skill

Read `.claude/skills/reusable-visualization` before editing. It defines everything the component may do: `useVizContext()` is the only channel to the host (data, options, resolved colours), the component runs no query, owns no explore, and never fetches anything itself. App-level SDK APIs (query builder, `useLightdash`, filters, `externalFetch`) do not apply here and must not be introduced.

Never hand-build a data-point action menu when `useVizContext().pointMenu.enabled` — call `pointMenu.open({ x, y, row, metric })` and let Lightdash render it; an in-viz menu is only the fallback for hosts that predate the capability.

## The declaration lives in lightdash-app.yml — keep it in lockstep

In the in-product builder the declaration is emitted by the generation run; **locally it is the `vizSchema` block in this folder's `lightdash-app.yml`**, and upload round-trips it to the server (without it the chart type never appears in the explorer's chart type picker).

The correspondence must be exact in both directions: every key the component reads from `fieldMapping` or `options` is declared in `vizSchema`, and everything declared there is read by the component. When an edit changes what the component reads — a new field, a renamed option, a removed control — update `vizSchema` in the same edit. A declared option nothing reads is a dead control; a read key nothing declares never receives a value.

## The edit → validate → upload → verify loop

Run these commands from this folder under `chart-types/<slug>/`. The upload path `../..` selects the Lightdash content root.

1. Edit files under `src/` (and `vizSchema` when the declaration changes).
2. `lightdash apps validate` checks source and manifest (including that `vizSchema` parses); `lightdash apps validate --build` adds the Cloud-parity Vite production build. A build failure is a validation error with the Vite output.
3. `lightdash upload --chart-types <slug> --path ../..` (the `slug` from `lightdash-app.yml`) — the server rebuilds and serves it.
4. Verify in Lightdash: open any explore, run a query with at least the required fields' shapes (e.g. a dimension and a metric), pick this chart type in the chart type picker, and map its fields. Check every config option you declared actually changes the chart.

Saved charts already using this chart type may pin a version; unpinned charts move to the newly uploaded version right away. While iterating in a shared project, prefer verifying on a throwaway chart.

## Preview locally with a fixture (fast layout iteration)

`useVizContext()` normally waits for the Lightdash host to push a context, so with no host the component renders nothing. For local iteration the SDK has a **dev-only fixture fallback**: when the app runs top-level (not embedded) and the page URL carries `?vizFixture=<path>`, it fetches that same-origin JSON file and feeds it to `useVizContext()` as the context.

The scaffold ships a `viz-fixture.json` at the folder root. To use it:

1. `lightdash apps preview` (or `npm run dev`) to start the dev server.
2. Open the dev URL with the param, e.g. `http://localhost:5173/?vizFixture=/viz-fixture.json`. The chart renders from the fixture.
3. Edit `viz-fixture.json` to match your declared `vizSchema` — `fieldMapping` (input name → string id, or an ordered array of ids for multiple-field inputs), `rows` (each cell is `{ "value": { "raw": ..., "formatted": "..." } }`, keyed by those ids), `options` (declared option name → value), `colorPalette`, and `pivotDetails` (`null` unless you map a `series` field). Reload to see changes.

For multiple-field inputs, set `multiple: true` on the `vizSchema.fields` entry and iterate
the array at `useVizContext().fieldMapping[name]` in its existing order, narrowing with
`Array.isArray` first. Single-field
inputs continue to read a string from `fieldMapping[name]`. Test three
metrics and multiple dimensions, remove and re-add one, then save and reopen the chart
in the explorer. Verify fields follow the order they were added, with re-added fields at the end. Keep the input names stable across upgrades. Single-field inputs
retain string bindings; details and examples live in the reusable-visualization skill.

This is for **layout and option iteration only**, and never fires in production (an embedded viz has a real host whose context always wins, and the param must be explicitly present). The fixture is fake data you hand-maintain: colors fall back to the palette (no model or shared-dashboard colors), `pivotDetails` must be shaped by hand, and formatting is whatever you type. **The explorer with real data remains the source of truth for correctness** — still run the upload → verify loop above before finishing, and verify every declared option actually changes the chart there.

## Style with the Lightdash Library theme

The scaffold ships the **Lightdash Library theme** — `src/lightdash-library.css`
(imported by the starter; keep it first in the CSS chain) and the contract in
`references/lightdash-library-theme.md`. It makes a chart's chrome match
Lightdash's built-in charts, so installed chart types read as siblings of the
native ones. The rules that matter most:

- Style ALL chrome (axes, grids, legends, tooltips, typography) with the
  `--ll-*` tokens; never hardcode chrome hexes. The tokens re-resolve under
  the host's `.dark` class. SVG attributes can't resolve `var()`, so read
  token values with `getComputedStyle` per render and call `useColorScheme()`
  so the component re-renders on theme flips (the starter shows the pattern).
- Keep the canvas transparent (`html, body { background: transparent }`, set
  by the theme css) — the host tile paints the surface.
- Series/data colors come from the instance palette, never the theme:
  `resolveSeriesColor` / `resolveValueColor`, falling back to
  `colorPalette[index % length]`. Two contract facts: the host sends
  EFFECTIVE option values (declared defaults included), so a color option's
  declared default is the only detectable "not overridden" state; and
  `resolveValueColor`'s own fallback is palette-positional — semantic colors
  (positive/negative) must check `context.valueColors` directly with semantic
  hex fallbacks, never through the helper.
- Tooltips compose the `.ll-tooltip` utility classes from the theme css.

## Dependencies: template-deps-only, strictly

Build with the template's preinstalled set (see `package.json` — React, Recharts, d3 and friends). Do not add npm packages and do not vendor library source into `src/`. This is stricter than for data apps: the official chart registry rejects any dependency drift from its template, so a chart type that grows custom dependencies becomes unpublishable.

Root config files (`vite.config.js`, `tsconfig.json`, ...) are read-only reference — the server rebuilds against a trusted template. `.npmrc` sets `ignore-scripts=true`; never remove it or run installs with scripts enabled.

## Publishing to the official registry

Once the chart type works in an instance, it can be proposed for the official chart registry (the `lightdash/lightdash-library` repo, served to every Lightdash deployment with the chart type library enabled):

1. Copy this folder into that repo under `charts/<slug>/`.
2. Run `node scripts/prepare-chart.mjs charts/<slug>` there — it prunes the local scaffold (these skills, configs, AGENTS/README), scrubs instance-side manifest fields, and shapes the folder for the registry. The folder name becomes the **permanent official registry slug**; pass `--slug <official-slug>` if the local slug isn't the identity that should ship.
3. Add real screenshots from the in-product preview under `screenshots/` (the first is the gallery thumbnail) and fill in `registry.yml` (version, tags, changelog). New versions default to the beta channel; releasing to customers requires an explicit `channel: stable`.
4. Open a PR there. On merge, publishing is automatic; published versions are immutable — any later change needs a version bump.

Report the registry step as a suggestion to the user rather than doing it unprompted: publishing makes the chart type public.
