# Plan: Spreadsheet Formula Table Calculations — Phased Migration

## Context

Table calculations today come in two flavors — **raw SQL** and **predefined templates** — both stored as variants of the `TableCalculation` discriminated union (`packages/common/src/types/field.ts:504-524`). We want to introduce a third variant, **spreadsheet formulas**, that compiles to SQL on the backend but never exposes raw SQL to the user. Eventually SQL table calcs are deprecated and removed.

---

## Phase 1: Introduce "Formula" as a new table calculation variant (behind feature flag)

### 1a. Add feature flag

| File | Change |
|------|--------|
| `packages/common/src/types/featureFlags.ts` | Add `FormulaTableCalculations = 'formula-table-calculations'` to `FeatureFlags` enum |
| `packages/backend/src/models/FeatureFlagModel/FeatureFlagModel.ts` | Register handler with PostHog fallback (follows existing pattern, e.g. `getUserGroupsEnabled`) |

This lets you enable per-org via PostHog for testing with select teams before wider rollout.

### 1b. Extend the `TableCalculation` type

**File:** `packages/common/src/types/field.ts`

Add a `formula` variant to the discriminated union:

```typescript
export type TableCalculation = {
    index?: number;
    name: string;
    displayName: string;
    format?: CustomFormat;
    type?: TableCalculationType;
} & (
    | { sql: string }
    | { template: TableCalculationTemplate }
    | { formula: string }   // <-- NEW: spreadsheet-style formula string
);
```

Add type guard:

```typescript
export const isFormulaTableCalculation = (
    calc: TableCalculation,
): calc is TableCalculation & { formula: string } =>
    !!calc && 'formula' in calc && !!calc.formula && calc.formula.length > 0;
```

Update `isTableCalculation` to also check for `formula` property.

### 1c. Database migration

Create a migration to add a `formula` column to `saved_queries_version_table_calculations`:

```sql
ALTER TABLE saved_queries_version_table_calculations
    ADD COLUMN formula TEXT;
```

The existing `calculation_raw_sql` remains for SQL calcs. The `template` JSONB column remains for template calcs. The new `formula` column stores the spreadsheet formula string.

**Entity update:** `packages/backend/src/database/entities/savedCharts.ts` — add `formula?: string` to `DbSavedChartTableCalculation`.

**SavedChartModel update:** Read/write the `formula` field when persisting/loading table calculations.

### 1d. Backend compilation

**File:** `packages/backend/src/queryCompiler.ts`

In `compileTableCalculation()`, add a branch for formula table calcs:

```typescript
if (isFormulaTableCalculation(tableCalc)) {
    const compiledSql = formulaCompiler.compile(tableCalc.formula, fieldMap);
    return { ...tableCalc, compiledSql, dependsOn };
}
```

The `formulaCompiler` is your existing spreadsheet formula library. It takes a formula string and a field map, returns SQL. Wire it in here — single integration point.

### 1e. Frontend: Formula editor (behind flag)

**Files:** `packages/frontend/src/features/tableCalculation/components/`

In `TableCalculationModal.tsx`:
- Add `EditMode.FORMULA = 'formula'` to the existing `EditMode` enum (currently `SQL` and `TEMPLATE`)
- When the feature flag is enabled, show "Formula" as the default tab and "Raw SQL" only if the user has `manage:CustomSql` permission (more on this in Phase 2)
- Create a `FormulaForm.tsx` component — a simple text editor for the spreadsheet syntax (no SQL editor needed, lighter weight)

The formula editor should:
- Accept the formula string
- Provide autocomplete for field references (reuse existing field completer)
- Show formula function documentation/hints
- Validate the formula client-side if possible

---

## Phase 2: Gate raw SQL behind `manage:CustomSql` permission

### 2a. Permission enforcement on the backend

**File:** `packages/backend/src/services/ProjectService.ts` (or wherever `runMetricQuery` / `compileQuery` is called)

When processing table calculations in a query:
- If any table calc is a **SQL** table calc (`isSqlTableCalculation`), check that the user has `manage:CustomSql` permission
- If they don't, throw `ForbiddenError('Raw SQL table calculations require Custom SQL permission')`
- Formula and template table calcs do NOT require this permission

This reuses the existing `CustomSql` CASL subject — no new scope needed.

```typescript
const hasSqlTableCalcs = metricQuery.tableCalculations.some(isSqlTableCalculation);
if (hasSqlTableCalcs) {
    const ability = defineAbilityForUser(user);
    if (!ability.can('manage', subject('CustomSql', { organizationUuid, projectUuid }))) {
        throw new ForbiddenError('Raw SQL table calculations require Custom SQL permission');
    }
}
```

