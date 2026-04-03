# To-Date Filter Operators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four new date filter operators (Year to Date, Quarter to Date, Month to Date, Week to Date) that filter rows where the day-within-period is <= today's equivalent day-within-period, across all periods in the data.

**Architecture:** New `FilterOperator` enum values flow through the existing filter pipeline: enum definition -> operator label mapping -> filter type options -> SQL generation -> frontend rendering. These operators take no user input — they always compare against today.

**Tech Stack:** TypeScript, moment.js (backend date math), Mantine v8 (frontend UI), Jest (tests)

---

### Task 1: Add FilterOperator enum values and operator labels

**Files:**
- Modify: `packages/common/src/types/filter.ts:11-31`
- Modify: `packages/frontend/src/components/common/Filters/FilterInputs/constants.ts:1-23`

- [ ] **Step 1: Add four new enum values to FilterOperator**

In `packages/common/src/types/filter.ts`, add four new values at the end of the enum, before the closing brace:

```typescript
export enum FilterOperator {
    NULL = 'isNull',
    NOT_NULL = 'notNull',
    EQUALS = 'equals',
    NOT_EQUALS = 'notEquals',
    STARTS_WITH = 'startsWith',
    ENDS_WITH = 'endsWith',
    INCLUDE = 'include',
    NOT_INCLUDE = 'doesNotInclude',
    LESS_THAN = 'lessThan',
    LESS_THAN_OR_EQUAL = 'lessThanOrEqual',
    GREATER_THAN = 'greaterThan',
    GREATER_THAN_OR_EQUAL = 'greaterThanOrEqual',
    IN_THE_PAST = 'inThePast',
    NOT_IN_THE_PAST = 'notInThePast',
    IN_THE_NEXT = 'inTheNext',
    IN_THE_CURRENT = 'inTheCurrent',
    NOT_IN_THE_CURRENT = 'notInTheCurrent',
    IN_BETWEEN = 'inBetween',
    NOT_IN_BETWEEN = 'notInBetween',
    YEAR_TO_DATE = 'yearToDate',
    QUARTER_TO_DATE = 'quarterToDate',
    MONTH_TO_DATE = 'monthToDate',
    WEEK_TO_DATE = 'weekToDate',
}
```

- [ ] **Step 2: Add operator labels**

In `packages/frontend/src/components/common/Filters/FilterInputs/constants.ts`, add four new entries:

```typescript
export const filterOperatorLabel: Record<FilterOperator, string> = {
    // ... existing entries ...
    [FilterOperator.IN_BETWEEN]: 'is between',
    [FilterOperator.NOT_IN_BETWEEN]: 'is not between',
    [FilterOperator.YEAR_TO_DATE]: 'year to date',
    [FilterOperator.QUARTER_TO_DATE]: 'quarter to date',
    [FilterOperator.MONTH_TO_DATE]: 'month to date',
    [FilterOperator.WEEK_TO_DATE]: 'week to date',
};
```

- [ ] **Step 3: Typecheck common package to find all exhaustive switch statements that need updating**

Run: `pnpm -F common typecheck 2>&1 | head -80`

This will surface all `assertUnreachable` and exhaustive `Record<FilterOperator, ...>` compilation errors. Note the file paths and line numbers — these are all the places that need updating in subsequent tasks.

- [ ] **Step 4: Typecheck frontend package**

Run: `pnpm -F frontend typecheck 2>&1 | head -80`

Same as above for the frontend.

- [ ] **Step 5: Commit**

```bash
git add packages/common/src/types/filter.ts packages/frontend/src/components/common/Filters/FilterInputs/constants.ts
git commit -m "feat: add Year/Quarter/Month/Week to Date filter operator enum values and labels"
```

---

### Task 2: Fix all exhaustive switch/record compilation errors in common package

After adding the new enum values, several files with exhaustive switches or `Record<FilterOperator, ...>` types will fail to compile. This task fixes them all.

