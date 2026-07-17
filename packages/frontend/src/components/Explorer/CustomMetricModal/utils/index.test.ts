import {
    FieldType,
    FilterOperator,
    MetricType,
    type Metric,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getFilterRulesFromMetricBaseFilters,
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
