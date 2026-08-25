import { describe, expect, it } from 'vitest';
import { AiResultType } from './types';
import {
    getDataAppVizChartFromArtifact,
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

const customChartTypeSlugChartConfig = {
    customChartTypeSlug: 'cohort-waterfall',
    fieldMapping: { x: 'orders_created_month', y: 'orders_revenue' },
    options: { showLegend: true },
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

    it('round-trips a customChartType envelope', () => {
        const config = {
            source: 'customChartType',
            schemaVersion: 1,
            dataAppVizUuid: '4c25c1d5-cbc9-4d76-b58e-b1c9ee399fd9',
            config: {
                ...semanticConfig,
                chartConfig: customChartTypeSlugChartConfig,
            },
        } as const;

        // The V3 schema parse fills defaulted fields the persisted value omits.
        expect(parseAiArtifactChartConfig(config)).toEqual({
            ...config,
            config: {
                ...config.config,
                mergeConfig: null,
                queryConfig: { ...config.config.queryConfig, parameters: null },
            },
        });
    });

    it('rejects a customChartType envelope whose config is not the slug branch', () => {
        expect(
            parseAiArtifactChartConfig({
                source: 'customChartType',
                schemaVersion: 1,
                dataAppVizUuid: '4c25c1d5-cbc9-4d76-b58e-b1c9ee399fd9',
                config: semanticConfig,
            }),
        ).toBeNull();
    });

    it('rejects semantic configs carrying a custom chart type slug chartConfig', () => {
        expect(
            parseAiArtifactChartConfig({
                source: 'semantic',
                config: {
                    ...semanticConfig,
                    chartConfig: customChartTypeSlugChartConfig,
                },
            }),
        ).toBeNull();
        // Legacy bare shape too.
        expect(
            parseAiArtifactChartConfig({
                ...semanticConfig,
                chartConfig: customChartTypeSlugChartConfig,
            }),
        ).toBeNull();
    });

    it('rejects semantic configs carrying the retired uuid-enriched chartConfig', () => {
        expect(
            parseAiArtifactChartConfig({
                source: 'semantic',
                config: {
                    ...semanticConfig,
                    chartConfig: {
                        dataAppVizUuid: '4c25c1d5-cbc9-4d76-b58e-b1c9ee399fd9',
                        fieldMapping: { x: 'orders_created_month' },
                        optionValues: { showLegend: true },
                    },
                },
            }),
        ).toBeNull();
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

describe('getDataAppVizChartFromArtifact', () => {
    it('builds the saved-chart shape from envelope uuid + verbatim tool args', () => {
        expect(
            getDataAppVizChartFromArtifact({
                source: 'customChartType',
                schemaVersion: 1,
                dataAppVizUuid: '4c25c1d5-cbc9-4d76-b58e-b1c9ee399fd9',
                config: {
                    ...semanticConfig,
                    queryConfig: {
                        ...semanticConfig.queryConfig,
                        parameters: null,
                    },
                    chartConfig: customChartTypeSlugChartConfig,
                },
            }),
        ).toEqual({
            dataAppVizUuid: '4c25c1d5-cbc9-4d76-b58e-b1c9ee399fd9',
            fieldMapping: customChartTypeSlugChartConfig.fieldMapping,
            optionValues: { showLegend: true },
        });
    });

    it('omits optionValues when the model set no options', () => {
        expect(
            getDataAppVizChartFromArtifact({
                source: 'customChartType',
                schemaVersion: 1,
                dataAppVizUuid: '4c25c1d5-cbc9-4d76-b58e-b1c9ee399fd9',
                config: {
                    ...semanticConfig,
                    queryConfig: {
                        ...semanticConfig.queryConfig,
                        parameters: null,
                    },
                    chartConfig: {
                        ...customChartTypeSlugChartConfig,
                        options: null,
                    },
                },
            }),
        ).toEqual({
            dataAppVizUuid: '4c25c1d5-cbc9-4d76-b58e-b1c9ee399fd9',
            fieldMapping: customChartTypeSlugChartConfig.fieldMapping,
        });
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
