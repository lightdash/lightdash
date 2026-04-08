# Formula Table Calculations — POC Design

## Overview

Add a "Formula" tab to the Table Calculation modal that lets users write Google Sheets-like formulas (e.g., `=IF(Revenue > 1000, "high", "low")`) instead of raw SQL. The formula is compiled to dialect-specific SQL via the internal `@lightdash/formula` package and executed through the existing table calculation pipeline.

## Feature Flag

- **Name**: `FormulaTableCalculations` added to `FeatureFlags` enum in `packages/common/src/types/featureFlags.ts`
- **Guards**: Visibility of the "Formula" tab in the table calculation modal
- **Default**: Disabled

## Type Changes

**File**: `packages/common/src/types/field.ts`

Add an optional `formulaSource` field to `TableCalculation`:

```typescript
type TableCalculation = {
    index?: number;
    name: string;
    displayName: string;
    format?: CustomFormat;
    type?: TableCalculationType;
    formulaSource?: string; // Original formula, e.g. '=IF(Revenue > 1000, "high", "low")'
} & (
    | { sql: string }
    | { template: TableCalculationTemplate }
)
```

When a formula is saved:
- `formulaSource` stores the original formula text (with display names for re-editing)
- `sql` stores the compiled SQL output (for execution)
- The backend sees it as a normal SQL table calculation — zero backend changes needed

## Frontend Implementation

### Formula Editor Component

**New files** in `packages/frontend/src/features/tableCalculation/`:
- `FormulaForm.tsx` — Main formula editor form
- `FormulaForm.module.css` — Styling
- `FormulaEditor/FormulaEditor.tsx` — TipTap-based formula input
- `FormulaEditor/FormulaEditor.module.css` — Editor styling
- `FormulaEditor/index.ts` — Exports

### TipTap Editor (modeled on AI table calc input)

The formula input uses TipTap with the same pattern as the AI table calculation input (`ee/features/ambientAi/components/tableCalculation/components/AiPromptInput/`).

**Extensions:**
- `StarterKit` — Minimal config (no headings, lists, blockquotes, code blocks)
- `MentionWithLabel` — Extended `Mention` for field references with `@` trigger
- `Placeholder` — "Type a formula (use @ to reference fields)..."

**Mention behavior:**
- `renderHTML`: Shows display name as a styled chip (e.g., pill showing "Revenue")
- `renderText`: Returns field identifier (e.g., `orders_revenue`) for formula compilation
- Mention nodes store both `id` (field identifier) and `label` (display name)

**Autocomplete:**
- Reuse `generateFieldSuggestion` pattern and `FieldSuggestionList` component
- Sources field list from explorer context (dimensions, metrics, existing table calcs)
- Triggered by `@` character
- Keyboard navigation: Up/Down to browse, Enter to select, Escape to dismiss

**Key differences from AI input:**
- No "generate" button or AI integration
- Formula validation on change via `parse()` from `@lightdash/formula`
- Real-time syntax error display below the editor
- No Enter-to-submit — Enter is just a newline (formulas can be multiline)

### Field Name Resolution

Build a bidirectional map from explorer context:

```typescript
// displayName → fieldId (for compilation)
{ "Revenue": "orders_revenue", "Order Count": "orders_count" }

// fieldId → displayName (for re-editing)
{ "orders_revenue": "Revenue", "orders_count": "Order Count" }
```

**On save (formula → SQL):**
1. Extract text from TipTap via `getText()` — mentions render as field IDs
2. Parse with `parse()` for validation
3. Compile with `compile(formulaText, { dialect })` to get SQL
4. Store: `sql` = compiled SQL, `formulaSource` = original formula with display names

**On edit (SQL → formula):**
1. If `formulaSource` exists, restore it into the TipTap editor
2. Reconstruct mention nodes from the stored display names
3. Default to Formula tab

### Dialect Resolution

Map `WarehouseTypes` (from project/explorer context) → formula `Dialect`:

```typescript
const warehouseToDialect: Record<WarehouseTypes, Dialect> = {
    [WarehouseTypes.POSTGRES]: 'postgresql',
    [WarehouseTypes.BIGQUERY]: 'bigquery',
    [WarehouseTypes.SNOWFLAKE]: 'snowflake',
    [WarehouseTypes.DATABRICKS]: 'duckdb',    // closest match for POC
    [WarehouseTypes.TRINO]: 'postgresql',      // closest match for POC
    [WarehouseTypes.REDSHIFT]: 'postgresql',   // Redshift is PG-compatible
}
```

The warehouse type is available via `useExplorerContext()` or project settings.

### TableCalculationModal Changes

**File**: `packages/frontend/src/features/tableCalculation/TableCalculationModal.tsx`

- Add "Formula" tab alongside "SQL" and "Template" tabs
- Tab visibility gated by `useServerFeatureFlag(FeatureFlags.FormulaTableCalculations)`
- When Formula tab is active, render `FormulaForm` instead of `SqlForm`/`TemplateViewer`
- When opening a table calc with `formulaSource`, default to Formula tab

### Validation & Error Display

- **Real-time**: On every keystroke, run `parse()` and show syntax errors inline below the editor
- **On save**: Run `compile()` and show compilation errors if any
- **Error format**: Red text below editor with the error message from the formula parser

## What's NOT in the POC

- No formula-aware function autocomplete (only field names via `@`)
- No migration of existing SQL table calcs to formulas
- No formula support in chart-as-code YAML
- No backend changes — frontend compiles to SQL before sending
- No persistence of `formulaSource` to database — table calcs are stored in `saved_queries_version_table_calculations` table; adding a `formula_source` column is out of scope for POC. The formula source lives only in the explorer session state.
- No Databricks/Trino-specific codegen (use closest dialect)

## Stack Plan

Graphite stack `table-calc-formula-poc`:
1. **Feature flag + types** — Add flag, extend `TableCalculation` type
2. **Formula editor component** — TipTap editor with field mentions
3. **Formula compilation integration** — Wire up `@lightdash/formula` compile, field name resolution, dialect mapping
4. **Modal integration** — Add Formula tab to TableCalculationModal behind feature flag