**Files:**
- Modify: `packages/common/src/compiler/filtersCompiler.mock.ts:36-59` — add null entries for new operators in `ExpectedNumberFilterSQL`
- Modify: `packages/common/src/types/filterGrammarConversion.ts:84-91` — add new operators to the `NotImplementedError` group
- Modify: `packages/common/src/utils/conditionalFormatting.ts` — add new operators to appropriate cases

- [ ] **Step 1: Add null entries to ExpectedNumberFilterSQL mock**

In `packages/common/src/compiler/filtersCompiler.mock.ts`, find the `ExpectedNumberFilterSQL` record and add:

```typescript
    [FilterOperator.NOT_IN_BETWEEN]:
        '(customers.age) < (1) OR (customers.age) > (2)',
    [FilterOperator.YEAR_TO_DATE]: null,
    [FilterOperator.QUARTER_TO_DATE]: null,
    [FilterOperator.MONTH_TO_DATE]: null,
    [FilterOperator.WEEK_TO_DATE]: null,
};
```

- [ ] **Step 2: Add new operators to filterGrammarConversion.ts**

In `packages/common/src/types/filterGrammarConversion.ts`, add the new operators alongside the existing `NotImplementedError` group (around line 84-91):

```typescript
        case FilterOperator.IN_THE_CURRENT:
        case FilterOperator.IN_BETWEEN:
        case FilterOperator.NOT_IN_THE_PAST:
        case FilterOperator.NOT_IN_THE_CURRENT:
        case FilterOperator.NOT_IN_BETWEEN:
        case FilterOperator.YEAR_TO_DATE:
        case FilterOperator.QUARTER_TO_DATE:
        case FilterOperator.MONTH_TO_DATE:
        case FilterOperator.WEEK_TO_DATE:
            throw new NotImplementedError(
                `No function implemented to convert custom metric filter to dbt: ${operator}`,
            );
```

- [ ] **Step 3: Add new operators to conditionalFormatting.ts**

