import { FilterOperator, type MetricQuery } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getLiveQueryShape } from './queryShape';

const metricQuery = {
    exploreName: 'ga4_traffic',
    dimensions: ['ga4_traffic_country'],
    metrics: ['ga4_traffic_sessions'],
    filters: {
        dimensions: {
            id: 'root',
            and: [
                {
                    id: 'r1',
                    target: { fieldId: 'ga4_traffic_country' },
                    operator: FilterOperator.EQUALS,
                    values: ['secret-customer@example.com'],
                },
            ],
        },
    },
    sorts: [{ fieldId: 'ga4_traffic_sessions', descending: true }],
    limit: 500,
    tableCalculations: [],
    additionalMetrics: [],
} as unknown as MetricQuery;

describe('getLiveQueryShape', () => {
    it('keeps field ids, operators and counts', () => {
        expect(
            getLiveQueryShape(metricQuery, {
                isPivoted: false,
                dateZoomGranularity: 'WEEK',
            }),
        ).toEqual({
            dimensions: ['ga4_traffic_country'],
            metrics: ['ga4_traffic_sessions'],
            filters: [
                {
                    fieldId: 'ga4_traffic_country',
                    operator: 'equals',
                    valueCount: 1,
                },
            ],
            sorts: 1,
            limit: 500,
            customMetrics: 0,
            customDimensions: 0,
            tableCalculations: 0,
            pivot: false,
            dateZoom: 'WEEK',
        });
    });

    it('never carries a filter value', () => {
        const shape = getLiveQueryShape(metricQuery, { isPivoted: false });
        expect(JSON.stringify(shape)).not.toContain('secret-customer');
    });

    it('caps long field lists and ids', () => {
        const shape = getLiveQueryShape(
            {
                ...metricQuery,
                dimensions: Array.from({ length: 30 }, (_, i) => `d${i}`),
                metrics: ['m'.repeat(200)],
            },
            { isPivoted: true },
        );
        expect(shape.dimensions).toHaveLength(10);
        expect(shape.metrics[0]).toHaveLength(80);
        expect(shape.pivot).toBe(true);
    });
});
