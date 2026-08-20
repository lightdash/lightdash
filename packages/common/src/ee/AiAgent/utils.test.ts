import { describe, expect, it } from 'vitest';
import { AiResultType } from './types';
import {
    getMcpToolBaseName,
    parseAiArtifactChartConfig,
    parseVizConfig,
} from './utils';

describe('getMcpToolBaseName', () => {
    it('matches the namespaced runtime tool name', () => {
        expect(getMcpToolBaseName('Linear MCP', 'Get issue')).toBe(
            'mcp_linear_mcp__get_issue',
        );
        expect(getMcpToolBaseName('---', '---')).toBe('mcp_tool__tool');
    });
});

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

    it('accepts versioned merge configs', () => {
        const config = {
            source: 'merge',
            schemaVersion: 1,
            config: {
                ...semanticConfig,
                mergeConfig: {
                    primarySourceId: 'orders',
                    additionalSources: [
                        {
                            id: 'targets',
                            queryConfig: {
                                exploreName: 'targets',
                                dimensions: ['targets_month'],
                                metrics: ['targets_target'],
                                sorts: [],
                                customMetrics: null,
                                filters: null,
                            },
                        },
                    ],
                    joinKey: [
                        {
                            name: 'month',
                            fields: [
                                {
                                    sourceId: 'orders',
                                    fieldId: 'orders_created_month',
                                },
                                {
                                    sourceId: 'targets',
                                    fieldId: 'targets_month',
                                },
                            ],
                        },
                    ],
                    joinType: 'full',
                },
            },
        } as const;

        // The V3 schema parse fills defaulted fields the persisted value omits.
        expect(parseAiArtifactChartConfig(config)).toEqual({
            ...config,
            config: {
                ...config.config,
                queryConfig: { ...config.config.queryConfig, parameters: null },
            },
        });
    });

    it('rejects invalid configs', () => {
        expect(parseAiArtifactChartConfig({ source: 'sql' })).toBeNull();
    });
});

// Persisted legacy viz configs still carry followUpTools even though the
// schemas no longer declare it. They must keep parsing to the same type.
describe('parseVizConfig with legacy persisted configs', () => {
    const metadata = {
        title: 'Revenue',
        description: 'Revenue',
        customMetrics: null,
        tableCalculations: null,
        filters: null,
    };

    it('parses a legacy bar config carrying followUpTools', () => {
        const parsed = parseVizConfig({
            ...metadata,
            followUpTools: ['generate_table', 'generate_time_series_viz'],
            vizConfig: {
                exploreName: 'orders',
                xDimension: 'orders_status',
                yMetrics: ['orders_revenue'],
                sorts: [],
                limit: 500,
                breakdownByDimension: null,
                stackBars: null,
                xAxisType: 'category',
                xAxisLabel: null,
                yAxisLabel: null,
            },
        });

        expect(parsed?.type).toBe(AiResultType.VERTICAL_BAR_RESULT);
        expect(parsed?.vizTool).not.toHaveProperty('followUpTools');
    });

    it('parses a legacy time series config carrying followUpTools', () => {
        const parsed = parseVizConfig({
            ...metadata,
            followUpTools: ['table', 'vertical_bar'],
            vizConfig: {
                exploreName: 'orders',
                xDimension: 'orders_created_month',
                yMetrics: ['orders_revenue'],
                sorts: [],
                breakdownByDimension: null,
                lineType: 'line',
                limit: 500,
                xAxisLabel: 'Month',
                yAxisLabel: 'Revenue',
            },
        });

        expect(parsed?.type).toBe(AiResultType.TIME_SERIES_RESULT);
        expect(parsed?.vizTool).not.toHaveProperty('followUpTools');
    });

    it('parses a legacy table config carrying followUpTools', () => {
        const parsed = parseVizConfig({
            ...metadata,
            followUpTools: ['generate_bar_viz'],
            vizConfig: {
                exploreName: 'orders',
                metrics: ['orders_revenue'],
                dimensions: ['orders_status'],
                sorts: [],
                limit: 500,
            },
        });

        expect(parsed?.type).toBe(AiResultType.TABLE_RESULT);
        expect(parsed?.vizTool).not.toHaveProperty('followUpTools');
    });
});

describe('parseVizConfig table calculations', () => {
    const runQueryArgs = (tableCalculations: unknown) => ({
        title: 'Revenue',
        description: 'Revenue',
        queryConfig: {
            exploreName: 'orders',
            dimensions: ['orders_created_month'],
            metrics: ['orders_revenue', 'orders_count'],
            sorts: [],
            limit: 500,
            customMetrics: null,
            tableCalculations,
            filters: null,
        },
        chartConfig: null,
    });

    it('parses persisted args with legacy template table calcs', () => {
        const parsed = parseVizConfig(
            runQueryArgs([
                {
                    type: 'running_total',
                    name: 'running_revenue',
                    displayName: 'Running Revenue',
                    fieldId: 'orders_revenue',
                },
            ]),
        );

        expect(parsed?.type).toBe(AiResultType.QUERY_RESULT);
        expect(parsed?.metricQuery.tableCalculations).toEqual([
            expect.objectContaining({
                name: 'running_revenue',
                template: expect.objectContaining({ type: 'running_total' }),
            }),
        ]);
    });

    it('parses args with formula table calcs', () => {
        const parsed = parseVizConfig(
            runQueryArgs([
                {
                    type: 'formula',
                    name: 'aov',
                    displayName: 'AOV',
                    formula: 'orders_revenue / orders_count',
                    format: null,
                    resultType: null,
                },
            ]),
        );

        expect(parsed?.type).toBe(AiResultType.QUERY_RESULT);
        expect(parsed?.metricQuery.tableCalculations).toEqual([
            expect.objectContaining({
                name: 'aov',
                formula: '=orders_revenue / orders_count',
            }),
        ]);
    });
});

describe('parseVizConfig parameters', () => {
    const runQueryConfig = {
        title: 'Add to cart events',
        description: 'Filtered events',
        queryConfig: {
            exploreName: 'events',
            dimensions: ['events_filtered_event'],
            metrics: ['events_count'],
            sorts: [],
            limit: 500,
            customMetrics: null,
            tableCalculations: null,
            filters: null,
        },
        chartConfig: null,
    };

    it('surfaces stored parameter values from a runQuery artifact', () => {
        const parsed = parseVizConfig({
            ...runQueryConfig,
            queryConfig: {
                ...runQueryConfig.queryConfig,
                parameters: { 'events.event_status': 'add_to_cart' },
            },
        });

        expect(parsed?.type).toBe(AiResultType.QUERY_RESULT);
        expect(parsed?.parameters).toEqual({
            'events.event_status': 'add_to_cart',
        });
    });

    it('returns null parameters for artifacts persisted without them', () => {
        const parsed = parseVizConfig(runQueryConfig);

        expect(parsed?.type).toBe(AiResultType.QUERY_RESULT);
        expect(parsed?.parameters).toBeNull();
    });
});
