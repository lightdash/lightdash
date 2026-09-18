---
name: reusable-visualization
description: Build one reusable Lightdash chart component that receives host-provided result data and settings, then declares the field mappings and viewer-configurable options it needs. Use for a reusable `data_app_viz` visualization ("viz"), rather than a data app that runs its own query. Covers `useVizContext()`, declaration and colour contracts, and eligible point actions.
---

# Reusable visualization

A viz is one reusable chart component, not an app. It runs no query and owns no
explore. Lightdash supplies result rows and maps the field names it declares to those
rows. The same component therefore cannot assume query column names or fixed display
choices: declare every field mapping and viewer control the component reads.

Build one chart only. Do not add dashboard navigation, filters, multiple panels, or page
chrome. Recharts, ECharts, D3, and plain SVG all work. The default point-action path is React
SVG/HTML marks. **Before implementing a renderer whose marks cannot spread React props, read
[references/imperative-point-actions.md](references/imperative-point-actions.md).**

## Workflow

1. Read the context and validate its declared field bindings. Render a visible placeholder
   while it is not ready, required fields are missing, or rows are empty.
2. Transform each row into chart data, retaining the original SDK row on every datum that
   maps to one source row and one metric slot.
3. Connect each eligible rendered mark to `useVizActions`, and render its one returned menu
   alongside the chart.
4. Emit the declaration as structured output, then check that its fields and options have an
   exact correspondence with the component's reads.

The root needs `height: 100vh` (or `position: fixed; inset: 0`) so responsive charts have
space to measure. Give axes a tick formatter or hide them. Use readable labels and spacing, a
theme-token tooltip with each value once, and no full-height cursor band. Hover may emphasise a
mark; click must not leave persistent selection styling.

## Host context

`useVizContext()` from `@lightdash/query-sdk` is the only host channel. It supplies data,
settings, palette resolution, and host actions. Do not fetch data or add a message listener.

```tsx
const context = useVizContext();
const {
  fieldMapping,
  rows,
  options,
  colorPalette,
  pivotDetails,
  ready,
  underlyingData,
  drillDown,
} = context;
```

- `fieldMapping` is `Record<string, string | string[]>`. A single input maps to one query
  field id. An input declared with `multiple: true` maps to an ordered array, including when
  it has one selection. Narrow with `Array.isArray` before iterating.
- `rows` are host-fetched result rows, keyed by query field id. Use `getFormatted(row, id)`
  for display text and `getRaw(row, id)` for raw values. Never coerce a cell object directly.
- `options` contains the current value for each declared config option.
- `colorPalette` is the host-resolved palette. `seriesColors` and `valueColors` are also on
  `context`; pass the complete context to the colour helpers below.
- `pivotDetails` is `null` for ordinary rows. **When a mapped series causes backend-pivoted
  results, read [references/pivoted-results.md](references/pivoted-results.md) before shaping
  chart data or colours.**
- `underlyingData` and `drillDown` are permission- and host-gated point actions for the helper.

Normal data apps use `/app/skill.md` and their query APIs. They do not use this hook or
`useVizActions`. In a viz, do not use `useLightdash()`, `filtersFor(EXPLORE)`,
`addFilter({...})`, or `format(row, fieldName)`; there is no explore to query or filter.

## Colours

Use host-resolved colours for every series or client-side group:

```tsx
resolveSeriesColor(context, pivotColumn, index);
resolveValueColor(context, fieldId, rawValue, index);
```

These preserve model colours and shared dashboard assignments before using `colorPalette`.
Keep a small fallback only when a helper returns `undefined`. Declare `colorPalette` whenever
the chart uses either helper or the palette. In a viz, do not import `CHART_COLORS`; that is
the data-app contract.

## Eligible point actions

Point actions are required for every mark with clear provenance: exactly one original source
row and exactly one declared metric-slot field. Do not attach them to aggregates, binned
points, "other" slices, or a mark combining metrics. The helper independently exposes
underlying-data and drill actions only when the current viewer and host permit them.

Store this provenance when preparing data. `metric` is the declared `fields` name, not a query
field id. For a multiple metric input, use its slot name for `metric` and retain the selected
binding member as `fieldId`, for example `metric: 'values', fieldId: valueId`.

```tsx
const data = rows.map((row) => ({
  key: JSON.stringify([getRaw(row, categoryId), 'value', valueId]),
  label: getFormatted(row, categoryId),
  value: Number(getRaw(row, valueId) ?? 0),
  row,
  metric: 'value',
  formattedValue: getFormatted(row, valueId),
}));
```

