import { describe, expect, it } from 'vitest';
import { parseAiArtifactChartConfig } from './utils';

const semanticConfig = {
    title: 'Revenue by month',
    description: 'Monthly revenue trend',
    chartConfig: null,
    queryConfig: {
        exploreName: 'orders',
        dimensions: ['orders_created_month'],
        metrics: ['orders_revenue'],
        sorts: [],
        limit: 500,
        customMetrics: null,
        tableCalculations: null,
        filters: null,
    },
};

describe('parseAiArtifactChartConfig', () => {
    it('normalizes legacy semantic configs', () => {
        expect(parseAiArtifactChartConfig(semanticConfig)).toEqual({
            source: 'semantic',
            config: semanticConfig,
        });
    });

    it('accepts normalized semantic configs', () => {
        const config = { source: 'semantic', config: semanticConfig } as const;

        expect(parseAiArtifactChartConfig(config)).toEqual(config);
    });

    it('drops legacy SQL execution UUIDs', () => {
        expect(
            parseAiArtifactChartConfig({
                source: 'sql',
                sql: 'select 1',
                limit: 500,
                queryUuid: 'expired-query',
            }),
        ).toEqual({
            source: 'sql',
            sql: 'select 1',
            limit: 500,
        });
    });

    it('rejects invalid configs', () => {
        expect(parseAiArtifactChartConfig({ source: 'sql' })).toBeNull();
    });
});