**Important edge case:** Existing saved charts with SQL table calcs should still be **viewable** by everyone — only **creating/editing** SQL table calcs should be gated. The permission check should happen at mutation time (create/update chart with SQL table calcs), not at query execution time. Otherwise you'd break dashboards for viewers.

### 2b. Frontend permission gating

**File:** `packages/frontend/src/features/tableCalculation/components/TableCalculationModal.tsx`

- Query user's `manage:CustomSql` ability (use existing `useAbilityContext` or equivalent)
- If user does NOT have `manage:CustomSql`:
  - Hide the "Raw SQL" tab entirely when creating new table calcs
  - When editing an existing SQL table calc, show it read-only with a message: "This calculation uses raw SQL. You need Custom SQL permission to edit it, or you can convert it to a formula."
- If user HAS `manage:CustomSql`: show both tabs as today

### 2c. Saved chart handling for existing SQL calcs

When a user without `manage:CustomSql` opens a chart that has SQL table calcs:
- The chart renders normally (SQL calcs execute as before)
- The "edit" button on the table calc either:
  - Opens in read-only mode, or
  - Offers a "Convert to formula" action if the SQL is convertible

---

## Phase 3: Migration tooling & deprecation path

### 3a. SQL-to-formula converter (optional, nice-to-have)

Build a utility that attempts to convert simple SQL table calc expressions to equivalent spreadsheet formulas. This handles the common cases:
- `${table.field_a} + ${table.field_b}` → `field_a + field_b`
- Simple arithmetic, `CASE WHEN`, `COALESCE`, etc.

Expose this as:
- A backend utility for bulk migration scripts
- A frontend "Convert to formula" button on SQL table calcs

For SQL calcs that can't be auto-converted, they remain as SQL — users with `manage:CustomSql` can manually rewrite them.

### 3b. Admin visibility

Add a project-level admin view showing:
- Count of SQL vs formula vs template table calcs
- Which charts still use SQL table calcs
- This helps admins track migration progress

### 3c. Deprecation warnings

When the feature flag is fully rolled out:
- Show a deprecation banner on SQL table calcs: "Raw SQL table calculations will be removed in a future release. Convert to formula."
- In the creation modal, SQL tab gets a "(Deprecated)" label
- API responses include a `deprecated: true` field on SQL table calcs

---

## Phase 4: Remove SQL table calculations

Only after sufficient migration time:
1. Remove `EditMode.SQL` from the frontend
2. Remove the SQL compilation path from `queryCompiler.ts`
3. Migration to drop `calculation_raw_sql` column (with safety check that no rows still use it, or keep column but stop writing to it)
4. Remove the `sql` variant from the `TableCalculation` type

---

## Key Design Decisions

### Why reuse `manage:CustomSql` instead of a new permission?
- It already semantically means "can write arbitrary SQL"
- No new scope/ability plumbing needed
- Admins already understand what it controls
- Custom roles already handle it

### Why a feature flag instead of just shipping it?
- De-risks the new formula compiler by testing with select orgs first
- Formula syntax needs real-world validation before becoming the default
- Allows rollback if issues found

### Why gate at mutation time, not execution time?
- Existing dashboards with SQL table calcs should keep working for all viewers
- Breaking execution would cause dashboards to fail for users who didn't create the SQL calc
- Only the act of writing SQL should require the permission

### Database schema approach
- Adding a `formula` column (not reusing `calculation_raw_sql`) keeps the data model clean
- Each variant has its own column: `calculation_raw_sql` for SQL, `template` for templates, `formula` for formulas
- Exactly one should be non-null per row

---

## Files to modify (Phase 1 + 2 summary)

| Package | File | Change |
|---------|------|--------|
| common | `src/types/featureFlags.ts` | Add `FormulaTableCalculations` flag |
| common | `src/types/field.ts` | Add `formula` variant, type guard |
| backend | `src/models/FeatureFlagModel/FeatureFlagModel.ts` | Register flag handler |
| backend | `src/database/migrations/YYYYMMDD_add_formula_column.ts` | Add `formula` column |
| backend | `src/database/entities/savedCharts.ts` | Add `formula` to entity type |
| backend | `src/models/SavedChartModel.ts` | Read/write formula field |
| backend | `src/queryCompiler.ts` | Compile formula table calcs |
| backend | `src/services/ProjectService.ts` | Permission check for SQL table calcs |
| frontend | `src/features/tableCalculation/components/TableCalculationModal.tsx` | Add Formula tab, permission gating |
| frontend | `src/features/tableCalculation/components/FormulaForm.tsx` | New formula editor component |
