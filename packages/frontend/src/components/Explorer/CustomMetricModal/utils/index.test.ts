import {
    Compact,
    CustomFormatType,
    DimensionType,
    FieldType,
    FilterOperator,
    MetricType,
    NumberSeparator,
    TimeFrames,
    formatItemValue,
    type Dimension,
    type Metric,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildNewAdditionalMetric,
    getFilterRulesFromMetricBaseFilters,
    getFormatFromBaseField,
    getInheritedCustomMetricFormat,
    prepareCustomMetricData,
} from '.';

const usdDimension: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.NUMBER,
    name: 'amount',
    label: 'Amount',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.amount',
    hidden: false,
    format: 'usd',
    round: 2,
};

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

describe('getFormatFromBaseField', () => {
    it('keeps a format expression as a custom format', () => {
        expect(
            getFormatFromBaseField({ ...baseMetric, format: '#,##0.0' }),
        ).toEqual({ type: CustomFormatType.CUSTOM, custom: '#,##0.0' });
    });

    it('converts a compact-only legacy format', () => {
        expect(
            getFormatFromBaseField({
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
            getFormatFromBaseField({
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
            getFormatFromBaseField({
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
            getFormatFromBaseField({
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
        expect(getFormatFromBaseField(baseMetric)).toBeUndefined();
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

describe('getInheritedCustomMetricFormat', () => {
    it('carries a numeric dimension format into value-preserving aggregations', () => {
        [
            MetricType.SUM,
            MetricType.AVERAGE,
            MetricType.MIN,
            MetricType.MAX,
            MetricType.MEDIAN,
            MetricType.PERCENTILE,
        ].forEach((type) => {
            expect(getInheritedCustomMetricFormat(usdDimension, type)).toEqual({
                type: CustomFormatType.CURRENCY,
                currency: 'USD',
                round: 2,
                compact: undefined,
            });
        });
    });

    it('does not carry a dimension format into counts', () => {
        expect(
            getInheritedCustomMetricFormat(usdDimension, MetricType.COUNT),
        ).toBeUndefined();
        expect(
            getInheritedCustomMetricFormat(
                usdDimension,
                MetricType.COUNT_DISTINCT,
            ),
        ).toBeUndefined();
    });

    it('ignores non-numeric dimension formats', () => {
        expect(
            getInheritedCustomMetricFormat(
                {
                    ...usdDimension,
                    type: DimensionType.DATE,
                    format: 'dd mmmm yyyy',
                },
                MetricType.MAX,
            ),
        ).toBeUndefined();
    });

    it('always carries a metric format into its clone', () => {
        expect(
            getInheritedCustomMetricFormat(
                {
                    ...baseMetric,
                    type: MetricType.COUNT,
                    compact: Compact.THOUSANDS,
                },
                MetricType.COUNT,
            ),
        ).toEqual({
            type: CustomFormatType.NUMBER,
            compact: Compact.THOUSANDS,
            round: undefined,
        });
    });

    it('prefers a chart-level format override to the dimension format', () => {
        expect(
            getInheritedCustomMetricFormat(usdDimension, MetricType.SUM, {
                type: CustomFormatType.PERCENT,
                round: 1,
            }),
        ).toEqual({
            type: CustomFormatType.PERCENT,
            round: 1,
        });
    });
});

describe('buildNewAdditionalMetric', () => {
    it('renders a sum of a usd dimension as currency', () => {
        const metric = buildNewAdditionalMetric({
            item: usdDimension,
            type: MetricType.SUM,
            customMetricLabel: 'Sum of Amount',
            customMetricFiltersWithIds: [],
            formatOptions: getInheritedCustomMetricFormat(
                usdDimension,
                MetricType.SUM,
            ),
        });

        expect(metric.baseDimensionName).toBe('amount');
        expect(metric.name).toBe('amount_sum_of_amount');
        expect(formatItemValue(metric, 2397)).toMatch(/^(?:US)?\$2,397\.00$/);
    });

    it('a default format would have hidden the dimension currency', () => {
        const metric = buildNewAdditionalMetric({
            item: usdDimension,
            type: MetricType.SUM,
            customMetricLabel: 'Sum of Amount',
            customMetricFiltersWithIds: [],
            formatOptions: { type: CustomFormatType.DEFAULT },
        });

        expect(formatItemValue(metric, 2397)).toBe('2,397');
    });

    it('references the base metric when cloning a metric', () => {
        const metric = buildNewAdditionalMetric({
            item: baseMetric,
            type: baseMetric.type,
            customMetricLabel: 'Copy of Total revenue',
            customMetricFiltersWithIds: [],
        });
        expect(metric.baseMetricName).toBe('total_revenue');
        expect(metric.baseDimensionName).toBeUndefined();
    });
});
