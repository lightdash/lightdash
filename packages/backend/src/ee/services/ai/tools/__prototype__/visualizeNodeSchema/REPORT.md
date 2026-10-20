# ZAP-1278 prototype: which LLM-facing viz schema the agent authors for a presented composer node

Throwaway. Run: `direnv exec . npx tsx packages/backend/src/ee/services/ai/tools/__prototype__/visualizeNodeSchema/run.ts`
(`PROTO_MODEL=claude-haiku-5-5` for the second model). Needs the local dev server and `ANTHROPIC_API_KEY`.

## Question

Stored artifact config is classic `ChartConfig`, rendered headlessly by `@lightdash/visualization`
from rows plus fields built from enriched result columns. Which schema does the agent write:

- **A**: runQuery's flat tool args generalised to every chart type (`chartType, x, y[], groupBy[], stack,
  secondaryY, labels, customChartTypeSlug + fieldMapping`), converted server-side.
- **B**: a reduced classic subset written directly (`chartConfig` discriminated on type; cartesian carries
  `layout` + `eChartsConfig.series[]` with `encode`, `stack`, `yAxisIndex`; plus `pivotColumns`).

Both validate against the node's `ResultColumns` with model-facing errors (`validationErrors.ts`).

## Method

Five real Jaffle shop questions, each with a real composer pipeline run through
`POST /api/v2/projects/:uuid/query-sources/queries`. The model (claude-sonnet-5-5, then claude-haiku-5-5)
sees the question, the terminal columns (reference, type, label), five sample rows and the installed
custom chart types' slots, and calls `visualizeNode` under schema A then schema B. Up to 3 retries on
validation error. The resolved `ChartConfig` is rendered with `renderChart` on the fetched rows, and,
when the chart needs series from a group-by, on a pivot run on the compose engine.

| # | Question | Terminal columns |
|---|---|---|
| q1 | monthly revenue by status, stacked bar | semanticLayer: month, status, total amount |
| q2 | total revenue | semanticLayer: total amount (1 row) |
| q3 | revenue share by status | **duckdb** node renaming columns: `status, revenue, share_pct` (no provenance) |
| q4 | monthly order count with average order amount | semanticLayer: month, count, average |
| q5 | heatmap via installed custom chart type | semanticLayer: month, status, total amount |

## Results (`results.json` = sonnet, `results.haiku.json` = haiku)

| | A | B |
|---|---|---|
| Valid on first attempt (2 models × 5 q) | 10/10 | 10/10 |
| Validation retries | 0 | 0 |
| Prompt+completion tokens per call (sonnet, mean) | ~2.1k | ~2.9k (+40%, the schema) |
| Panel can edit back (x / y / groupBy / kind / stack) | q1 q2 q3 q5 yes; q4 no (secondary axis) | q1 q2 q3 q5 yes; q4 no (bar+line combo, secondary axis) |
| Rendered | q1 5 series, q2 `$4,149.12`, q3 1 pie series, q4 2 series, q5 `unsupported` | same |

Qualitative differences the runs exposed:

- **B invites detail the panel cannot round-trip.** Unprompted, sonnet wrote q4 as a bar + line combo
  with a named stack and two y axes. Valid, renders, but the viz config panel's vocabulary
  (kind, x, y, groupBy, stack) cannot represent it, so the first edit would destroy it. A cannot express
  mixed series types at all; its only panel-unrepresentable field is `secondaryY`.
- **B has an internal consistency surface A does not.** `eChartsConfig.series[].encode` must agree with
  `layout.xField/yField`; the validator had to add that rule. With A the converter owns the series list,
  so the error class does not exist.
- **Defaults live in one place with A.** Legend, grid, `containLabel`, axis arrays, `areaStyle` for
  area, `flipAxes` for horizontal are filled by the converter, so every stored composer `ChartConfig`
  looks the same. With B the model decides (or omits) them per call.
- **A's one bug was in the converter, not the model**: the model listed the secondary field in both `y`
  and `secondaryY`, producing a duplicate series. Fixed by dedupe; a reason to validate the converter's
  output, not just the args.
- No column-reference confusion in either schema, including the DuckDB node with renamed columns and
  the custom slots.

## The pivot mechanism (named)

`renderChart` on the unpivoted node rows with `pivotConfig.columns = [status]` returns
`empty / needsPivotDetails` (both runs, q1). One DuckDB node on the compose engine reading the stored
node result,

```json
{ "sourceType": "duckdb", "nodeId": "viz_pivot", "sql": "SELECT * FROM src",
  "references": { "src": "<node queryUuid>" },
  "pivotConfiguration": { "indexColumn": { "reference": "orders_order_date_month", "type": "time" },
                          "valuesColumns": [{ "reference": "orders_total_order_amount", "aggregation": "any" }],
                          "groupByColumns": [{ "reference": "orders_status" }] } }
```

returns `pivotDetails` plus columns `orders_total_order_amount_any_<status>`; `renderChart` then draws
five series. No warehouse query, no S3 round trip beyond the stored result. This is exactly what the
frontend's `useComposerPivot` already does for the viz switcher, so the mechanism is: **pivot at render,
as a DuckDB pivot node over the stored node result, derived from the chart config (`layout.xField`,
`layout.yField`, `pivotConfig.columns`)**; the pivot is never stored on the presented node. The
`PivotConfiguration` is derived by `pivotFor()` in `visualizeNodeSchemas.ts`.

## Custom chart type slot mapping on column references

Slot binding written as `fieldMapping: { x: "orders_order_date_month", y: "orders_status", value: "orders_total_order_amount" }`
validates against the installed slots unchanged (required, multiple, dimension/series vs metric), using
one rule: a number column is a metric, everything else a dimension. The frontend renderer's
`reconcileDataAppVizFieldMapping` pools dimensions and metrics from an `ItemsMap`, so composer columns
need lifting into one (`columnsToFields` here, `toItemsMap` in the visualization package does the same
for `ChartFieldDefinition`s); after that it works on column references with no change to the renderer.
`renderChart` returns `unsupported` for `DATA_APP_VIZ`: custom chart types draw only through the
frontend iframe (`DataAppVizRenderer`), never headlessly. Two caveats for the spec: numeric dimensions
(ids, years) read as metrics under the one rule, so slot validation may need the planner's id-like
heuristic or an explicit `role` on enriched columns; and the artifact stores a slug today, where the
saved chart stores `dataAppVizUuid` + version, so the tool must resolve slug to uuid at call time as
`runQuery` does.

## Recommendation

**Schema A**: the flat, panel-vocabulary schema generalised to every supported `ChartType` plus custom
slot mapping, converted server-side to classic `ChartConfig`. It is ~30% cheaper per call, everything
it can express the panel and Explore V2 can edit back (the destination's constraint), the converter
owns defaults and series construction, and in 20 trials it lost nothing B gained except combo charts,
which the panel cannot hold anyway. Keep `secondaryY` (cheap, renders) and accept it is panel-read-only
until the panel grows a second axis. Validate the converter's output against columns, not only the args.
