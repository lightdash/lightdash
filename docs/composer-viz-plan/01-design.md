# Step 1 design — Enriched result columns

Status: designed (research complete, ready to break into PRs)
Date: 2026-08-24
Companion to: [01-enrich-result-columns.md](01-enrich-result-columns.md) (the plan + research prompt this answers)

Four research passes inform this design: column-construction inventory, format
expression fidelity audit, provenance design comparison, and consumer refactor
inventory. This doc is the synthesis; findings are cited inline as file:line.

## 1. The type

```ts
// packages/common/src/types/results.ts

export type ResultColumnProvenance = {
    /** Key into the query's fields map (query_history.fields). */
    fieldId: string;
    /**
     * Which query in a multi-source pipeline the field belongs to. Omitted
     * for single-query results. Two composer nodes can both expose
     * `orders_status`, so a bare fieldId is ambiguous — the MergeFieldOrigin
     * lesson (mergeQuery.ts:620-635).
     */
    sourceQueryUuid?: string;
};

export type ResultColumn = {
    reference: string;
    type: DimensionType;
    /** Display label. Absent ⇒ consumers fall back to the reference. */
    label?: string;
    /**
     * Lightdash format expression: ECMA-376 with in-repo extensions (IEC
     * bytes, tz-shift for date expressions). MUST be rendered with
     * formatValueWithExpression, never raw numfmt.
     */
    format?: string;
    /** The expression cannot encode locale — carried beside it, mirroring
     *  Field.separator / getFieldFormatOverrideProps (formatting.ts:1213). */
    separator?: NumberSeparator;
    /** Escape hatch for the two non-expressible formats: Compact.AUTO and
     *  negative round (magnitude rounding). Mirrors getFieldFormatOverrideProps. */
    formatOptions?: CustomFormat;
    /** Temporal grain. Required for QUARTER (no ECMA-376 token) and for
     *  export paths (GSheets) that branch on grain. */
    timeInterval?: TimeFrames;
    /** Resolved output of getFormatterTimezone: whether values shift into the
     *  display timezone. Saves consumers from needing skipTimezoneConversion /
     *  baseDimensionType. */
    shiftsTimezone?: boolean;
    /** Absent ⇒ no semantic field behind this column (computed DuckDB column,
     *  raw SQL column, table calc, join key). Absence gates interaction
     *  capabilities (drill, underlying data, URLs) off — by design. */
    provenance?: ResultColumnProvenance;
};
```

Design decisions locked by the research:

- **Provenance is inline and column-keyed, not a field-keyed sidecar.**
  Pivot fan-out (one field → N `{field}_{agg}_{groupValue}` columns) is
  unrepresentable in a `Record<FieldId, …>`; the codebase already ships the
  column-keyed pattern twice (`pivotValuesColumns[col].referenceField`,
  `MergeTypedColumn.origin`).
- **No full `ItemsMap` synthesis for generic results.** The merge path is the
  cautionary evidence: synthesized `Field`s pass every type guard
  (`isField`/`isDimension`) and then silently misbehave — URL menus resolve
  the wrong row keys, `richText`/`image`/`colors`/`showUnderlyingValues` are
  dropped unnoticed, and invalid-field detection can never fire. A handle
  that returns `undefined` degrades honestly; a fake field is a bug to be
  discovered.
- **`format` is a Lightdash expression, not portable ECMA-376.**
  `formatValueWithExpression` (formatting.ts:752-845) layers IEC-byte
  handling, tz-relabelling, and registered separator locales on top of
  numfmt. Every consumer of `column.format` must call it.
- **Parameters are interpolated server-side at column-build time.** Parameter
  values are fixed for the lifetime of a query execution (changing one
  re-executes), so `${ld.parameters.*}` placeholders are resolved via
  `evaluateConditionalFormatExpression(item.format, usedParametersValues)`
  before storing `column.format`. This makes the column self-contained and
  deletes the frontend re-format hack (`formatCellContent`,
  useColumns.tsx:82-104). The un-interpolated template stays in chart config
  where it already lives.

Page-level additions on `ReadyQueryResultsPage` (api.ts:1002):

- `resolvedTimezone` — exists on execute responses (api.ts:901), absent from
  the page; temporal expressions are wrong without it.
