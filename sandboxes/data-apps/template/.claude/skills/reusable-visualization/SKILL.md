---
name: reusable-visualization
description: Build ONE reusable chart visualization component that receives its data and its settings from the host application instead of fetching them, and declares the fields and config options the host exposes to viewers. Use this whenever a single chart component is reused across many different queries rather than built for one — in Lightdash, the `data_app_viz` app template, also called a "viz". Covers the `useVizContext()` hook, the declaration contract, the config-option vocabulary, and series colours.
---

# Reusable visualization

This is ONE reusable chart component, not an app. It runs no query and owns no explore.
Lightdash runs the query, then hands the component the result rows plus a mapping from the
field names the component declared to the columns in those rows. The same component is
reused across many different queries — every contract below follows from that: it cannot
hardcode column names, so it declares a field mapping; it cannot hardcode display choices
for queries it has never seen, so it declares config options.

No dashboard, navigation, multiple panels, filters or page chrome. Recharts, echarts, D3 or
plain SVG all work.

Everything the viewer can reach later exists only because the component declared it: the
columns they map, and every control in the chart's config panel. A literal hardcoded
instead stays frozen until somebody regenerates the whole viz.

## The hook

`useVizContext()` from `@lightdash/query-sdk` is the only channel to the host — data,
settings, and host actions all come from it. Do not add a message listener and do not
fetch anything yourself; the only host interaction is through the helpers the hook
returns.

```tsx
const {
  fieldMapping,
  rows,
  options,
  colorPalette,
  pivotDetails,
  ready,
  underlyingData,
} = useVizContext();
```

- `fieldMapping` — `Record<string, string>`: the field name you declared → the query field
  id it is bound to. Read cells with `getFormatted(row, fieldId)` (display text) and
  `getRaw(row, fieldId)` (raw value).
