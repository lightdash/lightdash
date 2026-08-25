import {
    ChartType,
    DEFAULT_ADDITIONAL_SOURCE_ID,
    MergeJoinType,
    PRIMARY_SOURCE_ID,
    type CanonicalAiMerge,
    type ChartConfig,
    type DataAppVizRenderMetadata,
    type MetricQuery,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildAiSavedChartData } from './aiSavedChartData';

const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status', 'orders_region'],
    metrics: ['orders_total'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const tableChartConfig: ChartConfig = {
    type: ChartType.TABLE,
    config: undefined,
};

const customChartConfig: ChartConfig = {
    type: ChartType.DATA_APP_VIZ,
    config: {
        dataAppVizUuid: 'viz-uuid',
        fieldMapping: {
            x: 'orders_status',
            y: 'orders_total',
            split: 'orders_region',
        },
    },
};

const readyMetadata: DataAppVizRenderMetadata = {
    state: 'ready',
    version: 3,
    schema: {
        fields: [
            { name: 'x', label: 'X', type: 'dimension', required: true },
            { name: 'y', label: 'Y', type: 'metric', required: true },
            { name: 'split', label: 'Split', type: 'series', required: false },
        ],
        configOptions: [],
        colorPalette: null,
    },
    latestBuildInProgress: false,
};

const baseArgs = {
    metricQuery,
    columnOrder: ['orders_status', 'orders_region', 'orders_total'],
    pivotDimensions: undefined,
    merge: null,
    canonicalMerge: null,
    customChartTypeMetadata: undefined,
};

describe('buildAiSavedChartData', () => {
    it('returns undefined without a metric query', () => {
        expect(
            buildAiSavedChartData({
                ...baseArgs,
                metricQuery: undefined,
                chartConfig: tableChartConfig,
            }),
        ).toBeUndefined();
    });

    it('passes builtin answers through with the live pivot dimensions', () => {
        const result = buildAiSavedChartData({
            ...baseArgs,
            chartConfig: tableChartConfig,
            pivotDimensions: ['orders_region'],
        });
        expect(result).toEqual({
            metricQuery,
            tableName: 'orders',
            chartConfig: tableChartConfig,
            tableConfig: { columnOrder: baseArgs.columnOrder },
            pivotConfig: { columns: ['orders_region'] },
        });
    });

    it('omits pivotConfig for builtin answers without pivot dimensions', () => {
        const result = buildAiSavedChartData({
            ...baseArgs,
            chartConfig: tableChartConfig,
        });
        expect(result?.pivotConfig).toBeUndefined();
    });

    describe('custom chart type answers', () => {
        it('derives pivotConfig from the series slots of the schema', () => {
            const result = buildAiSavedChartData({
                ...baseArgs,
                chartConfig: customChartConfig,
                customChartTypeMetadata: readyMetadata,
            });
            expect(result).toEqual({
                metricQuery,
                tableName: 'orders',
                chartConfig: customChartConfig,
                tableConfig: { columnOrder: baseArgs.columnOrder },
                pivotConfig: { columns: ['orders_region'] },
            });
        });

        it('ignores live pivot dimensions in favour of the schema derivation', () => {
            const result = buildAiSavedChartData({
                ...baseArgs,
                chartConfig: customChartConfig,
                pivotDimensions: ['orders_status'],
                customChartTypeMetadata: readyMetadata,
            });
            expect(result?.pivotConfig).toEqual({
                columns: ['orders_region'],
            });
        });

        it('omits pivotConfig when the schema has no series slots', () => {
            const result = buildAiSavedChartData({
                ...baseArgs,
                chartConfig: customChartConfig,
                customChartTypeMetadata: {
                    ...readyMetadata,
                    schema: {
                        ...readyMetadata.schema,
                        fields: readyMetadata.schema.fields.filter(
                            (field) => field.type !== 'series',
                        ),
                    },
                },
            });
            expect(result).toBeDefined();
            expect(result?.pivotConfig).toBeUndefined();
        });

        it('returns undefined until the schema metadata is ready', () => {
            expect(
                buildAiSavedChartData({
                    ...baseArgs,
                    chartConfig: customChartConfig,
                }),
            ).toBeUndefined();
            expect(
                buildAiSavedChartData({
                    ...baseArgs,
                    chartConfig: customChartConfig,
                    customChartTypeMetadata: {
                        state: 'building',
                        latestBuildInProgress: true,
                    },
                }),
            ).toBeUndefined();
        });
    });

    describe('merge answers', () => {
        const canonicalMerge: CanonicalAiMerge = {
            mergeQuery: {
                sources: [
                    { id: PRIMARY_SOURCE_ID, metricQuery },
                    {
                        id: DEFAULT_ADDITIONAL_SOURCE_ID,
                        metricQuery: {
                            ...metricQuery,
                            exploreName: 'payments',
                        },
                    },
                ],
                joinKey: [
                    {
                        name: 'join_key_0',
                        fieldIdBySourceId: {
                            [PRIMARY_SOURCE_ID]: 'orders_status',
                            [DEFAULT_ADDITIONAL_SOURCE_ID]: 'payments_status',
                        },
                    },
                ],
                joinType: MergeJoinType.FULL,
                tableCalculations: [],
                limit: 500,
            },
            fieldIdByAiFieldId: { source_1_total: 'a_total' },
        };

        it('saves the primary source query with remapped config', () => {
            const chartConfig: ChartConfig = {
                type: ChartType.BIG_NUMBER,
                config: { selectedField: 'source_1_total' },
            };
            const result = buildAiSavedChartData({
                ...baseArgs,
                chartConfig,
                columnOrder: ['source_1_total'],
                pivotDimensions: ['source_1_total'],
                merge: { parameters: undefined },
                canonicalMerge,
            });
            expect(result?.metricQuery).toEqual(metricQuery);
            expect(result?.tableName).toBe('orders');
            expect(result?.chartConfig).toEqual({
                type: ChartType.BIG_NUMBER,
                config: { selectedField: 'a_total' },
            });
            expect(result?.tableConfig).toEqual({
                columnOrder: ['a_total'],
            });
            expect(result?.pivotConfig).toEqual({ columns: ['a_total'] });
            expect(result?.merge?.primarySourceId).toBe(PRIMARY_SOURCE_ID);
        });

        describe('rendered through a custom chart type', () => {
            const mergedCanonicalMerge: CanonicalAiMerge = {
                ...canonicalMerge,
                fieldIdByAiFieldId: {
                    source_1_total: 'a_total',
                    merge_month: 'merge_join_key_0',
                    merge_region: 'merge_join_key_1',
                },
            };
            const mergedCustomChartConfig: ChartConfig = {
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid: 'viz-uuid',
                    fieldMapping: {
                        x: 'merge_month',
                        y: 'source_1_total',
                        split: 'merge_region',
                    },
                },
            };

            it('derives the pivot from the schema and remaps everything to canonical ids', () => {
                const result = buildAiSavedChartData({
                    ...baseArgs,
                    chartConfig: mergedCustomChartConfig,
                    columnOrder: [
                        'merge_month',
                        'merge_region',
                        'source_1_total',
                    ],
                    merge: { parameters: undefined },
                    canonicalMerge: mergedCanonicalMerge,
                    customChartTypeMetadata: readyMetadata,
                });
                expect(result?.metricQuery).toEqual(metricQuery);
                expect(result?.chartConfig).toEqual({
                    type: ChartType.DATA_APP_VIZ,
                    config: {
                        dataAppVizUuid: 'viz-uuid',
                        fieldMapping: {
                            x: 'merge_join_key_0',
                            y: 'a_total',
                            split: 'merge_join_key_1',
                        },
                    },
                });
                expect(result?.pivotConfig).toEqual({
                    columns: ['merge_join_key_1'],
                });
                expect(result?.merge?.primarySourceId).toBe(PRIMARY_SOURCE_ID);
            });

            it('returns undefined until the schema metadata is ready', () => {
                expect(
                    buildAiSavedChartData({
                        ...baseArgs,
                        chartConfig: mergedCustomChartConfig,
                        merge: { parameters: undefined },
                        canonicalMerge: mergedCanonicalMerge,
                    }),
                ).toBeUndefined();
            });
        });

        it('returns undefined for a merge that could not be canonicalized', () => {
            expect(
                buildAiSavedChartData({
                    ...baseArgs,
                    chartConfig: tableChartConfig,
                    merge: { parameters: undefined },
                    canonicalMerge: null,
                }),
            ).toBeUndefined();
        });
    });
});
