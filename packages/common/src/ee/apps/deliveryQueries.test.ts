import { describe, expect, it } from 'vitest';
import {
    MAX_DELIVERY_QUERIES,
    parseDeliveryQueries,
    type DeliveryQuery,
} from './deliveryQueries';

const metricQuery: DeliveryQuery = {
    kind: 'query',
    label: 'Revenue by segment',
    query: {
        exploreName: 'orders',
        dimensions: ['customer_segment'],
        metrics: ['total_revenue'],
        filters: [],
        sorts: [],
        tableCalculations: [],
        additionalMetrics: [],
        customDimensions: [],
        limit: 500,
    },
};

const savedChartQuery: DeliveryQuery = {
    kind: 'savedChart',
    label: 'Linked revenue',
    chartUuid: 'chart-1',
    limit: 1000,
};

describe('parseDeliveryQueries', () => {
    it('accepts a metric-query declaration', () => {
        expect(parseDeliveryQueries([metricQuery])).toEqual([metricQuery]);
    });

    it('accepts a saved-chart declaration', () => {
        expect(parseDeliveryQueries([savedChartQuery])).toEqual([
            savedChartQuery,
        ]);
    });

    it('rejects a non-array payload', () => {
        expect(parseDeliveryQueries({ kind: 'query' })).toBeNull();
        expect(parseDeliveryQueries(null)).toBeNull();
        expect(parseDeliveryQueries('nope')).toBeNull();
    });

    it('rejects an empty array — the SDK never publishes one', () => {
        expect(parseDeliveryQueries([])).toBeNull();
    });

    it('rejects a declaration with an unknown kind', () => {
        expect(parseDeliveryQueries([{ kind: 'sql', label: null }])).toBeNull();
    });

    it('rejects a metric query missing its exploreName', () => {
        expect(
            parseDeliveryQueries([
                { kind: 'query', label: null, query: { dimensions: [] } },
            ]),
        ).toBeNull();
    });

    it('rejects a saved chart missing its chartUuid', () => {
        expect(
            parseDeliveryQueries([{ kind: 'savedChart', label: null }]),
        ).toBeNull();
    });

    it('rejects a declaration with a non-string label', () => {
        expect(
            parseDeliveryQueries([{ ...savedChartQuery, label: 42 }]),
        ).toBeNull();
    });

    it('rejects more declarations than the cap', () => {
        const tooMany = Array.from(
            { length: MAX_DELIVERY_QUERIES + 1 },
            () => metricQuery,
        );
        expect(parseDeliveryQueries(tooMany)).toBeNull();
    });

    it('accepts exactly the cap', () => {
        const atCap = Array.from(
            { length: MAX_DELIVERY_QUERIES },
            () => metricQuery,
        );
        expect(parseDeliveryQueries(atCap)).toHaveLength(MAX_DELIVERY_QUERIES);
    });
});
