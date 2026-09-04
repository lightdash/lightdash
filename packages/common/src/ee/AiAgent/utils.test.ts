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

const statusRule = {
    fieldId: 'orders_status',
    fieldType: 'string',
    fieldFilterType: 'string',
    operator: 'equals',
    values: ['completed'],
};

const regionRule = {
    fieldId: 'orders_region',
    fieldType: 'string',
    fieldFilterType: 'string',
    operator: 'equals',
    values: ['emea'],
};

const revenueRule = {
    fieldId: 'orders_revenue',
    fieldType: 'sum',
    fieldFilterType: 'number',
    operator: 'greaterThan',
    values: [100],
};

const countRule = {
    fieldId: 'orders_count',
    fieldType: 'count',
    fieldFilterType: 'number',
    operator: 'greaterThan',
    values: [10],
};

const perCategoryResolvedConfig = {
    ...semanticConfig,
    queryConfig: {
        ...semanticConfig.queryConfig,
        filters: {
            dimensions: {
                connector: 'and',
                rules: [statusRule, regionRule],
            },
            metrics: {
                connector: 'or',
                rules: [revenueRule, countRule],
            },
            tableCalculations: null,
        },
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

    it('replays independent category connectors from persisted args', () => {
        const artifact = parseAiArtifactChartConfig({
            source: 'semantic',
            config: perCategoryResolvedConfig,
        });
        if (artifact?.source !== 'semantic') {
            throw new Error('Expected a semantic artifact');
        }

        const replayed = parseVizConfig(artifact.config);
        expect(replayed?.metricQuery.filters.dimensions).toMatchObject({
            and: [
                { target: { fieldId: 'orders_status' } },
                { target: { fieldId: 'orders_region' } },
            ],
        });
        expect(replayed?.metricQuery.filters.metrics).toMatchObject({
            or: [
                { target: { fieldId: 'orders_revenue' } },
                { target: { fieldId: 'orders_count' } },
            ],
        });
    });

    it('normalizes per-category filters under their semantic source', () => {
        const normalized = {
            source: 'semantic',
            config: {
                ...perCategoryResolvedConfig,
                queryConfig: {
                    ...perCategoryResolvedConfig.queryConfig,
                    parameters: null,
                },
                mergeConfig: null,
            },
        };

        expect(parseAiArtifactChartConfig(perCategoryResolvedConfig)).toEqual(
            normalized,
        );
        expect(
            parseAiArtifactChartConfig({
                source: 'semantic',
                config: perCategoryResolvedConfig,
            }),
        ).toEqual(normalized);
    });

    it('normalizes resolved custom chart expression args', () => {
        const resolvedArgs = {
            ...perCategoryResolvedConfig,
            chartConfig: customChartTypeSlugChartConfig,
        };

        expect(
            parseAiArtifactChartConfig({
                source: 'customChartType',
                schemaVersion: 1,
                dataAppVizUuid: '4c25c1d5-cbc9-4d76-b58e-b1c9ee399fd9',
                config: resolvedArgs,
            }),
        ).toEqual({
            source: 'customChartType',
            schemaVersion: 1,
            dataAppVizUuid: '4c25c1d5-cbc9-4d76-b58e-b1c9ee399fd9',
            config: {
                ...resolvedArgs,
                queryConfig: {
                    ...resolvedArgs.queryConfig,
                    parameters: null,
                },
                mergeConfig: null,
            },
        });
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

    it('normalizes resolved merge expression args', () => {
        const resolvedConfig = {
            ...perCategoryResolvedConfig,
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
                            filters: {
                                dimensions: {
                                    connector: 'or',
                                    rules: [
                                        {
                                            fieldId: 'targets_month',
                                            fieldType: 'date',
                                            fieldFilterType: 'date',
                                            operator: 'equals',
                                            values: ['2025-01-01'],
                                        },
                                    ],
                                },
                                metrics: null,
                                tableCalculations: null,
                            },
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
        } as const;
        const normalized = {
            source: 'merge',
            schemaVersion: 1,
            config: {
                ...resolvedConfig,
                queryConfig: {
                    ...resolvedConfig.queryConfig,
                    parameters: null,
                },
            },
        };

        expect(
            parseAiArtifactChartConfig({
                source: 'merge',
                schemaVersion: 1,
                config: resolvedConfig,
            }),
        ).toEqual(normalized);
    });

    it('rejects source/config mismatches', () => {
        const mergeResolvedConfig = {
            ...perCategoryResolvedConfig,
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
        };
        expect(
            parseAiArtifactChartConfig({
                source: 'semantic',
                config: mergeResolvedConfig,
            }),
        ).toBeNull();
        // Older releases persisted merge + custom-slug configs before new
        // writes rejected that combination. Keep those artifacts readable.
        expect(
            parseAiArtifactChartConfig({
                source: 'merge',
                schemaVersion: 1,
                config: {
                    ...mergeResolvedConfig,
                    chartConfig: customChartTypeSlugChartConfig,
                },
            }),
        ).toMatchObject({ source: 'merge' });
    });

    it('rejects invalid configs', () => {
        expect(parseAiArtifactChartConfig({ source: 'sql' })).toBeNull();
    });
});

describe('getDataAppVizChartFromArtifact', () => {
    it('builds the saved-chart shape from its persisted envelope', () => {
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

describe('parseVizConfig sort defaults', () => {
    it('keeps omitted null ordering as the warehouse default', () => {
        const parsed = parseVizConfig({
            ...semanticConfig,
            queryConfig: {
                ...semanticConfig.queryConfig,
                sorts: [
                    {
                        fieldId: 'orders_revenue',
                        descending: true,
                    },
                ],
            },
        });

        expect(parsed?.metricQuery.sorts).toEqual([
            {
                fieldId: 'orders_revenue',
                descending: true,
                nullsFirst: undefined,
            },
        ]);
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
