import { DimensionType, MetricType } from '../../../types/field';
import { FilterOperator, FilterType } from '../../../types/filter';
import { parsePersistedRunQueryPayload } from './persistedRunQueryArgs';
import { parsePersistedRunQueryArgs } from './tools/toolRunQueryArgs';

const dimensionRule = {
    fieldId: 'orders_status',
    fieldType: DimensionType.STRING,
    fieldFilterType: FilterType.STRING,
    operator: FilterOperator.EQUALS,
    values: ['completed'],
};

const secondDimensionRule = {
    ...dimensionRule,
    fieldId: 'orders_region',
    values: ['emea'],
};

const metricRule = {
    fieldId: 'orders_revenue',
    fieldType: MetricType.SUM,
    fieldFilterType: FilterType.NUMBER,
    operator: FilterOperator.GREATER_THAN,
    values: [100],
};

const secondMetricRule = {
    ...metricRule,
    fieldId: 'orders_count',
    fieldType: MetricType.COUNT,
    values: [10],
};

const runQueryPayload = (filters: unknown) => ({
    title: 'Revenue by status',
    description: 'Resolved query',
    queryConfig: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_revenue'],
        sorts: [],
        limit: 500,
        parameters: null,
        customMetrics: null,
        tableCalculations: null,
        filters,
    },
    chartConfig: null,
    mergeConfig: null,
});

const withoutGeneratedIds = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(withoutGeneratedIds);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([key]) => key !== 'id')
                .map(([key, entry]) => [key, withoutGeneratedIds(entry)]),
        );
    }
    return value;
};

describe('parsePersistedRunQueryPayload', () => {
    it('keeps per-category connectors out of the existing parser', () => {
        const payload = runQueryPayload({
            dimensions: {
                connector: 'and',
                rules: [dimensionRule, secondDimensionRule],
            },
            metrics: {
                connector: 'or',
                rules: [metricRule, secondMetricRule],
            },
            tableCalculations: null,
        });

        expect(parsePersistedRunQueryArgs(payload)).toBeNull();

        const parsed = parsePersistedRunQueryPayload(payload);
        expect(parsed?.queryConfig.filters.dimensions).toMatchObject({
            and: [
                { target: { fieldId: 'orders_status' } },
                { target: { fieldId: 'orders_region' } },
            ],
        });
        expect(parsed?.queryConfig.filters.metrics).toMatchObject({
            or: [
                { target: { fieldId: 'orders_revenue' } },
                { target: { fieldId: 'orders_count' } },
            ],
        });
    });

    it('preserves the existing parser result for shared connectors', () => {
        const payload = runQueryPayload({
            type: 'or',
            dimensions: [dimensionRule],
            metrics: [metricRule],
            tableCalculations: null,
        });
        const existing = parsePersistedRunQueryArgs(payload);
        const parsed = parsePersistedRunQueryPayload(payload);

        expect(existing).not.toBeNull();
        expect(withoutGeneratedIds(parsed)).toEqual(
            withoutGeneratedIds(existing),
        );
    });
});
