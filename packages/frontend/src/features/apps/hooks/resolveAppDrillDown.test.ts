import { type ItemsMap, type MetricQuery } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    resolveAppDrillDown,
    type AppDrillDownSource,
} from './resolveAppDrillDown';

const metricItem = {
    fieldType: 'metric',
    type: 'sum',
    name: 'revenue',
    table: 'orders',
    label: 'Revenue',
    hidden: false,
} as unknown as ItemsMap[string];

const metricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_revenue'],
    filters: {},
    sorts: [],
    tableCalculations: [],
    additionalMetrics: [],
    customDimensions: [],
    limit: 500,
} as MetricQuery;

const source: AppDrillDownSource = {
    metricQuery,
    fields: { orders_revenue: metricItem } as ItemsMap,
    parameters: { currency: 'USD' },
};

const sources = new Map([['q-1', source]]);
const row = {
    orders_status: { value: { raw: 'paid', formatted: 'Paid' } },
    orders_revenue: { value: { raw: 42, formatted: '$42' } },
};

describe('resolveAppDrillDown', () => {
    it('uses only trusted query context while preserving values and parameters', () => {
        const config = resolveAppDrillDown(
            { queryUuid: 'q-1', row, metric: 'orders_revenue' },
            sources,
        );

        expect(config).toEqual({
            item: metricItem,
            fieldValues: {
                orders_status: { raw: 'paid', formatted: 'Paid' },
                orders_revenue: { raw: 42, formatted: '$42' },
            },
            source: {
                tableName: 'orders',
                metricQuery,
                parameters: { currency: 'USD' },
            },
        });
    });

    it('rejects unknown queries, non-source metrics, and incomplete rows', () => {
        expect(() =>
            resolveAppDrillDown(
                { queryUuid: 'stale', row, metric: 'orders_revenue' },
                sources,
            ),
        ).toThrow(/source query.*no longer available/i);
        expect(() =>
            resolveAppDrillDown(
                { queryUuid: 'q-1', row, metric: 'orders_profit' },
                sources,
            ),
        ).toThrow(/not a metric in this query/i);
        expect(() =>
            resolveAppDrillDown(
                {
                    queryUuid: 'q-1',
                    row: { orders_revenue: row.orders_revenue },
                    metric: 'orders_revenue',
                },
                sources,
            ),
        ).toThrow(/missing dimension "orders_status"/i);
    });
});
