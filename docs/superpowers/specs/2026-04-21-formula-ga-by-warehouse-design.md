# Formula Table Calculations — GA by warehouse support

**Date:** 2026-04-21
**Status:** Approved
**Related:** ZAP-324 (Trino/Athena follow-up)

## Goal

Remove the `FormulaTableCalculations` feature flag. Enable formula table
calculations automatically for any project whose warehouse is supported
by the `@lightdash/formula` package. When the warehouse is unsupported,
the Formula input mode is not offered at all.

## User-facing changes

1. **Supported warehouses** (Postgres, Redshift, BigQuery, Snowflake,
   DuckDB, Databricks, ClickHouse):
   - No more "Coming soon" badge.
   - Formula appears **first** in the `SegmentedControl`, SQL second.
   - Formula is the default mode when creating a new table calculation.
   - A `BetaBadge` decorates the Formula option (re-uses the existing
     `packages/frontend/src/components/common/BetaBadge.tsx`).
2. **Unsupported warehouses** (today: Trino, Athena):
   - The `SegmentedControl` is not rendered at all.
   - Only the SQL editor is shown — same experience as before the
     formula feature existed.

## Architecture

### Source of truth — `@lightdash/formula`

The formula package already owns a `Dialect` union. It will additionally
export a runtime constant:

```ts
export const SUPPORTED_DIALECTS = [
    'postgres',
    'redshift',
    'bigquery',
    'snowflake',
    'duckdb',
    'databricks',
    'clickhouse',
] as const satisfies readonly Dialect[];
```

`as const satisfies readonly Dialect[]` gives us a readonly tuple for
runtime membership checks AND a compile error if `Dialect` and the array
diverge.

### Why this works across packages

`WarehouseTypes` (in `@lightdash/common`) values are lowercase strings
(`'postgres'`, `'redshift'`, …) that are identical to the `Dialect`
string values. No runtime warehouseType → dialect mapping is needed on
the frontend — membership of `warehouseConnection.type` in
`SUPPORTED_DIALECTS` is sufficient.

A compile-time assertion in
`packages/backend/src/formulaDialectMapper.ts` guards the coincidence:

```ts
type _DialectIsWarehouseType = Dialect extends `${WarehouseTypes}`
    ? true
    : never;
const _check: _DialectIsWarehouseType = true;
```

If a future warehouse type string ever diverges from its dialect name,
this assertion fails at `pnpm -F backend typecheck`.

## Implementation

### Formula package

`packages/formula/src/index.ts` — export the new `SUPPORTED_DIALECTS`
constant alongside existing exports.

### Backend

`packages/backend/src/formulaDialectMapper.ts` collapses to a membership
check:

```ts
import { SUPPORTED_DIALECTS, type Dialect } from '@lightdash/formula';
import { SupportedDbtAdapter, WarehouseTypes } from '@lightdash/common';

type _DialectIsWarehouseType = Dialect extends `${WarehouseTypes}`
    ? true
    : never;
const _check: _DialectIsWarehouseType = true;

const isSupportedDialect = (s: string): s is Dialect =>
    (SUPPORTED_DIALECTS as readonly string[]).includes(s);

export const mapAdapterToFormulaDialect = (
    adapter: SupportedDbtAdapter,
): Dialect => {
    if (isSupportedDialect(adapter)) return adapter;
    throw new Error(
        `Formula table calculations are not yet supported for ${adapter}`,
    );
};
```

The throw stays as a belt-and-suspenders backstop (API clients,
chart-as-code YAML, old payloads). No behavior change for end users.

### Frontend

`packages/frontend/src/features/tableCalculation/components/TableCalculationModal.tsx`:

- Remove `useClientFeatureFlag(FeatureFlags.FormulaTableCalculations)`.
- Derive support from `useProject(projectUuid).warehouseConnection.type`
  checked against `SUPPORTED_DIALECTS`.
- Reorder `editModeOptions` to `[Formula, SQL]`.
- Wrap Formula option with `BetaBadge` (replace the inline `Badge`
  "Coming soon" code path entirely).
- When the warehouse is unsupported, do not render the
  `SegmentedControl` — render the SQL editor directly.
- Default mode for new calculations on supported warehouses:
  `EditMode.FORMULA`. On unsupported: `EditMode.SQL`. Editing an
  existing calc: keep existing logic (`hasFormula ? FORMULA : hasTemplate
  ? TEMPLATE : SQL`).

### Cleanup

- Delete the `FormulaTableCalculations` entry from
  `packages/common/src/types/featureFlags.ts:128-131`.
- Remove the `useClientFeatureFlag` import from `TableCalculationModal`
  if no longer referenced elsewhere in the file.
- Remove the inline `Badge` import if unused after the change.

## Testing

### Unit

- `formulaDialectMapper.test.ts` simplifies: one "supported adapter
  returns its dialect" case (parameterised over `SUPPORTED_DIALECTS`),
  one "Trino/Athena throw" case.
- `pnpm -F backend typecheck` validates the `_DialectIsWarehouseType`
  assertion.
- `pnpm -F common typecheck` validates that the deleted feature-flag
  enum entry has no remaining consumers.

### Manual / browser verification

- Postgres (local dev) project: open table calculation modal → Formula
  tab is first, has Beta badge, is default for new calcs. Save an
  existing SQL calc by switching to Formula, persist, reload — formula
  is preserved.
- Simulate unsupported warehouse by editing a local project's
  warehouse type (or swapping the `SUPPORTED_DIALECTS` list
  temporarily) — confirm segmented control is absent and SQL editor is
  the sole input.

## Out of scope

- Existing formula calcs on a project later switched to an unsupported
  warehouse. Backend mapper already errors at query compile time;
  modal UX for this edge case is not tackled here.
- Trino / Athena formula support (tracked as ZAP-324).
- GA announcement copy, release notes, Intercom post — separate task.
- Backend telemetry for "formula was offered / suppressed" — add later
  if adoption data warrants.

## Rollout

Single PR. No feature flag, no migration, no schema change. Backend
mapper is a pure refactor over the same list it already contained. The
frontend change is the only user-visible effect.
