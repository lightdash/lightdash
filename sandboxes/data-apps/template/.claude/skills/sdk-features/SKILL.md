---
name: sdk-features
description: Map Lightdash SDK capabilities to their host-UI names and the app-code wiring each needs. Use when the user asks about a feature by name (Inspect data, drill-down, exports, shareable URLs), when offering newly available features after a template upgrade, or when wiring a host-facing capability into the app.
---

The `@lightdash/query-sdk` in this workspace declares its capabilities in a
registry: `node_modules/@lightdash/query-sdk/dist/features.js` (`SDK_FEATURES`,
each `{ key, label, description, wiring? }`). That registry is the source of
truth — never invent capabilities from export lists or type definitions. This
skill adds what the registry can't: how each feature maps to the Lightdash
host UI and the exact wiring recipe.

## Vocabulary: users speak host-UI, the SDK speaks keys

Users describe features by what they see in the Lightdash editor. Translate:

| User says / host UI | Registry key | Wiring |
| --- | --- | --- |
| "Inspect data" (Queries panel button) | `lineage` | required — see below |
| "select an element", editor element picker | `inspect` | none (automatic) |
| thumbnails / screenshots / scheduled deliveries | `screenshot` | required — see below |
| drill down, click into a chart | `drill-down` | app code opt-in |
| "share this view", URL that restores state | `url-state` | app code opt-in |
| Google Sheets export | `gsheet-export` | app code opt-in |
| external API data | `external-fetch` | app code opt-in |
| runs inside a dashboard tile | `viz-context` | required — see below |
| light/dark mode, "matches my Lightdash theme" | `follow-host-theme` | CSS tokens — see below |

## Automatic (zero wiring — active on any current-SDK bundle)

`createClient()` mounts these itself: the capability **manifest**, the editor
**element inspector** (`inspect`), and the **lineage runtime**. Core querying
(`query`, `saved-chart` via `useLightdash`/`savedChart`) is just normal SDK
usage. If the app calls `createClient()`, these need nothing from you.

## Wiring recipes

### `lineage` — the host's "Inspect data" button

The lineage runtime only announces itself once the DOM contains
`data-ld-query` stamps; until then the host's Inspect data button stays
disabled. Spread the `lineage` props returned by `useLightdash` onto the root
element of every query-bound block:

```jsx
const { data, lineage } = useLightdash(myQuery);
return <div {...lineage}>{/* chart rendered from data */}</div>;
```

Stamp every visualization, not just one — each stamp maps that block to its
query in the host's Queries panel.

### `screenshot` — thumbnails and scheduled deliveries

Provided by the template file `src/screenshotHandler.js`; `main.jsx` must
import and call it (`initScreenshotHandler()`). Apps migrated from older
templates may be missing the file or the call — copy the file from the
template and add the call rather than reimplementing.

### `viz-context` — apps embedded as dashboard tiles

Wrap the app in `VizContextProvider` (see the template `main.jsx`) and read
the host-supplied query context with `useVizContext`. Only relevant for
visualization-style apps meant to run inside dashboards.

### `follow-host-theme` — light/dark mode

The SDK puts the `dark` class on `<html>` as the app boots and again
whenever the viewer toggles their Lightdash theme, so an app that styles
everything through the theme tokens follows along with no code at all. What an
older app usually needs is the opposite of wiring — *removing* what pins it to
one mode:

- drop any `className="dark …"` on the app shell and any
  `document.documentElement.classList.add('dark')`;
- move dark values out of `:root` and into `.dark`, leaving a complete set of
  light values on `:root`;
- keep both sets complete for every token the app defines.

For colours CSS can't reach (a chart library's theme object, a logo swap), read
the mode: `const colorScheme = useColorScheme();` — `'light' | 'dark'`,
re-rendering on every host toggle.

### App-code opt-ins (call the API where it fits the app)

- `drill-down`: `drillDown(...)` derives a more detailed query from a clicked
  result row — wire it to click handlers on charts/rows.
- `url-state`: `useUrlState(...)` syncs a piece of app state into the page URL
  so views can be shared and restored.
- `gsheet-export`: `exportToSheets(...)` sends tabular results to a new
  Google Sheet — offer it wherever the app renders a table.
- `external-fetch`: `client.externalFetch(alias, opts)` calls an external
  connection linked to this app. The connection must already be linked by the
  host; you cannot add one from app code.

## After a template upgrade

An upgrade rebuilds the app on the current SDK, which turns on the automatic
capabilities but does NOT add wiring — that is a deliberate rail. When you
offer newly available features, offer wiring-required ones too (their registry
entries carry a `wiring` note); implement only when the user asks.
