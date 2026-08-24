# Step 1 — Enrich the results interface

Status: proposed
Depends on: nothing (first step)
Unblocks: steps 2–5 (every later step consumes the enriched interface)

## Goal

Make the generic results shape self-describing enough to visualize: a consumer
holding only `ReadyQueryResultsPage` (rows + columns + pivotDetails) can render
correctly formatted, correctly labelled output — without an `ItemsMap`, an
`Explore`, or a `MetricQuery`. This is the contract that lets the viz stack
detach from the query stack.

## Current state

- `ResultColumn` is `{ reference, type: DimensionType }` —
  `packages/common/src/types/results.ts:74`. The comment at `:76` already
  anticipates richer column types.
- Formatting is applied **server-side per results page**: S3 stores raw JSONL;
  `AsyncQueryService.getAsyncQueryResults` builds a formatter closure from the
  query's persisted `fields: ItemsMap` (`AsyncQueryService.ts:1382-1389`).
  So metric-path results are already formatted; the *metadata* just isn't on
  the wire in a generic form.
- The in-repo TODO names this exact work — `AsyncQueryService.ts:1977`:
  *"We should use the columns data instead of fields. We need to: add format
  expression to columns type and refactor csv service, etc to use columns
  instead of fields"* — followed by the workaround that synthesises label-only
  `Dimension`s for SQL-query exports.
- The generic frontend path throws formatting away:
  `AiArtifactTableVisualization.tsx:12-17` unwraps every cell to `raw`;
  `formatRowValueFromWarehouse.ts` is `String(value)`; the SQL runner streams
  raw JSONL from `/query/{uuid}/results`, bypassing the formatted page
  endpoint entirely. The agent path does the same (`unwrapCell` in
  `AiAgentToolsService.runComposerQueries`).
- The precedent for provenance: merge queries synthesise an `ItemsMap` plus
  `fieldOrigins` per column (`packages/common/src/types/mergeQuery.ts:570-585`)
  and get the full classic capability set back through `useColumns.tsx`.
- DuckDB/compose nodes derive columns from a `LIMIT 1` probe
  (`runDuckdbSqlQuery`) with no field metadata at all, even when every column
  passes through unchanged from a referenced semantic-layer node whose
  `query_history.fields` holds complete formatting metadata.

## Proposed approach

1. **Extend `ResultColumn` additively** with optional metadata:
   - `label?: string`
   - `format?: string` — a self-contained ECMA-376 format expression. The
     engine (`formatting.ts` / `numfmt`) and the converters
     (`convertCustomFormatToFormatExpression`, `getFormatExpression`) already
     exist; legacy `{format, round, compact}` and `CustomFormat` both compile
     to an expression today.
   - a provenance handle (design TBD — see research prompt) linking a column
     back to a semantic field id when one exists. Provenance is the tier that
     unlocks drill-down, underlying data, `field.urls`, per-value colors.
2. **Populate at column-build time** on the backend: the metric path already
   has the `ItemsMap` in hand where `getUnpivotedColumns` / `getPivotedColumns`
   run; SQL paths get label = friendly name only; the DuckDB source propagates
   label/format/provenance for pass-through columns by resolving its
   referenced `query_history` rows' persisted `fields`/`columns` (mirroring
   how `buildQueryReferenceCtes` already loads referenced columns).
3. **Consume**: stop unwrapping to raw in the artifact table and agent
   preview; route exports (CSV/XLSX/GSheets) through columns instead of
   synthesised dimensions, per the existing TODO.

## Out of scope

- Any change to how classic charts render (they keep `ItemsMap`).
- Conditional formatting, totals, subtotals in the generic table (later,
  possibly step 5).
- `resolvedTimezone` for SQL paths (worth fixing here if cheap — currently
  hardcoded `null`).

## Open questions

- Provenance shape: a `fieldId` string? A `fieldOrigins`-style map next to
  columns (merge precedent)? Full `ItemsMap` synthesis for compatibility with
  `useColumns.tsx`?
- Where enrichment happens: persisted onto `query_history.columns` at write
  time vs computed at page-read time.
- Pivoted value columns: today headers are formatted via
  `pivotValuesColumns` + `ItemsMap`; how do enriched columns represent the
  `{field}_{agg}_{groupValue}` spread?
- API compatibility: additive optional fields on a TSOA-generated type —
  confirm no release-safety declaration needed.

## Research prompt

```
You are researching a change to the Lightdash monorepo (repo root: lightdash/lightdash).
Read docs/composer-viz-plan/README.md and docs/composer-viz-plan/01-enrich-result-columns.md
first — they define the goal: enrich the generic query-results interface
(ResultColumn in packages/common/src/types/results.ts) with label, format, and
field-provenance metadata so that visualization no longer requires an ItemsMap.
Do not implement; produce a concrete design doc.

Investigate and answer, with file/line evidence:

1. Column construction inventory. Find every place ResultColumns are built or
   persisted: getUnpivotedColumns.ts, getPivotedColumns.ts, QueryHistoryModel
   (columns + fields jsonb), SqlQueryComposer/virtual view, the DuckDB path in
   AsyncQueryService (runDuckdbSqlQuery, buildQueryReferenceCtes), merge
   queries. For each: what metadata is in scope at that moment (ItemsMap?
   explore? referenced query_history rows?) and what it would take to attach
   label + ECMA-376 format expression + a semantic field id.

2. Format expression fidelity. In packages/common/src/utils/formatting.ts,
   verify that every formatting behavior of formatItemValue can be represented
   as a stored ECMA-376 expression evaluated against a raw value + timezone:
   check legacy {format, round, compact, separator}, CustomFormat (currency,
   bytes, prefix/suffix, timeInterval), parameter-dependent expressions
   (${ld.parameters.*}), and date/timestamp handling. List what CANNOT be a
   self-contained expression and propose how those cases degrade.

3. Provenance design. Compare three options against the consumers in
   packages/frontend/src/hooks/useColumns.tsx and the MetricQueryData
   drill-down/underlying-data machinery: (a) fieldId string on ResultColumn,
   (b) a fieldOrigins-style sidecar map (see packages/common/src/types/
   mergeQuery.ts:570-585 and how useColumns consumes mergeResults.fields),
   (c) synthesising a full ItemsMap for generic results. Recommend one, with
   the migration story for pivoted value columns (pivotValuesColumns).

4. Consumer refactor list. Enumerate what changes when columns carry the
   metadata: AiArtifactTableVisualization + getAiArtifactTableConfig,
   formatRowValueFromWarehouse/getValueCell, TableDataModel.getResultOptions,
   CsvService/ExcelService/GSheets export paths (the TODO at
   AsyncQueryService.ts:~1977), the SQL runner raw-stream path
   (executeQuery.ts getResultsFromStream), and the agent's unwrapCell.

5. Compatibility. Confirm additive optional fields on ResultColumn are
   backward-compatible for the TSOA-generated OpenAPI and typed frontend
   clients; check whether query_history.columns jsonb rows written before the
   change need a read-time default; check release-safety implications per
   CLAUDE.md.

Deliverable: a design doc with the chosen ResultColumn shape (TypeScript),
population rules per query source, the DuckDB propagation algorithm for
pass-through vs computed columns, the consumer change list ordered by risk,
and a test plan (unit tests to add, snapshot risks).
```