- `fields` — the provenance-resolution map, from `query_history.fields`
  (already persisted and already used by the page formatter,
  AsyncQueryService.ts:1382-1389). Ship as a **projection** (label,
  tableLabel, fieldType, type, urls, richText, image, colors,
  showUnderlyingValues, filters) rather than full `Field`: `Field.sql` is raw
  dbt SQL and is not currently exposed on SQL/composer results pages.
  This addition is where step-2 (interaction capabilities) plugs in; the
  handle ships first and is inert without it.

## 2. Converter gaps to close first

`getFormatExpression` → `convertCustomFormatToFormatExpression`
(formatting.ts:1116-1184) is the population workhorse and has 11 audited gaps.
Fix before populating, or columns will disagree with today's server-formatted
values:

| Gap | Fix |
|---|---|
| G1 `DEFAULT` → null | emit `#,##0.###` |
| G2 `ID` → null | emit `@` (text format; also fixes Excel scientific-notation IDs) |
| G3 `DATE`/`TIMESTAMP` → null, `timeInterval` unread | emit `yyyy` / `yyyy-mm` / `yyyy-mm-dd` / `yyyy-mm-dd, hh:mm:ss` per grain; QUARTER and the `(Z)` suffix stay renderer-side via `timeInterval` |
| G4 round-default divergence (PERCENT/BYTES: expression says 2dp, structured says ≤3-trailing-dropped) | align, and extend the round-trip test that currently misses it (formatting.test.ts:2606-2712 — no bytes fixtures, percent value lands on exactly 2dp) |
| G5 IEC bytes pseudo-expression (`"KiB"` string-match hack, :777-806) | acceptable, but document `format` as Lightdash-dialect; false-positive risk on user CUSTOM suffixes containing `KiB` |
| G6 negative round dropped | not expressible → `formatOptions` escape hatch |
| G7 `Compact.AUTO` → null (NUMBER/CURRENCY) and silently dropped (PERCENT/BYTES) | value-dependent → `formatOptions` escape hatch; fix the silent-drop branch |
| G8 unescaped prefix/suffix quoting | escape `"` |
| G9 `YEAR_NUM` invisible to converter (would emit `#,##0.###` → `2,021`) | special-case at population |
| G10 currency symbol position under `PERIOD_COMMA`; host-locale `DEFAULT` separator | align or accept documented divergence |
| G11 Excel COUNT override (`#,##0`) | keep in the export path — one `format` cannot hold UI and Excel variants |

Renderer conventions (NOT in the expression): `null → '∅'`, `undefined → '-'`,
booleans via `formatBoolean` keyed off `type === BOOLEAN`, `'NaT'` for bad
temporals, fall-back-to-`String(value)` on throw. The two existing
implementations (formatting.ts vs `formatRowValueFromWarehouse`) already
agree; lift into one shared helper.

Test seed: extend the round-trip fixture to
`applyCustomFormat(v, f) === formatValueWithExpression(convert(f), v, locale(f.separator))`
over every `CustomFormatType` × `{round: undefined, 0, 2, -2}` × every
separator × `{negative, zero, fractional}` values. G1–G10 fall out as
failures.

### Blast radius of the gap fixes (existing converter consumers)

The converter is not only the future population workhorse — it has live
consumers today, and G1–G3 flip their behavior the moment they land. Fixing
the converter globally is still right (a column-only variant would recreate
the exact divergence step 1 exists to kill), but PR 1 must make these changes
deliberate with golden/snapshot coverage:

- **`getFieldFormatOverrideProps` (formatting.ts:1198)** — DEFAULT/ID/DATE/
  TIMESTAMP format overrides currently take the structured-`formatOptions`
  branch because the converter returns null; after G1–G3 they take the
  expression branch, changing what is spread onto query result fields.
- **Excel exports via `getExcelFormatExpression` (formatting.ts:1232)** —
  DEFAULT-format fields get an explicit `#,##0.###` numFmt instead of
  General. The COUNT `#,##0` guard (G11) already anticipates the count case;
  plain-number cells change. Assert the new numFmt in ExcelService tests.
