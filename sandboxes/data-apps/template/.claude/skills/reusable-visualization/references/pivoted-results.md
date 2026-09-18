# Backend-pivoted results

Read this only when a mapped `series` field means Lightdash has backend-pivoted the result.
The mapped metric id is then not a direct row key: each series becomes a generated column in
`pivotDetails.valuesColumns`.

Match `valuesColumns` whose `referenceField` equals the mapped metric id. Use `pivotValues` to
find and label the mapped series value. Generated `pivotColumnName` keys contain normal
`VizContextCell` values, so read them with `getRaw(row, column.pivotColumnName)` and
`getFormatted(row, column.pivotColumnName)`.

```tsx
const metricId = fieldMapping.value;
const seriesId = fieldMapping.series;
const pivotedMetrics = pivotDetails?.valuesColumns.filter(
  (column) => column.referenceField === metricId,
) ?? [];

const series = pivotedMetrics.map((column, index) => ({
  columnId: column.pivotColumnName,
  label:
    column.pivotValues.find((value) => value.referenceField === seriesId)
      ?.formatted ?? 'Unknown',
  color: resolveSeriesColor(context, column, index) ?? fallbackColors[index % fallbackColors.length],
}));

const data = rows.map((row) => ({
  label: getFormatted(row, fieldMapping.category),
  ...Object.fromEntries(
    series.map(({ columnId }) => [columnId, Number(getRaw(row, columnId) ?? 0)]),
  ),
}));
```

Use `valuesColumns` order for the resolved-colour fallback index. With multiple declared series
fields, compose a label from matching `pivotValues` in declared-field order. With multiple
selected metric ids, iterate those ids first, then match `valuesColumns` by `referenceField`.

`pivotDetails` describes layout, not permission to render arbitrary query columns:

- `indexColumn`: row-grain fields and `time`/`category` axis semantics.
- `groupByColumns`: pivot-header fields in backend layout order.
- `originalColumns`: source ids and semantic types before pivoting.
- `sortBy`: pivoted-result sort, including anchored pivot values.
- `totalColumnCount`: untruncated total, useful for a truncated-columns explanation.
- `passthroughDimensions`: hidden dimensions retained for cross-field rendering.

Keep the ordinary `fieldMapping` row path when `pivotDetails` is `null`, so the viz also works
without a mapped series and on older unpivoted charts. Pivoted rows lack a safe one-source-row
provenance, so `underlyingData.enabled` is false and they do not receive point actions.
