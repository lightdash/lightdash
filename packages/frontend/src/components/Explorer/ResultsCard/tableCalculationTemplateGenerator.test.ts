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
    // Regression guard for LIGHTDASH-FRONTEND-1FS: the old getSqlForQuickCalculation
    // would crash with TypeError reading 'value' on undefined items. The function was
    // replaced by this template-based approach which never accesses raw result values.
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