- **`convertCustomMetricsToYaml` (convertCustomMetricsToYaml.ts:15)** —
  writeback starts emitting `format: '#,##0.###'` where it previously
  omitted the key: YAML diff churn and an idempotency hazard of the same
  class as the `VirtualViewCoder` concern in §5. Pin the new output with a
  snapshot and verify writeback round-trips (emit → parse → emit stable).
- `fields.ts:186` (custom-metric format comparison) converts both sides, so
  it is safe by construction — no action.

## 3. Population rules per query source

Columns are **persisted at write time** into `query_history.columns`
(AsyncQueryService.ts:3545-3569) and read verbatim
(QueryHistoryModel.ts:42-84) — enrichment happens on the write path.

| Source | Rule | Where |
|---|---|---|
| **Metric queries** | `itemsMap` is already a parameter of `runQueryAndTransformRows` (AsyncQueryService.ts:2370) and the unpivoted column key *is* the field id. `getUnpivotedColumns` gains an `itemsMap` arg: when `itemsMap[key]` exists → `label = getItemLabel(item)`, `format = getFormatExpression(item)` (post-gap-fixes, parameter-interpolated), `separator`/`formatOptions`/`timeInterval`/`shiftsTimezone` from the item, `provenance = { fieldId: key }`. That single rule is the whole metric-path algorithm. | getUnpivotedColumns.ts:3-21 + call sites :2425, :2629 |
| **Pivoted value columns** | Pass `valuesColumnData.values()` (not `.keys()`) + `itemsMap` into `getPivotedColumns`. Each `{field}_{agg}_{groupValue}` column: `provenance.fieldId = referenceField`, `format` from the source metric, `label` composed from metric label + `pivotValues[].formatted` (already computed with full formatting, :2556-2580). Index/passthrough columns inherit for free (copied by reference). The hardcoded `type: NUMBER` (getPivotedColumns.ts:53) is wrong for MAX-of-timestamp / boolean ANY — fixing it via `convertItemTypeToDimensionType` is a behavior change, stage separately. | getPivotedColumns.ts + call site :2666-2672 |
| **Raw SQL / SQL charts** | The virtual-view item map reaches the same seam as `fieldsMap`, so `label = friendlyName(reference)` comes free from the metric-path change. **No provenance** — virtual-view dimensions are not semantic fields; marking them would resurrect the fake-field failure mode. `format` stays undefined. | SqlQueryComposer.ts:86, virtualView.ts:29-102 |
| **DuckDB compose (composer nodes)** | **No metadata inference (rescoped 2026-08-27, PROD-10681).** A pipeline whose terminal node is a semantic-layer query serves that query's own enriched result set untouched. A DuckDB post-processing node is arbitrarily complex SQL: its columns carry only what DuckDB honestly knows — `reference` + probed type — with no label/format/provenance carried through from upstream nodes. The contract is the interface, not the metadata: every node's result set is the same `ResultColumns` shape and runs the same formatting pipeline (M2 per-type defaults make bare columns render reasonably). The earlier plan to match probed columns against referenced columns is dropped — name/type matching invents metadata (`SUM(revenue) AS revenue` false-positives) and is the fake-field failure mode this design bans; explicit carry-through, if ever wanted, is a user-declared mapping on the pipeline, never inference. Pin with tests: single-node `[semanticLayer]` pipelines must terminate at the metric query's own result set, not a DuckDB `SELECT *` wrap. | runDuckdbSqlQuery probe; PROD-10681 |
| **Compose merges** | The cheapest prototype site: at the exact line where `originalColumns` are built (:8118-8123), `compiledMerge.itemsMap[reference]` (label/format) and `typedColumns[].origin` (provenance) are both in hand and currently dropped. Warehouse merges get the metric-path rule automatically. | AsyncQueryService.ts:8118-8123 |
| **External sources** | DuckDB `DESCRIBE` only — bare columns. Second-class sources gain typing later. | ExternalSourceService.ts:354-373 |
| **Static autocomplete results** | Full field object in scope at :5510 — trivial. | AsyncQueryService.ts:5477-5512 |

Two producer-side hazards:

- **Cache hits copy old columns into new rows** (:4563-4587). For the cache
  TTL after deploy, fresh rows serve unenriched columns. Accept it (all
  consumers must tolerate `undefined` anyway) rather than bumping
  `CACHE_VERSION` (warehouse-load spike). Retention window is 32 days.
