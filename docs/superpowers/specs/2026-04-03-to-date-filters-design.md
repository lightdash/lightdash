# To-Date Filter Operators

## Overview

Add four new filter operators — Year to Date, Quarter to Date, Month to Date, and Week to Date — to Lightdash date/timestamp dimensions. These enable period-over-period comparison by filtering rows where the day-within-period is less than or equal to today's equivalent day-within-period, applied across all periods in the data (not just the current one).

## Motivation

Users performing period-over-period analysis need to compare equivalent portions of time periods. For example, comparing YTD sales across multiple years requires filtering each year's data to only include days up to the current day-of-year. Today these users must manually create calculated fields or use workarounds. Dedicated operators make this a one-click operation.

## New Operators

Four new values added to `FilterOperator` enum in `packages/common/src/types/filter.ts`:

| Enum Value | String Value | Display Label |
|------------|-------------|---------------|
| `YEAR_TO_DATE` | `'yearToDate'` | "year to date" |
| `QUARTER_TO_DATE` | `'quarterToDate'` | "quarter to date" |
| `MONTH_TO_DATE` | `'monthToDate'` | "month to date" |
| `WEEK_TO_DATE` | `'weekToDate'` | "week to date" |

### Behavior

- **Available on:** `DATE` and `TIMESTAMP` dimensions at **day level or finer** only — coarser intervals (year, quarter, month, week) lose day-of-period information, making the filter meaningless
- **User input:** None — always compares against today
- **Cross-period:** Applies to all periods in the data, not just the current one
- **No settings required:** No `unitOfTime`, no `completed` flag, no values array

### SQL Semantics

Each operator extracts a date part from the dimension and compares it to the same date part extracted from today:

| Operator | Logic |
|----------|-------|
| Year to Date | day-of-year(dim) <= day-of-year(today) |
| Quarter to Date | day-within-quarter(dim) <= day-within-quarter(today) |
| Month to Date | day-of-month(dim) <= day-of-month(today) |
| Week to Date | day-of-week(dim) <= day-of-week(today), respecting warehouse week-start |

For Quarter to Date and Week to Date, since most warehouses lack direct "day of quarter"/"day of week from custom start" functions, these are computed as the difference in days between the dimension value and its period start. On PostgreSQL/Snowflake/Redshift/DuckDB, timestamp subtraction returns an `interval`, so the result is wrapped in `EXTRACT(DAY FROM ...)` to get an integer. BigQuery, ClickHouse, and Trino/Athena use their native `DATE_DIFF` functions which return integers directly.

Today's date part value is computed in JavaScript and inlined as a literal in the SQL.

Week to Date respects per-warehouse week start configuration via `getDefaultStartOfWeek()`.

## Files Changed

### `packages/common/src/types/filter.ts`
Add four new `FilterOperator` enum values: `YEAR_TO_DATE`, `QUARTER_TO_DATE`, `MONTH_TO_DATE`, `WEEK_TO_DATE`.

### `packages/common/src/compiler/filtersCompiler.ts`
Add four new cases in `renderDateFilterSql()`. Each case:
1. Gets today's date using `getMomentDateWithCustomStartOfWeek()` (timezone-aware)
2. Computes today's date-part value in JavaScript
3. Generates SQL extracting the same date part from the dimension column using warehouse-specific functions
4. Compares with `<=` against the computed today value

### `packages/common/src/utils/filters.ts`
- Update `isWithValueFilter()` to exclude the four to-date operators (they need no values, like IS NULL/IS NOT NULL)
- Update `getFilterRuleWithDefaultValue()` to skip default value assignment for to-date operators

### `packages/common/src/types/filterGrammarConversion.ts`
Add new operators to the `NotImplementedError` group (dbt conversion not supported).

### `packages/frontend/src/components/common/Filters/FilterInputs/DateFilterInputs.tsx`
When one of the four new operators is selected, render no input controls (no date picker, number input, or unit selector). Return `null`.

### `packages/frontend/src/components/common/Filters/FilterInputs/DefaultFilterInputs.tsx`
Add to-date operators returning `null` to satisfy exhaustive switch.

### `packages/frontend/src/components/common/Filters/FilterInputs/utils.ts`
- Add operators to `timeFilterOptions` array
- Add `supportsToDateOperators()` helper that checks field's `timeInterval` — excludes to-date operators for coarse intervals (YEAR, QUARTER, MONTH, WEEK)
- Extend `getFilterOperatorOptions()` with optional `field` parameter to filter operators based on field granularity

### Frontend operator label mapping
Add display labels for the four new operators in `FilterInputs/constants.ts`.

### Callers updated to pass field
- `FilterRuleForm.tsx` — passes `activeField`
- `FilterSettings.tsx` — passes `field` (dashboard filters)
- `SchedulerFormFiltersTab.tsx` — passes `field`

### API generation
Run `pnpm generate-api` to regenerate TSOA routes with the new enum values, otherwise backend validation rejects the new operators.

### Tests
Six test cases covering:
- SQL generation for year/month/quarter/week to date on PostgreSQL
- BigQuery-specific year-to-date SQL
- Trino-specific quarter-to-date SQL

## Not Changed

- **No warehouse adapter changes** — reuses existing SQL functions
- **No database migrations** — filter rules are stored as JSON; new operator strings are new values in existing columns
- **No TSOA/API type changes** — filter types flow through existing generic filter rule types (but routes must be regenerated)
- **No changes to number/string dimension filters** — these operators are date-typed only