- `rows` — the host-fetched result rows, keyed by query field id.
- `options` — `Record<string, boolean | number | string>`: the current value of each config
  option you declared (the viewer's choice, else your declared `default`).
- `colorPalette` — `string[]`: the Lightdash palette resolved for this chart. Always pushed,
  whether or not you declared `colorPalette`. Empty only when the host resolved none.
- `pivotDetails` — the complete backend-pivot layout, or `null` for ordinary rows. See
  "Backend-pivoted results" below.
- `ready` — false until the first context arrives.
- `underlyingData` — host-mediated access to the raw rows behind a clicked data point.
  See "Data-point actions" below.

Read all of them. Ignoring `options` and `colorPalette` is the most common way to build a
viz nobody can configure.

### These app-level APIs do not apply to a viz

The sandbox skill (`/app/skill.md`) is written for data apps, which do run queries. A
reusable visualization does not. Do **not** use `useLightdash()`, `filtersFor(EXPLORE)`,
`addFilter({...})`, or `format(row, fieldName)` — there is no explore to query or filter,
and formatting arrives pre-computed via `getFormatted`. Where this skill and the sandbox
skill differ, this skill wins for a viz. Everything else in the sandbox skill (React,
shadcn, charting, theming, floating surfaces, screenshots) still applies.

## Rendering rules

- **Fill the viewport.** Give the root element `height: 100vh` (or `position: fixed; inset: 0`),
  NOT `height: 100%` — that collapses to a 0-height invisible box unless every ancestor also
  sets a height, leaving auto-sizing charts like recharts `<ResponsiveContainer>` nothing to
  measure. Confirm the chart actually renders and isn't a blank box.
- **Placeholder.** Show a clearly visible placeholder (readable, good contrast — never
  near-white on white) while `!ready`, when a required field is unmapped, or when there are
  no rows.
- **Fundamentals.** Clear axes and labels, readable spacing, a tooltip on hover.
  Give every axis a `tickFormatter` (compact numbers, shortened labels) or `hide`
  it — raw ticks overflow and overlap on a chart the viewer can resize.

## Series colours

Never hardcode series hex values and never hand-pick a palette of your own. Colour series
with `colorPalette[i % colorPalette.length]`, and declare `colorPalette` in your output so
the viewer gets the palette picker. Keep a small fallback array in your own code for the
case where `colorPalette` is empty.

This is the same rule as the sandbox skill's "chart series colors must come from
`CHART_COLORS`" and `references/d3.md`'s "never hand-pick palettes" — the same Lightdash
palette, delivered differently. An app imports `CHART_COLORS`; a viz reads the resolved
colours off the hook, because the viewer picks the palette per chart. In a viz, use the
hook, not `CHART_COLORS`.

## Backend-pivoted results

A mapped `series` field makes Lightdash pivot the results before they reach the viz. In
that case the mapped metric id is no longer a row key: each series becomes a generated
column described by `pivotDetails.valuesColumns`.

Match `valuesColumns` whose `referenceField` equals the mapped metric id. For each match,
use `pivotValues` to identify and label the mapped series value. Generated
`pivotColumnName` keys contain the same `VizContextCell` objects as ordinary field keys:
read them with `getRaw(row, column.pivotColumnName)` or
`getFormatted(row, column.pivotColumnName)`. Never coerce `row[fieldId]` directly with
`String`, `Number`, or template interpolation; that coerces the cell object rather than
its value. Preserve the ordinary `fieldMapping` row path when `pivotDetails` is `null`, so
the same viz works without a mapped series and on older unpivoted charts.

The rest of `pivotDetails` describes the full layout rather than assuming the viz is a
Cartesian chart:

- `indexColumn` — row-grain fields and their `time`/`category` axis semantics.
- `groupByColumns` — pivot-header fields in backend layout order.
- `originalColumns` — original field ids and semantic types before pivoting.
- `sortBy` — the sort applied to the pivoted result, including anchored pivot values.
- `totalColumnCount` — the untruncated pivot column count; use it when the viz needs to
  explain that the returned columns hit a limit.
- `passthroughDimensions` — hidden dimensions retained on rows for cross-field rendering.

Use these when the visualization's shape benefits from them: a table can build row and
column headers, while a chart can select a time axis from metadata instead of guessing
from values. Treat `fieldMapping` as the declared interface; metadata describes how those
fields were laid out, not permission to render unrelated query fields automatically.

```tsx
const metricId = fieldMapping['value'];
const seriesId = fieldMapping['series'];
const pivotedMetrics =
  pivotDetails?.valuesColumns.filter(
    (column) => column.referenceField === metricId,
  ) ?? [];

const series = pivotedMetrics.map((column) => ({
  columnId: column.pivotColumnName,
  label:
    column.pivotValues.find((value) => value.referenceField === seriesId)
      ?.formatted ?? 'Unknown',
}));

const categoryId = fieldMapping['category'];
const data = rows.map((row) => ({
  label: getFormatted(row, categoryId),
  ...Object.fromEntries(
    series.map(({ columnId }) => [
      columnId,
      Number(getRaw(row, columnId) ?? 0),
    ]),
  ),
}));
```

Use the order of `valuesColumns` for stable colour assignment. A chart with multiple
declared series fields builds its label from each matching `pivotValues` entry in declared
field order. Backend-pivoted rows do not have safe one-source-row provenance, so the host
sets `underlyingData.enabled` to false for them.

## Data-point actions: underlying data

When `underlyingData.enabled` is true, viewers expect the standard Lightdash action on
chart marks: click a data point → small action menu → "View underlying data" → a dialog
listing the raw rows behind that point, with a Download button. When it is false (host
too old, viewer lacks permission, embed), render no menu item — never a disabled one.

Provenance is the contract: **every interactive datum keeps a reference to its
untransformed source row.** When mapping `rows` into chart data, carry the row:

```tsx
const data = rows.map((row) => ({
  label: getFormatted(row, catField),
  value: Number(getRaw(row, valField) ?? 0),
  sourceRow: row,               // ← required for underlying data
}));
```

Only attach the action where one mark maps to exactly ONE source row and ONE metric-slot
field. A mark that aggregates several rows (a binned bucket, a "top N + other" slice)
gets no underlying-data item.

On click, fetch and render in a dialog themed like the rest of the viz:

```tsx
const result = await underlyingData.get({ row: datum.sourceRow, metric: 'value' });
// result.rows / result.columns / result.format — render as a table
// Download button:
// await underlyingData.download({ row: datum.sourceRow, metric: 'value', fileType: 'csv' });
```

`metric` is the declared field NAME from your `fields` (the same key you read from
`fieldMapping`), not a query field id. Show `get()`/`download()` rejection messages in
the dialog — they are written for viewers.

Keep the dialog table dense — underlying data is often wide and long. Compact cell
padding (the table is for scanning, not presenting). If the header is sticky: pin it
flush at `top: 0` with an opaque background, and put NO padding on the scroll
container itself — pad the cells, not the scroller. A sticky header pins to the
container's content edge, so any container padding becomes a strip that rows
visibly scroll through above the header.

The table must scroll BOTH ways: `overflow: auto` on ONE wrapper directly around the
`<table>`, and every element between that wrapper and the dialog body a plain block
that can shrink (`min-width: 0`; no `display: table`, no `w-max`/`width:
max-content`). A wrapper that sizes to the table's intrinsic width makes the
overflow container's horizontal scroll dead — the table looks clipped and viewers
cannot reach the right-hand columns. Verify by scrolling right in the rendered
dialog with more columns than fit.

## The declaration

Alongside the component you emit one structured declaration — as **structured output, not a
file**. It has three parts: `fields`, `configOptions` and `colorPalette`. Lightdash builds
the field-mapping UI and the chart config panel from it, so the component is unusable
without it.

The correspondence is exact in both directions: **every key read from `fieldMapping` or
`options` is declared, and everything declared is read.** A declared option nothing reads is
a dead control the viewer can move with no effect.

### `fields`

One entry per data column the component reads:

- `name` — the key read from `fieldMapping`. Unique, no spaces.
- `label` — human label shown in the mapping UI.
- `type` — `dimension` (a category/grouping column), `metric` (a numeric measure), or
  `series` (a dimension used to split or colour the chart).
- `required` — `false` only when the chart still renders with this field unmapped.

### `configOptions`

One entry per setting the viewer can change without regenerating the viz. Every option is a
whole-viz value applying to the entire chart — there is no per-series option. To colour
series individually, index into `colorPalette` by series position.

Every option has:

- `name` — the key read from `options`. Unique, no spaces.
- `label` — human label shown next to the control.
- `group` — optional tab name. Options sharing a `group` are rendered in the same config
  tab; ungrouped options share a default tab.
- `default` — REQUIRED on every option. The value the viz uses until the viewer changes it;
  its shape follows `type`. Use the value you would otherwise have hardcoded.
- `type` — exactly one of these five, no others:

| `type` | control | `default` | extra keys |
|---|---|---|---|
| `boolean` | switch | `true` / `false` | — |
| `select` | dropdown | one of the declared choice `value`s (a string) | `choices`: array of `{ "value": "...", "label": "..." }`, at least one entry |
| `number` | number input | a number | `min`, `max` — both optional numbers |
| `text` | single-line text input | a string | — |
| `color` | single colour | a hex string, e.g. `"#7162FF"` | — |

Series colours are not in this list. They are declared separately, on `colorPalette`.

### `colorPalette`

Whether the viewer gets the standard Lightdash palette picker. Declare
`{ "group": "..." }` when your component colours anything from `colorPalette`, or `null`
when it colours nothing. `group` is optional and works like an option's: the picker joins
that tab, and gets a tab of its own when no option shares the name.

This is not a config option. There is one palette per chart, it has no `name` and no
`default`, and its colours arrive on `colorPalette` — never on `options`.

## Worked example

Component and declaration lining up. Your chart will differ; the correspondence must not.

```tsx
import { useVizContext, getFormatted, getRaw } from '@lightdash/query-sdk';
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

function Chart() {
  const { fieldMapping, rows, options, colorPalette, ready } = useVizContext();
  if (!ready) return <div style={{ height: '100vh' }}>Loading…</div>;
  const catField = fieldMapping['category'];            // your field name -> column id
  const valField = fieldMapping['value'];
  const showLabels = options['showLabels'] as boolean;  // your option name -> current value
  const maxBars = options['maxBars'] as number;
  const colors = colorPalette.length ? colorPalette : ['#7162FF', '#1A1B1E'];
  const data = rows.slice(0, maxBars).map((row) => ({
    label: getFormatted(row, catField),                 // display text, e.g. "Completed"
    value: Number(getRaw(row, valField) ?? 0),          // raw number
  }));
  return (
    // The root fills the viewport, so ResponsiveContainer has a height to measure.
    <div style={{ height: '100vh' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis
            dataKey="label"
            tickFormatter={(v) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)}
          />
          <YAxis tickFormatter={(v) => v.toLocaleString()} />
          <Tooltip />
          <Bar dataKey="value">
            {data.map((d, i) => <Cell key={d.label} fill={colors[i % colors.length]} />)}
            {showLabels && <LabelList dataKey="value" position="top" />}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

The declaration that component emits is exactly:

```
fields: [{ "name": "category", "label": "Category", "type": "dimension", "required": true },
         { "name": "value", "label": "Value", "type": "metric", "required": true }]
configOptions: [{ "name": "showLabels", "label": "Show value labels", "group": "Labels", "type": "boolean", "default": true },
                { "name": "maxBars", "label": "Max bars", "type": "number", "default": 10, "min": 1, "max": 50 }]
colorPalette: {}
```

## Final pass, before you finish

Re-read the component you just wrote and list every literal in it: each colour, each
true/false you chose, each number, each string you typed into the chart. Take the list one
entry at a time and ask "would a viewer plausibly want this different?". This is the
minimum, not a menu:

- every element you chose to show or hide (value labels, legend, gridlines, an axis) → `boolean`
- every variant you picked between (vertical/horizontal, grouped/stacked, curve style) → `select`
- every number you chose (bar width, max rows, decimal places, a threshold) → `number`
- every string you wrote into the chart (title, axis label, empty-state text) → `text`
- every accent colour that is not a series colour (a target line, a highlight) → `color`
- the series colours, whenever the chart draws more than one series → `colorPalette`

Where the answer is yes, make that literal the option's `default`, declare the option, and
read the option in its place. Leave it hardcoded only where changing it would break the
chart.

Then check both directions: every key you read from `options` is declared, and every option
you declared is read somewhere. `colorPalette` is declared when you colour from
`colorPalette` — it is never read from `options`.

Finally, if the chart has clickable marks: each interactive datum carries `sourceRow`,
and the data-point action menu is gated on `underlyingData.enabled`.