- **Two dangling states**: *no provenance* (normal, silent) vs *provenance
  that fails to resolve* (expired source query) must both degrade silently —
  do NOT reuse the "field not found in dbt project" warning path
  (useColumns.tsx:609-636) for the latter.

## 4. Consumer changes, ordered

Every consumer change is inert until the producer populates the optional
fields, so these can land before, after, or interleaved with population.

1. **Exports (HIGH value, self-contained).** Replace the
   `SQL_QUERY_MOCK_EXPLORER_NAME` string-comparison branch
   (AsyncQueryService.ts:1977-1999) with a `columnsToItemsMap(columns)`
   synthesis carrying `label ?? friendlyName(reference)` and `format`.
   Because `formatItemValue` checks format expressions first and
   `getExcelFormatExpression` reads `item.format` — Excel `numFmt` **is**
   ECMA-376, zero conversion — CsvService/ExcelService/PivotTableService/
   GSheets need no changes. Precedent: `buildItemMapFromColumns`
   (SchedulerTask.ts:402-422). Named blocker: `GoogleDriveClient.formatCell`
   branches on `timeInterval` and TIMESTAMP-vs-DATE — hence `timeInterval` on
   the column. User `customLabels` from chart config must keep winning over
   `column.label` (assert in a test). Golden-file tests. Do NOT attempt the
   full ItemsMap→columns rewrite of the four export services.
2. **Labels (LOW).** `getAiArtifactTableConfig` `label: column.label ??
   column.reference` (one line; note it also feeds saved-SQL-chart creation —
   the one write-path side effect); `SqlChartResultsRunner`/
   `SqlRunnerResultsRunnerFrontend` stop discarding `originalColumns`
   metadata; `IResultsRunner` gains `getColumns(): ResultColumn[]`;
   `TableDataModel.getResultOptions` falls back `label ?? column.label ?? key`.
3. **Format-aware cell renderer (MEDIUM).** Extend TanStack `ColumnMeta` with
   `resultColumn?: ResultColumn`; `useVirtualTable`/`useTableDataModel` set
   it; `getValueCell` branches to `formatValueWithExpression` when
   `format` present, `formatRowValueFromWarehouse` stays the fallback.
   Timezone hazard: without `resolvedTimezone` on the page, client-side
   temporal formatting shifts to the viewer's zone — page-level timezone is a
   prerequisite for temporal columns. Then the AI artifact table keeps `raw`
   and renders through this (design B — preserves JSON cells and copy-raw).
4. **Agent preview (MEDIUM, eval-sensitive).** Keep CSV values raw (models
   re-quote values into SQL; percent display ×100 would corrupt reasoning).
   Enrich only the `columnSummary` line with label + format so semantics
   reach the model as metadata. Snapshot tests pin this surface.
5. **Chart formatters (HIGH, last).** The new viz stack can express only
   percent/SI/compact today (CartesianChartDataModel two-case switch,
   PieChartDataModel hardcoded default, BigNumber compact-only). Route
   through `formatValueWithExpression` with precedence
   **display-config-wins** over `column.format` (a user's explicit "Percent"
   choice overrides the column). Enabling one-liners ×4 in
   `sqlRunnerPivotQueries.ts` (`Object.values(pivotResults.columns)` instead
   of bare references) — the natural moment to retire the deprecated
   `VizColumn` alias. Land after (3) so table and chart of the same query
   agree. Perf note: expression formatting per tooltip callback on wide
   pivots needs a memoized formatter per column.

## 5. Compatibility (verified)

- **Additive-only**: `ResultColumn` appears in responses everywhere except
  one request body (`VirtualViewAsCode.columns`), where unknown optional
  props are ignored (tsoa without `noImplicitAdditionalProperties`).
  `oasdiff breaking` classifies added optional properties as non-breaking;
  the release-safety marker computes from migrations/restApi/mcpApi/config
  and none trips. **No release-safety declaration** (declaring one would be
  wrong per CLAUDE.md). No migration — the jsonb columns exist.
- Run `pnpm generate-api` locally to validate; the pre-commit hook unstages
  the generated artifacts (by design).
- Old `query_history` rows need **no** read-time defaulting (optionals read
  as `undefined`; house style is default-at-consumer). If a single seam is
  wanted later: `convertDbQueryHistoryToQueryHistory` covers every read path.