In `packages/common/src/utils/conditionalFormatting.ts`, find the switch statement that handles `FilterOperator` values. Add the four new operators alongside other unsupported operators (they don't apply to conditional formatting). Look for the `NOT_IN_BETWEEN` case and add after it:

```typescript
                case FilterOperator.YEAR_TO_DATE:
                case FilterOperator.QUARTER_TO_DATE:
                case FilterOperator.MONTH_TO_DATE:
                case FilterOperator.WEEK_TO_DATE:
```

These should fall through to the same error/false return as the other unsupported operators in that context.

- [ ] **Step 4: Fix any other common package compilation errors**

Run: `pnpm -F common typecheck 2>&1 | head -80`

If there are remaining errors, fix them by adding the new operators to the appropriate case groups (typically alongside `NOT_IN_BETWEEN` or other unsupported operators). The pattern is consistent: for non-date contexts, these operators should throw `NotImplementedError` or return a sensible default.

- [ ] **Step 5: Commit**

```bash
git add packages/common/
git commit -m "fix: handle new to-date filter operators in all exhaustive switches (common)"
```

---

### Task 3: Fix all exhaustive switch/record compilation errors in frontend package

**Files:**
- Modify: `packages/frontend/src/components/common/Filters/utils/getPlaceholderByFilterTypeAndOperator.ts`
- Modify: `packages/frontend/src/components/common/Filters/FilterInputs/utils.ts`
- Modify: `packages/frontend/src/features/dashboardFilters/FilterConfiguration/utils/index.ts`

- [ ] **Step 1: Add to-date operators to placeholder function**

In `packages/frontend/src/components/common/Filters/utils/getPlaceholderByFilterTypeAndOperator.ts`:

For the `FilterType.DATE` switch (around line 90), add after the `NOT_NULL` case:

```typescript
                case FilterOperator.YEAR_TO_DATE:
                case FilterOperator.QUARTER_TO_DATE:
                case FilterOperator.MONTH_TO_DATE:
                case FilterOperator.WEEK_TO_DATE:
                    return '';
```

For the `FilterType.NUMBER` switch, add the four new operators alongside `IN_THE_CURRENT`/`NOT_IN_THE_CURRENT` in the console.warn group.

For the `FilterType.STRING` switch, add them alongside the `NotImplementedError` group.

For the `FilterType.BOOLEAN` switch, add them alongside the `NotImplementedError` group.

- [ ] **Step 2: Add to-date operators to getValueAsString in utils.ts**

In `packages/frontend/src/components/common/Filters/FilterInputs/utils.ts`, find the `FilterType.DATE` switch in `getValueAsString` (around line 129). Add after the `NOT_IN_THE_CURRENT` case:

```typescript
                case FilterOperator.YEAR_TO_DATE:
                    return 'year to date';
                case FilterOperator.QUARTER_TO_DATE:
                    return 'quarter to date';
                case FilterOperator.MONTH_TO_DATE:
                    return 'month to date';
                case FilterOperator.WEEK_TO_DATE:
                    return 'week to date';
```

- [ ] **Step 3: Add to-date operators to hasFilterValueSet in dashboard filter utils**

In `packages/frontend/src/features/dashboardFilters/FilterConfiguration/utils/index.ts`, find the `hasFilterValueSet` function (around line 170). Add the to-date operators alongside `NULL`/`NOT_NULL` since they also require no values:

```typescript
        case FilterOperator.NULL:
        case FilterOperator.NOT_NULL:
        case FilterOperator.YEAR_TO_DATE:
        case FilterOperator.QUARTER_TO_DATE:
        case FilterOperator.MONTH_TO_DATE:
        case FilterOperator.WEEK_TO_DATE:
            return true;
```

- [ ] **Step 4: Fix any other frontend compilation errors**

Run: `pnpm -F frontend typecheck 2>&1 | head -80`

Fix remaining errors by adding the new operators to the appropriate switch cases.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/
git commit -m "fix: handle new to-date filter operators in all exhaustive switches (frontend)"
```

---

### Task 4: Add to-date operators to date filter options and default value handling

**Files:**
- Modify: `packages/frontend/src/components/common/Filters/FilterInputs/utils.ts:40-60`
- Modify: `packages/common/src/utils/filters.ts:206-208`
- Modify: `packages/common/src/utils/filters.ts:218-328`

- [ ] **Step 1: Add to-date operators to timeFilterOptions**

In `packages/frontend/src/components/common/Filters/FilterInputs/utils.ts`, find the `timeFilterOptions` array (line 40). Add the four new operators:

```typescript
const timeFilterOptions: Array<{
    value: FilterOperator;
    label: string;
}> = [
    ...getFilterOptions([
        FilterOperator.NULL,
        FilterOperator.NOT_NULL,
        FilterOperator.EQUALS,
        FilterOperator.NOT_EQUALS,
        FilterOperator.IN_THE_PAST,
        FilterOperator.NOT_IN_THE_PAST,
        FilterOperator.IN_THE_NEXT,
        FilterOperator.IN_THE_CURRENT,
        FilterOperator.NOT_IN_THE_CURRENT,
        FilterOperator.YEAR_TO_DATE,
        FilterOperator.QUARTER_TO_DATE,
        FilterOperator.MONTH_TO_DATE,
        FilterOperator.WEEK_TO_DATE,
    ]),
    { value: FilterOperator.LESS_THAN, label: 'is before' },
    { value: FilterOperator.LESS_THAN_OR_EQUAL, label: 'is on or before' },
    { value: FilterOperator.GREATER_THAN, label: 'is after' },
    { value: FilterOperator.GREATER_THAN_OR_EQUAL, label: 'is on or after' },
    { value: FilterOperator.IN_BETWEEN, label: 'is between' },
];
```

- [ ] **Step 2: Update isWithValueFilter to exclude to-date operators**

In `packages/common/src/utils/filters.ts`, update the `isWithValueFilter` function (line 206) to also exclude to-date operators:

```typescript
export const isWithValueFilter = (filterOperator: FilterOperator) =>
    filterOperator !== FilterOperator.NULL &&
    filterOperator !== FilterOperator.NOT_NULL &&
    filterOperator !== FilterOperator.YEAR_TO_DATE &&
    filterOperator !== FilterOperator.QUARTER_TO_DATE &&
    filterOperator !== FilterOperator.MONTH_TO_DATE &&
    filterOperator !== FilterOperator.WEEK_TO_DATE;
```

- [ ] **Step 3: Update getFilterRuleWithDefaultValue for to-date operators**

In `packages/common/src/utils/filters.ts`, find the `getFilterRuleWithDefaultValue` function (line 210). The condition at line 219 checks if the operator requires values. Add the to-date operators to the exclusion list:

```typescript
    if (
        ![
            FilterOperator.NULL,
            FilterOperator.NOT_NULL,
            FilterOperator.YEAR_TO_DATE,
            FilterOperator.QUARTER_TO_DATE,
            FilterOperator.MONTH_TO_DATE,
            FilterOperator.WEEK_TO_DATE,
        ].includes(filterRule.operator) &&
        values !== null
    ) {
```

- [ ] **Step 4: Typecheck both packages**

Run: `pnpm -F common typecheck && pnpm -F frontend typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/common/src/utils/filters.ts packages/frontend/src/components/common/Filters/FilterInputs/utils.ts
git commit -m "feat: add to-date operators to date filter options and handle valueless defaults"
```

---

### Task 5: Implement SQL generation for to-date operators (with warehouse-specific handling)

**Files:**
- Modify: `packages/common/src/compiler/filtersCompiler.ts:258-469`
- Modify: `packages/common/src/compiler/filtersCompiler.test.ts`
- Modify: `packages/common/src/compiler/filtersCompiler.mock.ts`

- [ ] **Step 1: Add test mock filter bases**

In `packages/common/src/compiler/filtersCompiler.mock.ts`, add at the end of the file:

```typescript
export const YearToDateFilterBase = {
    id: 'id',
    target: {
        fieldId: 'fieldId',
    },
    operator: FilterOperator.YEAR_TO_DATE,
};

export const QuarterToDateFilterBase = {
    id: 'id',
    target: {
        fieldId: 'fieldId',
    },
    operator: FilterOperator.QUARTER_TO_DATE,
};

export const MonthToDateFilterBase = {
    id: 'id',
    target: {
        fieldId: 'fieldId',
    },
    operator: FilterOperator.MONTH_TO_DATE,
};

export const WeekToDateFilterBase = {
    id: 'id',
    target: {
        fieldId: 'fieldId',
    },
    operator: FilterOperator.WEEK_TO_DATE,
};
```

- [ ] **Step 2: Write the failing tests**

In `packages/common/src/compiler/filtersCompiler.test.ts`, import the new mocks and add tests inside the `'Filter SQL'` describe block. The system time is set to `'04 Apr 2020 06:12:30 GMT'`:

- Day of year for April 4 = 95 (31 Jan + 29 Feb (leap year 2020) + 31 Mar + 4 Apr)
- Day of month for April 4 = 4
- April 4 2020 is Saturday. With Monday start: dayInWeek = 6
- Quarter starts April 1, so dayInQuarter = 3 (Apr1=day0, Apr4=day3)

```typescript
    test('should return year to date filter sql', () => {
        const result = renderDateFilterSql(
            DimensionSqlMock,
            YearToDateFilterBase,
            adapterType.default,
            'UTC',
            formatTimestamp,
        );
        expect(result).toStrictEqual(
            `(EXTRACT(DOY FROM ${DimensionSqlMock}) <= 95)`,
        );
    });

    test('should return month to date filter sql', () => {
        const result = renderDateFilterSql(
            DimensionSqlMock,
            MonthToDateFilterBase,
            adapterType.default,
            'UTC',
            formatTimestamp,
        );
        expect(result).toStrictEqual(
            `(EXTRACT(DAY FROM ${DimensionSqlMock}) <= 4)`,
        );
    });

    test('should return quarter to date filter sql', () => {
        const result = renderDateFilterSql(
            DimensionSqlMock,
            QuarterToDateFilterBase,
            adapterType.default,
            'UTC',
            formatTimestamp,
        );
        expect(result).toStrictEqual(
            `(EXTRACT(DAY FROM ${DimensionSqlMock} - DATE_TRUNC('QUARTER', ${DimensionSqlMock})) <= 3)`,
        );
    });

    test('should return week to date filter sql (monday start)', () => {
        const result = renderDateFilterSql(
            DimensionSqlMock,
            WeekToDateFilterBase,
            adapterType.default,
            'UTC',
            formatTimestamp,
        );
        expect(result).toStrictEqual(
            `(EXTRACT(DAY FROM ${DimensionSqlMock} - DATE_TRUNC('WEEK', ${DimensionSqlMock})) <= 5)`,
        );
    });

    test('should return year to date filter sql for bigquery', () => {
        const result = renderDateFilterSql(
            DimensionSqlMock,
            YearToDateFilterBase,
            SupportedDbtAdapter.BIGQUERY,
            'UTC',
            formatTimestamp,
        );
        expect(result).toStrictEqual(
            `(EXTRACT(DAYOFYEAR FROM ${DimensionSqlMock}) <= 95)`,
        );
    });

    test('should return quarter to date filter sql for trino', () => {
        const result = renderDateFilterSql(
            DimensionSqlMock,
            QuarterToDateFilterBase,
            adapterType.trino,
            'UTC',
            formatTimestamp,
        );
        expect(result).toStrictEqual(
            `(DATE_DIFF('day', DATE_TRUNC('quarter', ${DimensionSqlMock}), ${DimensionSqlMock}) <= 3)`,
        );
    });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm -F common test -- --testPathPattern filtersCompiler.test 2>&1 | tail -30`

Expected: FAIL — the new operator cases are not yet handled in `renderDateFilterSql`.

- [ ] **Step 4: Implement warehouse-specific SQL generation in renderDateFilterSql**

In `packages/common/src/compiler/filtersCompiler.ts`, add the four new cases before the `default:` case in the `renderDateFilterSql` function (around line 466). Import `SupportedDbtAdapter` if not already imported (it is already imported at line 2).

```typescript
        case FilterOperator.YEAR_TO_DATE: {
            const today = getMomentDateWithCustomStartOfWeek(effectiveStartOfWeek)
                .tz(timezone);
            const dayOfYear = today.dayOfYear(); // 1-366
            switch (adapterType) {
                case SupportedDbtAdapter.BIGQUERY:
                    return `(EXTRACT(DAYOFYEAR FROM ${dimensionSql}) <= ${dayOfYear})`;
                case SupportedDbtAdapter.CLICKHOUSE:
                    return `(toDayOfYear(${dimensionSql}) <= ${dayOfYear})`;
                default:
                    // PostgreSQL, Snowflake, Redshift, DuckDB, Trino, Athena, Databricks
                    return `(EXTRACT(DOY FROM ${dimensionSql}) <= ${dayOfYear})`;
            }
        }
        case FilterOperator.MONTH_TO_DATE: {
            const today = getMomentDateWithCustomStartOfWeek(effectiveStartOfWeek)
                .tz(timezone);
            const dayOfMonth = today.date(); // 1-31
            switch (adapterType) {
                case SupportedDbtAdapter.CLICKHOUSE:
                    return `(toDayOfMonth(${dimensionSql}) <= ${dayOfMonth})`;
                default:
                    // EXTRACT(DAY FROM ...) works for PG, Snowflake, Redshift, DuckDB, BigQuery, Trino, Databricks
                    return `(EXTRACT(DAY FROM ${dimensionSql}) <= ${dayOfMonth})`;
            }
        }
        case FilterOperator.QUARTER_TO_DATE: {
            const today = getMomentDateWithCustomStartOfWeek(effectiveStartOfWeek)
                .tz(timezone);
            const quarterStart = today.clone().startOf('quarter');
            const dayInQuarter = today.diff(quarterStart, 'days'); // 0-indexed
            switch (adapterType) {
                case SupportedDbtAdapter.BIGQUERY:
                    return `(DATE_DIFF(${dimensionSql}, DATE_TRUNC(${dimensionSql}, QUARTER), DAY) <= ${dayInQuarter})`;
                case SupportedDbtAdapter.CLICKHOUSE:
                    return `(dateDiff('day', toStartOfQuarter(${dimensionSql}), ${dimensionSql}) <= ${dayInQuarter})`;
                case SupportedDbtAdapter.TRINO:
                case SupportedDbtAdapter.ATHENA:
                    return `(DATE_DIFF('day', DATE_TRUNC('quarter', ${dimensionSql}), ${dimensionSql}) <= ${dayInQuarter})`;
                default:
                    // PostgreSQL, Snowflake, Redshift, DuckDB, Databricks
                    // EXTRACT(DAY FROM interval) extracts the day count from a timestamp subtraction
                    return `(EXTRACT(DAY FROM ${dimensionSql} - DATE_TRUNC('QUARTER', ${dimensionSql})) <= ${dayInQuarter})`;
            }
        }
        case FilterOperator.WEEK_TO_DATE: {
            const today = getMomentDateWithCustomStartOfWeek(effectiveStartOfWeek)
                .tz(timezone);
            const weekStart = today.clone().startOf('week');
            const dayInWeek = today.diff(weekStart, 'days'); // 0-indexed from week start
            switch (adapterType) {
                case SupportedDbtAdapter.BIGQUERY:
                    return `(DATE_DIFF(${dimensionSql}, DATE_TRUNC(${dimensionSql}, WEEK(${effectiveStartOfWeek === WeekDay.SUNDAY ? 'SUNDAY' : 'MONDAY'})), DAY) <= ${dayInWeek})`;
                case SupportedDbtAdapter.CLICKHOUSE:
                    return `(dateDiff('day', toStartOfWeek(${dimensionSql}, ${effectiveStartOfWeek === WeekDay.SUNDAY ? '0' : '1'}), ${dimensionSql}) <= ${dayInWeek})`;
                case SupportedDbtAdapter.TRINO:
                case SupportedDbtAdapter.ATHENA:
                    return `(DATE_DIFF('day', DATE_TRUNC('week', ${dimensionSql}), ${dimensionSql}) <= ${dayInWeek})`;
                default:
                    // PostgreSQL, Snowflake, Redshift, DuckDB, Databricks
                    return `(EXTRACT(DAY FROM ${dimensionSql} - DATE_TRUNC('WEEK', ${dimensionSql})) <= ${dayInWeek})`;
            }
        }
```

**Note on PostgreSQL interval arithmetic:** `timestamp - timestamp` returns an `interval` in PostgreSQL, not an integer. The quarter-to-date and week-to-date default cases must wrap the subtraction in `EXTRACT(DAY FROM ...)` to get an integer day count. BigQuery, ClickHouse, and Trino/Athena use `DATE_DIFF` functions that return integers directly.

**Note on DOW semantics:** Rather than using `EXTRACT(DOW ...)` (which varies across warehouses), the week-to-date implementation uses `DATE_TRUNC('WEEK', dim)` subtracted from the dimension, giving a consistent day-in-week calculation that respects the warehouse's configured week start.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm -F common test -- --testPathPattern filtersCompiler.test 2>&1 | tail -30`

Expected: PASS for all tests. Some existing tests that iterate over all `FilterOperator` values (like the number filter test at line 101) may need the new operators added to their expected-throw list.

- [ ] **Step 6: Run typecheck**

Run: `pnpm -F common typecheck`

- [ ] **Step 7: Commit**

```bash
git add packages/common/src/compiler/
git commit -m "feat: implement warehouse-specific SQL generation for to-date filter operators"
```

---

### Task 6: Frontend — render no inputs for to-date operators

**Files:**
- Modify: `packages/frontend/src/components/common/Filters/FilterInputs/DateFilterInputs.tsx:344-417`
- Modify: `packages/frontend/src/components/common/Filters/FilterInputs/DefaultFilterInputs.tsx`

- [ ] **Step 1: Add to-date case to DateFilterInputs switch**

In `packages/frontend/src/components/common/Filters/FilterInputs/DateFilterInputs.tsx`, find the switch on `rule.operator`. Add before the `default` case:

```typescript
        case FilterOperator.YEAR_TO_DATE:
        case FilterOperator.QUARTER_TO_DATE:
        case FilterOperator.MONTH_TO_DATE:
        case FilterOperator.WEEK_TO_DATE:
            return null;
```

- [ ] **Step 2: Add to-date case to DefaultFilterInputs switch**

In `DefaultFilterInputs.tsx`, add the same four cases returning `null` before the `default` case to satisfy the exhaustive switch.

- [ ] **Step 3: Typecheck and commit**

---

### Task 7: Restrict to-date operators to day-level and timestamp fields

**Files:**
- Modify: `packages/frontend/src/components/common/Filters/FilterInputs/utils.ts`
- Modify: `packages/frontend/src/components/common/Filters/FilterRuleForm.tsx`
- Modify: `packages/frontend/src/features/dashboardFilters/FilterConfiguration/FilterSettings.tsx`
- Modify: `packages/frontend/src/features/scheduler/components/SchedulerForm/SchedulerFormFiltersTab.tsx`

To-date operators are meaningless on coarse date dimensions (e.g. `DATE_TRUNC(date, YEAR)` always returns Jan 1, so day-of-year is always 1).

- [ ] **Step 1: Add `supportsToDateOperators` helper**

In `utils.ts`, add a helper that checks if a field's `timeInterval` is coarse (YEAR, QUARTER, MONTH, WEEK). If so, to-date operators should be excluded.

- [ ] **Step 2: Extend `getFilterOperatorOptions` with optional `field` parameter**

When `filterType` is DATE and the field has a coarse timeInterval, filter out to-date operators from the returned options.

- [ ] **Step 3: Pass field to callers**

Update `FilterRuleForm.tsx` (pass `activeField`), `FilterSettings.tsx` (pass `field`), and `SchedulerFormFiltersTab.tsx` (pass `field`) to use the new parameter.

---

### Task 8: Regenerate TSOA API routes

**Files:**
- Regenerated: `packages/backend/src/generated/routes.ts`

The TSOA auto-generated routes file validates filter operators against the `FilterOperator` enum. Without regeneration, the backend rejects new operators with "Validation error: Invalid field body".

- [ ] **Step 1: Regenerate**

Run: `pnpm generate-api`

- [ ] **Step 2: Verify new operators are present**

Check that `yearToDate`, `quarterToDate`, `monthToDate`, `weekToDate` appear in `packages/backend/src/generated/routes.ts`.

---

### Task 9: Run full test suite and lint

**Files:** None (verification only)

- [ ] **Step 1: Run common tests**

Run: `pnpm -F common test 2>&1 | tail -30`

Expected: All tests pass.

- [ ] **Step 2: Run backend tests for modified files**

Run: `pnpm -F backend test:dev:nowatch 2>&1 | tail -30`

Expected: All tests pass.

- [ ] **Step 3: Lint common and frontend**

Run: `pnpm -F common lint && pnpm -F frontend lint`

Expected: No lint errors.

- [ ] **Step 4: Typecheck all packages**

Run: `pnpm -F common typecheck && pnpm -F backend typecheck && pnpm -F frontend typecheck`

Expected: No type errors.

- [ ] **Step 5: Fix any remaining issues and commit**

If any tests, lint, or typecheck failures were found, fix them and commit:

```bash
git commit -m "fix: resolve test/lint/typecheck issues for to-date filter operators"
```
