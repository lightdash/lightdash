import {
    FieldType,
    MetricType,
    NotImplementedError,
    TableCalculationTemplateType,
    type Metric,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { generateTableCalculationTemplate } from './tableCalculationTemplateGenerator';

const mockMetric: Metric = {
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'total_revenue',
    label: 'Total Revenue',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${orders.revenue}',
    hidden: false,
};

describe('generateTableCalculationTemplate', () => {
    // Regression guard for LIGHTDASH-FRONTEND-1FS (Sentry LIGHTDASH-FRONTEND-1FS).
    //
    // The original crash site was `getSqlForQuickCalculation` in QuickCalculations.tsx,
    // which had this signature (deleted in commit 095bd7a600, PR #17099, Oct 3 2025):
    //
    //   const getSqlForQuickCalculation = (
    //       quickCalculation: QuickCalculation,
    //       fieldReference: string,
    //       sorts: SortField[],
    //       warehouseType: WarehouseTypes | undefined,  // ← could be undefined
    //   ) => { ... getFieldQuoteChar(warehouseType) ... }
    //
    // When `project?.warehouseConnection?.type` was undefined (project not yet loaded),
    // `getFieldQuoteChar(undefined)` accessed `.value` on an undefined lookup result,
    // producing: TypeError: Cannot read properties of undefined (reading 'value')
    //
    // The fix replaced the function with `generateTableCalculationTemplate`, which
    // produces a declarative template object instead of raw SQL. The backend compiles
    // the template to SQL at query time and never reads raw result `.value` properties
    // in the frontend render path.
    //
    // The second Sentry frame (Table.styles.ts:333) was a source-map artifact: the
    // `.ts` file was 322 lines when deleted in PR #18365 (dark mode), line 333 was
    // past EOF, and the file never contained .value access. The Array.map/forEach
    // frames in the stack trace are styled-components CSS template evaluation internals.
    //
    // Runtime verification (2026-04-15): POST /api/v1/saved/{uuid}/version with a
    // percent_change_from_previous template returned HTTP 200 and persisted the template
    // object, with no TypeErrors in the backend log.
    // Log: https://storage.googleapis.com/jarvis-hackathon-assets/repro-fix/quick-calc-undefined-value/after-logs.txt
    it('returns PERCENT_CHANGE_FROM_PREVIOUS template without accessing result values', () => {
        const result = generateTableCalculationTemplate(
            {
                type: TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS,
                field: mockMetric,
                name: 'percent_change',
                displayName: 'Percent Change from Previous',
            },
            [],
        );
        expect(result).toEqual({
            type: TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS,
            fieldId: 'orders_total_revenue',
            orderBy: [],
            partitionBy: [],
        });
    });

    it('returns PERCENT_OF_PREVIOUS_VALUE template', () => {
        const result = generateTableCalculationTemplate(
            {
                type: TableCalculationTemplateType.PERCENT_OF_PREVIOUS_VALUE,
                field: mockMetric,
                name: 'percent_prev',
                displayName: 'Percent of Previous Value',
            },
            [],
        );
        expect(result).toEqual({
            type: TableCalculationTemplateType.PERCENT_OF_PREVIOUS_VALUE,
            fieldId: 'orders_total_revenue',
            orderBy: [],
            partitionBy: [],
        });
    });

    it('returns RUNNING_TOTAL template', () => {
        const result = generateTableCalculationTemplate(
            {
                type: TableCalculationTemplateType.RUNNING_TOTAL,
                field: mockMetric,
                name: 'running_total',
                displayName: 'Running Total',
            },
            [],
        );
        expect(result).toEqual({
            type: TableCalculationTemplateType.RUNNING_TOTAL,
            fieldId: 'orders_total_revenue',
        });
    });

    it('returns PERCENT_OF_COLUMN_TOTAL template', () => {
        const result = generateTableCalculationTemplate(
            {
                type: TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL,
                field: mockMetric,
                name: 'pct_total',
                displayName: 'Percent of Column Total',
            },
            [],
        );
        expect(result).toEqual({
            type: TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL,
            fieldId: 'orders_total_revenue',
            partitionBy: [],
        });
    });

    it('returns RANK_IN_COLUMN template', () => {
        const result = generateTableCalculationTemplate(
            {
                type: TableCalculationTemplateType.RANK_IN_COLUMN,
                field: mockMetric,
                name: 'rank',
                displayName: 'Rank in Column',
            },
            [],
        );
        expect(result).toEqual({
            type: TableCalculationTemplateType.RANK_IN_COLUMN,
            fieldId: 'orders_total_revenue',
        });
    });

    it('throws NotImplementedError for WINDOW_FUNCTION', () => {
        expect(() =>
            generateTableCalculationTemplate(
                {
                    type: TableCalculationTemplateType.WINDOW_FUNCTION,
                    field: mockMetric,
                    name: 'window',
                    displayName: 'Window Function',
                },
                [],
            ),
        ).toThrow(NotImplementedError);
    });

    it('passes sorts through to orderBy in templates that support it', () => {
        const result = generateTableCalculationTemplate(
            {
                type: TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS,
                field: mockMetric,
                name: 'percent_change',
                displayName: 'Percent Change',
            },
            [{ fieldId: 'orders_date', descending: false }],
        );
        expect(result).toMatchObject({
            orderBy: [{ fieldId: 'orders_date', order: 'desc' }],
        });
    });
});