- **`VirtualViewCoder` idempotency**: keep its `transform()` emitting the
  minimal `{reference, type}` shape or normalize before `isEqual`, else every
  committed virtual-view YAML reports UPDATE forever.
- **Payload size**: columns ride every results page and are persisted twice
  more (query_history, pre-aggregate materializations); wide pivots multiply
  label/format strings. Measure; consider omitting `format` on pivoted value
  columns in favor of the source column + provenance if it bites.
- **Snapshot churn**: `expectedColumns` in ProjectService.mock.ts is asserted
  8× in AsyncQueryService.test.ts — population PRs update these; the
  type-only PR does not.

## 6. PR slicing

Each lands green on its own; 1–2 are inert to users.

1. Type + converter gap fixes (G1–G4, G8, G9 minimum) + round-trip test grid.
2. Metric-path + pivot-path population (persisting enriched columns) +
   snapshot updates. Parameter interpolation at column build.
3. Export fix (`columnsToItemsMap`) + golden-file tests → **first user-visible
   win: formatted, labelled SQL/CSV/Excel exports**.
4. Labels through the viz stack (consumer items 2).
5. Page-level `resolvedTimezone` + format-aware cell renderer + AI artifact
   table (consumer items 3).
6. DuckDB propagation (composer terminal nodes inherit metadata) → **composer
   results look like Lightdash data** — the step-1 exit criterion.
7. Agent `columnSummary` enrichment (consumer item 4).
8. (Step-2 boundary) `fields` projection on the results page + provenance
   consumers; chart formatters (consumer item 5).

Linear mapping (Standardize project M1): PR1 ≈ PROD-9829/9830, PR2 ≈
PROD-9831, PR3 ≈ PROD-9833 + PROD-9835, PR6 closes the composer half of M1;
PROD-9832 (honest SQL column metadata) is the SQL-path rule in §3.

## 7. Findings from implementation (PRs 1–2) and M1 convergence gaps

Date: 2026-08-27. Two of this design's assumptions did not survive contact
with the code, and the M1 "interface feels right" bar needs items this doc
under-specified. Corrections first, then the decision they force, then the
remaining gap list.

### Corrections to §3

- **Parameter interpolation needs a migration first.** §3 assumed
  `usedParametersValues` is in scope at column-build time. It is not on the
  queue path: when NATS is enabled, the worker rebuilds
  `RunAsyncWarehouseQueryArgs` entirely from the `query_history` row
  (`buildWarehouseQueryArgs`), and only `request_parameters` (caller-supplied
  values, without resolved project defaults) is persisted — the composer that
  knows the resolved values is gone. Prerequisite: persist the composer's
  `getUsedParameters()` output to a new `query_history.used_parameters` jsonb
  at creation, thread it into `runQueryAndTransformRows`, and interpolate in
  `getResultColumnMetadataFromItem`. Until then, population omits
  parameter-dependent formats entirely (never store an un-interpolated
  placeholder — it throws at render and falls back to `String(value)`).
- **The SQL path gets nothing for free.** §3 claimed `label =
  friendlyName(reference)` "comes free from the metric-path change". False:
  `SqlQueryComposer` keys its fields map by virtual-view field id
  (`getItemMap` → `${table}_${column}`) while raw-SQL warehouse columns are
  keyed by bare column name, so the items-map lookup always misses and SQL
  columns stay bare *by accident*. PROD-9832 must make the rule explicit
  code: `label = friendlyName(reference)`, and **never** provenance for
  virtual-view dimensions (a guard, so a future key match cannot silently
  stamp fake-field provenance).

### Decision — rows are raw; columns carry the rendering recipe

There are two row dialects today: the formatted `ResultValue`
(`{raw, formatted}`) served by the page endpoint via the server-side
per-page formatter, and raw JSONL streamed by the SQL runner directly from
`/query/{uuid}/results`, bypassing formatting entirely. With self-describing
columns, the interface contract is: **rows are raw values; the column carries
everything needed to render them** (format expression + separator +
formatOptions + timeInterval, rendered only through
`formatValueWithExpression`, plus page-level `resolvedTimezone` and — once
persisted — parameter values). The server-formatted `{raw, formatted}` shape
and the per-page formatter closure are legacy: existing consumers keep
working, but **no new consumer may depend on server-formatted values**, and
M2 (shared formatter, PROD-9834) converges the existing ones. This is the
single-formatting-path decision; revisiting it per-consumer is not allowed.

