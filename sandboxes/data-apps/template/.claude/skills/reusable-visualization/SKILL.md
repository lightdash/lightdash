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

`useVizContext()` from `@lightdash/query-sdk` is the only source of data and settings. Do
not add a message listener and do not fetch anything.

```tsx
const { fieldMapping, rows, options, colorPalette, ready } = useVizContext();
```

- `fieldMapping` — `Record<string, string>`: the field name you declared → the query field
  id it is bound to. Read cells with `getFormatted(row, fieldId)` (display text) and
  `getRaw(row, fieldId)` (raw value).
- `rows` — the host-fetched result rows, keyed by query field id.
- `options` — `Record<string, boolean | number | string>`: the current value of each config
  option you declared (the viewer's choice, else your declared `default`).
- `colorPalette` — `string[]`: the Lightdash palette resolved for this chart. Always pushed,
  whether or not you declared `colorPalette`. Empty only when the host resolved none.
- `ready` — false until the first context arrives.

Read all five. Ignoring `options` and `colorPalette` is the most common way to build a viz
nobody can configure.

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
