import { Compact, DimensionType } from '../types/field';
import { FilterOperator } from '../types/filter';
import {
    ChartKind,
    ComparisonDiffTypes,
    ComparisonFormatTypes,
} from '../types/savedCharts';
import { BigNumberDataModel } from './BigNumberDataModel';
import {
    VizAggregationOptions,
    VizIndexType,
    type PivotChartData,
    type PivotChartLayout,
} from './types';
import { type IResultsRunner } from './types/IResultsRunner';

const pivotResults = (row: Record<string, unknown>): PivotChartData => ({
    queryUuid: 'query-uuid',
    fileUrl: 'https://example.com/results.jsonl',
    results: [row],
    indexColumn: undefined,
    valuesColumns: Object.keys(row).map((pivotColumnName) => ({
        referenceField: pivotColumnName.replace(
            /_(sum|count|avg|min|max)$/,
            '',
        ),
        pivotColumnName,
        aggregation: VizAggregationOptions.SUM,
        pivotValues: [],
    })),
    columns: Object.keys(row).map((reference) => ({ reference })),
    columnCount: Object.keys(row).length,
});

const buildRunner = (
    overrides: Partial<IResultsRunner> = {},
): IResultsRunner => ({
    getColumnNames: () => ['revenue', 'target', 'region'],
    getRows: () => [],
    getPivotedVisualizationData: async () => pivotResults({ revenue_sum: 100 }),
    getPivotQueryDimensions: () => [
        {
            reference: 'region',
            axisType: VizIndexType.CATEGORY,
            dimensionType: DimensionType.STRING,
        },
    ],
    getPivotQueryMetrics: () => [
        { reference: 'revenue', aggregation: VizAggregationOptions.SUM },
        { reference: 'target', aggregation: VizAggregationOptions.SUM },
    ],
    getPivotQueryCustomMetrics: () => [],
    ...overrides,
});

const layout = (references: string[]): PivotChartLayout => ({
    x: undefined,
    y: references.map((reference) => ({
        reference,
        aggregation: VizAggregationOptions.SUM,
    })),
    groupBy: [],
});

