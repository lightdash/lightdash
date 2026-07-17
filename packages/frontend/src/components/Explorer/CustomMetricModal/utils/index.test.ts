import {
    Compact,
    CustomFormatType,
    DimensionType,
    FieldType,
    FilterOperator,
    MetricType,
    NumberSeparator,
    TimeFrames,
    type Metric,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getFilterRulesFromMetricBaseFilters,
    getFormatFromBaseMetric,
    prepareCustomMetricData,
} from '.';

const baseMetric: Metric = {
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'total_revenue',
    label: 'Total revenue',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.revenue',
    hidden: false,
    filters: [
        {
            id: 'yaml-filter-id',
            target: { fieldRef: 'status' },
            operator: FilterOperator.EQUALS,
            values: ['completed'],
        },
        {
            id: 'yaml-filter-id-2',
            target: { fieldRef: 'customers.country' },
            operator: FilterOperator.EQUALS,
            values: ['GB'],
        },
    ],
};

describe('getFilterRulesFromMetricBaseFilters', () => {
    it('qualifies bare fieldRefs with the metric table and derives fieldIds', () => {
        const rules = getFilterRulesFromMetricBaseFilters(baseMetric);

        expect(rules).toHaveLength(2);
        expect(rules[0].target).toEqual({
            fieldRef: 'orders.status',
            fieldId: 'orders_status',
        });
        expect(rules[1].target).toEqual({
            fieldRef: 'customers.country',
            fieldId: 'customers_country',
        });
    });

    it('assigns fresh rule ids so clones do not share ids with the base metric', () => {
        const rules = getFilterRulesFromMetricBaseFilters(baseMetric);

        expect(rules[0].id).not.toBe('yaml-filter-id');
        expect(rules[1].id).not.toBe('yaml-filter-id-2');
    });

    it('returns an empty list for metrics without filters', () => {
        expect(
            getFilterRulesFromMetricBaseFilters({
                ...baseMetric,
                filters: undefined,
            }),
        ).toEqual([]);
    });
});

describe('getFormatFromBaseMetric', () => {
    it('converts a compact-only legacy format', () => {
        expect(
            getFormatFromBaseMetric({
                ...baseMetric,
                compact: Compact.THOUSANDS,
            }),
        ).toEqual({
            type: CustomFormatType.NUMBER,
            compact: Compact.THOUSANDS,
            round: undefined,
        });
    });

    it('carries the field-level separator alongside a legacy format', () => {
        expect(
            getFormatFromBaseMetric({
                ...baseMetric,
                format: 'usd',
                round: 2,
                separator: NumberSeparator.COMMA_PERIOD,
            }),
        ).toEqual({
            type: CustomFormatType.CURRENCY,
            currency: 'USD',
            round: 2,
            compact: undefined,
            separator: NumberSeparator.COMMA_PERIOD,
        });
    });

    it('carries the field-level separator alongside structured formatOptions', () => {
        expect(
            getFormatFromBaseMetric({
                ...baseMetric,
                formatOptions: { type: CustomFormatType.NUMBER, round: 1 },
                separator: NumberSeparator.PERIOD_COMMA,
            }),
        ).toEqual({
            type: CustomFormatType.NUMBER,
            round: 1,
            separator: NumberSeparator.PERIOD_COMMA,
        });
    });

    it('converts a separator-only metric', () => {
        expect(
            getFormatFromBaseMetric({
                ...baseMetric,
                separator: NumberSeparator.SPACE_PERIOD,
            }),
        ).toEqual({
            type: CustomFormatType.NUMBER,
            round: undefined,
            compact: undefined,
            separator: NumberSeparator.SPACE_PERIOD,
        });
    });

    it('returns undefined when the base metric has no formatting', () => {
        expect(getFormatFromBaseMetric(baseMetric)).toBeUndefined();
    });
});

describe('prepareCustomMetricData from an explore metric', () => {
    it('clones sql and type and derives the name from the base metric name', () => {
        const data = prepareCustomMetricData({
            item: baseMetric,
            type: baseMetric.type,
            customMetricLabel: 'Copy of Total revenue',
            customMetricFiltersWithIds:
                getFilterRulesFromMetricBaseFilters(baseMetric),
            isEditingCustomMetric: false,
        });

        expect(data).toEqual(
            expect.objectContaining({
                table: 'orders',
                sql: '${TABLE}.revenue',
                type: MetricType.SUM,
                label: 'Copy of Total revenue',
                name: 'total_revenue_copy_of_total_revenue',
                description: expect.stringContaining('Sum of Total revenue'),
            }),
        );
        expect(data.filters).toHaveLength(2);
        expect(data.filters?.[0].target).toEqual({
            fieldRef: 'orders.status',
        });
    });

    it('keeps date formatting when cloning a MIN-of-timestamp metric', () => {
        const data = prepareCustomMetricData({
            item: {
                ...baseMetric,
                name: 'date_of_first_order',
                label: 'Date of first order',
                type: MetricType.MIN,
                sql: '${TABLE}.created',
                filters: undefined,
                baseDimensionType: DimensionType.TIMESTAMP,
                baseDimensionTimeInterval: TimeFrames.DAY,
            },
            type: MetricType.MIN,
            customMetricLabel: 'Copy of Date of first order',
            customMetricFiltersWithIds: [],
            isEditingCustomMetric: false,
        });

        expect(data.formatOptions).toEqual({
            type: CustomFormatType.TIMESTAMP,
            timeInterval: TimeFrames.DAY,
        });
    });

    it('keeps the name derived from baseMetricName when editing a clone', () => {
        const data = prepareCustomMetricData({
            item: {
                table: 'orders',
                name: 'total_revenue_copy_of_total_revenue',
                label: 'Copy of Total revenue',
                type: MetricType.SUM,
                sql: '${TABLE}.revenue',
                baseMetricName: 'total_revenue',
            },
            type: MetricType.SUM,
            customMetricLabel: 'Revenue Gb',
            customMetricFiltersWithIds: [],
            isEditingCustomMetric: true,
        });

        expect(data.name).toBe('total_revenue_revenue_gb');
    });
});