Use the template helper for React SVG/HTML marks. It owns menu placement, portal and viewport
collision handling, keyboard and focus restoration, permission gating, host intents, and the
tooltip/menu interaction. A new pointer movement after dismissing a menu makes the tooltip
eligible again. ECharts, imperative D3, canvas, and other non-React mark renderers use the
conditional adapter reference above.

```tsx
import { useVizActions } from '@/lib/viz-actions';

const { getMarkProps, menu, tooltipVisible } = useVizActions({
  underlyingData,
  drillDown,
});

// Render this on the actual Recharts custom shape, not on <Bar> or the chart container.
const renderBar = (shapeProps: CustomBarShapeProps) => {
  const { x, y, width, height, payload: datum } = shapeProps;
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      {...getMarkProps({
        key: datum.key,
        row: datum.row,
        metric: datum.metric,
        fieldId: datum.fieldId,
        label: datum.label,
        formattedValue: datum.formattedValue,
      })}
    />
  );
};

return (
  <>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <Tooltip active={tooltipVisible ? undefined : false} cursor={false} />
        <Bar dataKey="value" shape={renderBar} />
      </BarChart>
    </ResponsiveContainer>
    {menu}
  </>
);
```

Use the chart library's controlled tooltip API with `tooltipVisible`; do not leave a second,
uncontrolled tooltip visible while the menu is open. Spread `getMarkProps(point)` onto each
actual eligible SVG or HTML mark. `point.key` must be unique among rendered marks and stable
over rerenders: include the full row-grain identity, metric slot, and bound metric field id.
The example assumes one row per category. `label` is the
accessible mark label; `formattedValue` is the formatted numeric metric string. Render `{menu}`
once beside the chart. D3 may follow the same pattern when it renders SVG through React.

## Declaration

Emit one structured declaration alongside the component, never a file. It has `fields`,
`configOptions`, `colorPalette`, and optional `inputGuidance`. Lightdash builds the mapping UI
and config panel from it.

The correspondence is exact: every `fieldMapping` or `options` key read by the component is
declared, and every declared key is read. A viewer control without an effect is invalid.

### `fields`

Declare one entry for every input:

- `name`: the unique, space-free `fieldMapping` key.
- `label`: viewer-facing mapping label.
- `type`: `dimension`, `metric`, `series`, or `column`.
- `required`: use `false` only when the chart renders without the input.
- `multiple`: set `true` for an ordered selection of fields. Preserve its selected order in
  axes, columns, legends, and series; a required empty array needs a placeholder.
- `description`: optional reusable help, at most 160 characters, describing role and shape
  without business-specific examples.

Use a multiple input for a variable number of measures or grouping columns instead of numbered
slots. Keep stable field names for compatible upgrades. Do not generate field examples;
viewers provide values from their own queries.

### `inputGuidance`

Optional reusable mapping help, at most 200 characters and two short sentences. State row
grain, required order, and how a query with a different shape should be reshaped. Describe the
chart contract, never a fixed business dataset.

### `configOptions`

Declare one whole-chart setting per viewer-changeable choice. Each has a unique, space-free
`name`, viewer `label`, required `default`, and one of these types. Options are whole-chart
values, never per-series settings:

| `type` | control | `default` | extra keys |
|---|---|---|---|
| `boolean` | switch | `true` / `false` | — |
| `select` | dropdown | declared choice value | `choices`, at least one `{ value, label }` |
| `number` | number input | number | optional `min`, `max` |
| `text` | single-line input | string | — |
| `color` | colour picker | hex string | — |

Use optional `group` to place options in a shared config tab. A colour option is for one accent,
not series colours. It accepts a hex string and palette swatches; an existing choice stays fixed
when the theme or palette changes. Viewer-picked series/group colours use the resolved-colour
helpers.

### `colorPalette`

Declare `{ "group": "..." }` when the component uses a resolved-colour helper or
`colorPalette`; otherwise declare `null`. The group is optional. This is separate from
`configOptions`: it has neither `name` nor `default`, and its colours never arrive in `options`.

## Final pass

List component literals and declare every plausible viewer choice: shown elements as `boolean`,
variants as `select`, quantities as `number`, strings as `text`, and non-series accents as
`color`. Leave only chart-integrity constants fixed.

Verify all required bindings, option/field correspondence, palette declaration, viewport fill,
and placeholder states. For each eligible mark, verify that data retains its source row and one
declared metric slot, the actual mark spreads `getMarkProps`, and the chart renders `{menu}`
once outside its chart tree. Test pointer and keyboard activation (Tab, Enter/Space, then Escape
returns focus), permission combinations, viewport-edge menu collision, and tooltip suppression
until the next pointer movement.