describe('BigNumberDataModel', () => {
    describe('getDefaultLayout', () => {
        it('selects the first metric and no index', () => {
            const model = new BigNumberDataModel({
                resultsRunner: buildRunner(),
            });

            expect(model.getDefaultLayout()).toEqual({
                x: undefined,
                y: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupBy: [],
            });
        });

        it('falls back to a numeric dimension as a custom metric', () => {
            const model = new BigNumberDataModel({
                resultsRunner: buildRunner({
                    getPivotQueryMetrics: () => [],
                    getPivotQueryCustomMetrics: () => [
                        {
                            reference: 'region',
                            axisType: VizIndexType.CATEGORY,
                            dimensionType: DimensionType.STRING,
                            aggregation: VizAggregationOptions.COUNT,
                        },
                        {
                            reference: 'revenue',
                            axisType: VizIndexType.CATEGORY,
                            dimensionType: DimensionType.NUMBER,
                            aggregation: VizAggregationOptions.SUM,
                        },
                    ],
                }),
            });

            expect(model.getDefaultLayout()?.y).toEqual([
                {
                    reference: 'revenue',
                    aggregation: VizAggregationOptions.SUM,
                },
            ]);
        });

        it('returns undefined when there is nothing to aggregate', () => {
            const model = new BigNumberDataModel({
                resultsRunner: buildRunner({
                    getPivotQueryMetrics: () => [],
                    getPivotQueryCustomMetrics: () => [],
                }),
            });

            expect(model.getDefaultLayout()).toBeUndefined();
        });
    });

    describe('mergeConfig', () => {
        it('keeps a saved layout whose fields still exist', () => {
            const model = new BigNumberDataModel({
                resultsRunner: buildRunner(),
            });
            const saved = layout(['target']);

            expect(
                model.mergeConfig(ChartKind.BIG_NUMBER, {
                    fieldConfig: saved,
                    display: { label: 'Target' },
                }),
            ).toEqual({
                metadata: { version: 1 },
                type: ChartKind.BIG_NUMBER,
                fieldConfig: saved,
                display: { label: 'Target' },
            });
        });

        it('falls back to the default layout when a saved field is gone', () => {
            const model = new BigNumberDataModel({
                resultsRunner: buildRunner(),
            });

            expect(
                model.mergeConfig(ChartKind.BIG_NUMBER, {
                    fieldConfig: layout(['deleted_column']),
                    display: undefined,
                }).fieldConfig,
            ).toEqual(layout(['revenue']));
        });
    });

    describe('getConfigErrors', () => {
        it('reports fields that no longer exist', () => {
            const model = new BigNumberDataModel({
                resultsRunner: buildRunner(),
            });

            expect(model.getConfigErrors(layout(['deleted_column']))).toEqual({
                metricFieldError: { references: ['deleted_column'] },
            });
        });

        it('accepts fields that exist as custom metrics', () => {
            const model = new BigNumberDataModel({
                resultsRunner: buildRunner({
                    getPivotQueryMetrics: () => [],
                    getPivotQueryCustomMetrics: () => [
                        {
                            reference: 'revenue',
                            axisType: VizIndexType.CATEGORY,
                            dimensionType: DimensionType.NUMBER,
                            aggregation: VizAggregationOptions.SUM,
                        },
                    ],
                }),
            });

            expect(model.getConfigErrors(layout(['revenue']))).toBeUndefined();
        });
    });

    describe('getPivotedChartData', () => {
        it('queries values with an empty index so every row aggregates', async () => {
            const getPivotedVisualizationData = vi
                .fn()
                .mockResolvedValue(pivotResults({ revenue_sum: 100 }));
            const model = new BigNumberDataModel({
                resultsRunner: buildRunner({ getPivotedVisualizationData }),
                fieldConfig: layout(['revenue']),
            });

            await model.getPivotedChartData({
                sql: 'SELECT 1',
                limit: 500,
                sortBy: [],
                filters: [],
            });

            expect(getPivotedVisualizationData).toHaveBeenCalledWith(
                expect.objectContaining({
                    dimensions: [],
                    timeDimensions: [],
                    metrics: [{ name: 'revenue' }],
                    pivot: { index: [], on: [], values: ['revenue'] },
                }),
            );
        });

        it('turns a dimension into a custom metric', async () => {
            const getPivotedVisualizationData = vi
                .fn()
                .mockResolvedValue(pivotResults({ region_count: 3 }));
            const model = new BigNumberDataModel({
                resultsRunner: buildRunner({ getPivotedVisualizationData }),
                fieldConfig: {
                    x: undefined,
                    y: [
                        {
                            reference: 'region',
                            aggregation: VizAggregationOptions.COUNT,
                        },
                    ],
                    groupBy: [],
                },
            });

            await model.getPivotedChartData({
                sql: 'SELECT 1',
                limit: 500,
                sortBy: [],
                filters: [],
            });

            expect(getPivotedVisualizationData).toHaveBeenCalledWith(
                expect.objectContaining({
                    customMetrics: [
                        {
                            name: 'region_count',
                            baseDimension: 'region',
                            aggType: VizAggregationOptions.COUNT,
                        },
                    ],
                    metrics: [{ name: 'region_count' }],
                }),
            );
        });
    });

    describe('getSpec', () => {
        const buildSpecModel = async (
            row: Record<string, unknown>,
            references: string[],
        ) => {
            const model = new BigNumberDataModel({
                resultsRunner: buildRunner({
                    getPivotedVisualizationData: async () => pivotResults(row),
                }),
                fieldConfig: layout(references),
            });
            await model.getPivotedChartData({
                sql: 'SELECT 1',
                limit: 500,
                sortBy: [],
                filters: [],
            });
            return model;
        };

        it('returns no spec before results arrive', () => {
            const model = new BigNumberDataModel({
                resultsRunner: buildRunner(),
            });

            expect(model.getSpec()).toBeUndefined();
        });

        it('formats the value and defaults the label to the field name', async () => {
            const model = await buildSpecModel({ revenue_sum: 1234.5 }, [
                'revenue',
            ]);

            expect(model.getSpec()).toMatchObject({
                value: 1234.5,
                formattedValue: '1,234.5',
                label: 'revenue',
                showLabel: true,
                comparison: undefined,
            });
        });

        it('applies the compact style and custom label', async () => {
            const model = await buildSpecModel({ revenue_sum: 1_500_000 }, [
                'revenue',
            ]);

            expect(
                model.getSpec({ style: Compact.MILLIONS, label: 'Revenue' }),
            ).toMatchObject({
                formattedValue: '1.5M',
                label: 'Revenue',
            });
        });

        it('ignores the comparison field until the comparison is turned on', async () => {
            const model = await buildSpecModel(
                { revenue_sum: 120, target_sum: 100 },
                ['revenue', 'target'],
            );

            expect(model.getSpec()?.comparison).toBeUndefined();
        });

        it('computes a raw comparison', async () => {
            const model = await buildSpecModel(
                { revenue_sum: 120, target_sum: 100 },
                ['revenue', 'target'],
            );

            expect(model.getSpec({ showComparison: true })?.comparison).toEqual(
                {
                    value: 20,
                    formattedValue: '+20',
                    direction: ComparisonDiffTypes.POSITIVE,
                    label: undefined,
                    tooltip: '+20 compared to target',
                },
            );
        });

        it('computes a percentage comparison', async () => {
            const model = await buildSpecModel(
                { revenue_sum: 80, target_sum: 100 },
                ['revenue', 'target'],
            );

            expect(
                model.getSpec({
                    showComparison: true,
                    comparisonFormat: ComparisonFormatTypes.PERCENTAGE,
                    comparisonLabel: 'vs target',
                })?.comparison,
            ).toMatchObject({
                value: -0.2,
                formattedValue: '-20%',
                direction: ComparisonDiffTypes.NEGATIVE,
                label: 'vs target',
            });
        });

        it('marks an unchanged comparison', async () => {
            const model = await buildSpecModel(
                { revenue_sum: 100, target_sum: 100 },
                ['revenue', 'target'],
            );

            expect(
                model.getSpec({ showComparison: true })?.comparison,
            ).toMatchObject({
                direction: ComparisonDiffTypes.NONE,
                formattedValue: '+0',
            });
        });

        it('colours the value with the first matching rule', async () => {
            const model = await buildSpecModel({ revenue_sum: 120 }, [
                'revenue',
            ]);

            expect(
                model.getSpec({
                    conditionalFormatting: [
                        {
                            operator: FilterOperator.GREATER_THAN,
                            value: 500,
                            color: '#ff0000',
                        },
                        {
                            operator: FilterOperator.GREATER_THAN,
                            value: 100,
                            color: '#00ff00',
                            darkColor: '#88ff88',
                        },
                        {
                            operator: FilterOperator.GREATER_THAN,
                            value: 0,
                            color: '#0000ff',
                        },
                    ],
                })?.valueColor,
            ).toBe('light-dark(#00ff00, #88ff88)');
        });

        it('reuses the light colour when no dark colour is set', async () => {
            const model = await buildSpecModel({ revenue_sum: 5 }, ['revenue']);

            expect(
                model.getSpec({
                    conditionalFormatting: [
                        {
                            operator: FilterOperator.LESS_THAN_OR_EQUAL,
                            value: 5,
                            color: '#ff0000',
                        },
                    ],
                })?.valueColor,
            ).toBe('light-dark(#ff0000, #ff0000)');
        });

        it('leaves the value uncoloured when no rule matches', async () => {
            const model = await buildSpecModel({ revenue_sum: 5 }, ['revenue']);

            expect(
                model.getSpec({
                    conditionalFormatting: [
                        {
                            operator: FilterOperator.GREATER_THAN,
                            value: 10,
                            color: '#ff0000',
                        },
                    ],
                })?.valueColor,
            ).toBeUndefined();
        });

        it('handles a missing comparison value', async () => {
            const model = await buildSpecModel(
                { revenue_sum: 100, target_sum: null },
                ['revenue', 'target'],
            );

            expect(
                model.getSpec({ showComparison: true })?.comparison,
            ).toMatchObject({
                direction: ComparisonDiffTypes.UNDEFINED,
                formattedValue: 'n/a',
            });
        });
    });
});