### M1 gap list (the "interface feels right" bar)

An engine (metric layer, raw SQL, composer) is inside the contract when its
results page carries columns a consumer can label, format, and chart without
knowing the engine. Remaining work, with tickets:

| Gap | Where | Ticket |
|---|---|---|
| Used parameter values not persisted → parameter formats un-interpolatable on the queue path | `query_history` migration + `QueryHistoryModel` + create sites + `getResultColumnMetadataFromItem` | PROD-10680 |
| Composer pipelines must speak the interface — the step-1 exit criterion | Rescoped to no-inference (see §3 DuckDB row): pin that single-node pipelines serve the semantic result untouched and DuckDB nodes serve honest bare columns | PROD-10681 |
| Results page lacks `resolvedTimezone` — temporal rendering impossible from the page alone | `ReadyQueryResultsPage` (execute responses already carry it) | PROD-10682 |
| Merged results drop metadata already in hand | the `originalColumns` build site: `compiledMerge.itemsMap` + `typedColumns[].origin` both in scope and discarded | PROD-10683 |
| Pivoted value columns hardcode `type: NUMBER` — lies for MAX-of-timestamp / boolean ANY | `getPivotedColumns` via `convertItemTypeToDimensionType`; behavior change, staged alone | PROD-10690 |
| SQL columns bare by accident, rule never made explicit | §3 SQL-path rule as deliberate code | PROD-9832 |

### 2026-08-28 — provenance is provable lineage, not name matching

Implemented as PROD-10772 and PROD-10773 (follow-ups to PR #28241). The rule
"an item contributes result-column metadata only when it is a genuine
semantic field behind the column" was enforced by an accidental string
mismatch: `SqlQueryComposer` keys its virtual-view items
`${virtualViewName}_${column}` while raw-SQL result columns are bare names,
so lookups missed — plus a defensive `getItemId(item) !== fieldId` guard
duplicated across `resultColumns.ts` and `getPivotedColumns.ts`. Now
explicit:

- **`SqlQueryComposer.getFields()` returns `{}`.** The virtual view is SQL
  generation machinery (typed dashboard-filter compilation, the pivot seam
  via `compile().fields`) and its dimensions never reach the results seam.
- **The id comparison is an invariant assertion.** Items maps are keyed by
  `getItemId` (`getItemMap`, `compileMetricQuery`, `buildMergeItems`), so a
  resolved item whose own field id differs from its key is a producer bug
  and throws instead of silently dropping a real field's metadata.
- **One shared rule.** `getResultColumnSourceItem` (resultColumns.ts)
  resolves the source item for `getUnpivotedColumns`, `getPivotedColumns`,
  and the compose-merge column builder, so metadata and pivoted-column type
  derivation cannot diverge.
- **`query_history.fields` stays empty on SQL and compose paths.** The
  shared prepare/execute seam persists the composer's (now empty) fields
  map, and the shared DuckDB execution tail (`runDuckdbQuery`) no longer
  overwrites the row with the synthetic map. Reader audit: the page formatter, pivot value formatting,
  export items maps, and AI/GSheets consumers all key lookups by bare
  column references, which never matched the prefixed synthetic keys — no
  behavior change. Two deliberate exceptions: pivot-export row caps divide
  by the fields count, so they fall back to the column order when the map
  is empty; and a merge result source backed by a SQL/compose row is now
  refused at compile ("carries no field metadata to merge on") instead of
  compiling against fake fields and failing inside DuckDB at run time.

### Revised sequencing

Population must not re-land ahead of the parameters prerequisite — columns
should be born self-contained, not patched later. Revised order for the rest
of M1: (1) `used_parameters` persistence folded into the population PR so
enrichment ships complete; (2) SQL-path rule + merge path + page
`resolvedTimezone` (small, independent); (3) composer interface pinning
(PROD-10681, rescoped to no-inference — small); (4) pivot type honesty
(staged behavior change); then the M2 export/formatter flips prove the
decoupling.
