import {
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    MetricType,
    UnitOfTime,
    type AiSemanticChartArtifactConfig,
    type Explore,
    type ToolRunQueryBuiltinChartConfig,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    applyChartIntent,
    calendarRange,
    getFilterFieldIds,
} from './chartEdits';

const artifact: AiSemanticChartArtifactConfig = {
    source: 'semantic',
    config: {
        title: 'Revenue',
        description: 'Revenue by day and region',
        queryConfig: {
            exploreName: 'orders',
            dimensions: ['orders_date', 'orders_region'],
            metrics: ['orders_revenue'],
            sorts: [],
            limit: 100,
            parameters: null,
            customMetrics: null,
            tableCalculations: null,
            filters: null,
        },
        chartConfig: {
            defaultVizType: 'bar',
            xAxisDimension: 'orders_date',
            yAxisMetrics: ['orders_revenue'],
            groupBy: ['orders_region'],
            xAxisType: 'time',
            stackBars: false,
            lineType: null,
            xAxisLabel: 'Date',
            yAxisLabel: 'Revenue',
            secondaryYAxisMetric: null,
            secondaryYAxisLabel: null,
        },
    },
};

const dimension = (name: string, type: DimensionType, label: string) => ({
    name,
    table: 'orders',
    fieldType: FieldType.DIMENSION,
    type,
    label,
});

const explore = {
    name: 'orders',
    label: 'Orders',
    baseTable: 'orders',
    tables: {
        orders: {
            label: 'Orders',
            dimensions: {
                date: dimension('date', DimensionType.DATE, 'Date'),
                created_at: dimension(
                    'created_at',
                    DimensionType.TIMESTAMP,
                    'Created at',
                ),
                region: dimension('region', DimensionType.STRING, 'Region'),
                status: dimension('status', DimensionType.STRING, 'Status'),
            },
            metrics: {
                revenue: {
                    name: 'revenue',
                    table: 'orders',
                    fieldType: FieldType.METRIC,
                    type: MetricType.SUM,
                    label: 'Revenue',
                },
            },
        },
    },
} as unknown as Explore;

const withQuery = (
    query: Partial<AiSemanticChartArtifactConfig['config']['queryConfig']>,
    chartConfig: Partial<ToolRunQueryBuiltinChartConfig> = {},
): AiSemanticChartArtifactConfig => {
    const next = structuredClone(artifact);
    Object.assign(next.config.queryConfig, query);
    Object.assign(next.config.chartConfig ?? {}, chartConfig);
    return next;
};

const chartOf = (edit: ReturnType<typeof applyChartIntent>) =>
    edit?.config.config.chartConfig;
const rulesOf = (edit: ReturnType<typeof applyChartIntent>) => {
    const filters = edit?.config.config.queryConfig.filters;
    return filters && !('type' in filters) ? filters.dimensions?.rules : null;
};

describe('applyChartIntent', () => {
    describe('presentation', () => {
        it('changes the chart type while preserving the whole query', () => {
            const edit = applyChartIntent({
                intent: { kind: 'chart_type', chartType: 'line' },
                artifact,
                explore,
            });
            expect(edit?.changed).toBe(true);
            expect(chartOf(edit)).toMatchObject({
                defaultVizType: 'line',
                lineType: 'line',
                stackBars: null,
            });
            expect(edit?.config.config.queryConfig).toEqual(
                artifact.config.queryConfig,
            );
        });

        it('maps area onto a line chart with an area line type', () => {
            const edit = applyChartIntent({
                intent: { kind: 'chart_type', chartType: 'area' },
                artifact,
                explore,
            });
            expect(chartOf(edit)).toMatchObject({
                defaultVizType: 'line',
                lineType: 'area',
            });
        });

        it('reports an already-applied presentation without a new version', () => {
            const edit = applyChartIntent({
                intent: { kind: 'chart_type', chartType: 'bar' },
                artifact,
                explore,
            });
            expect(edit).toMatchObject({ changed: false, config: artifact });
        });

        it('swaps only bar charts', () => {
            expect(
                chartOf(
                    applyChartIntent({
                        intent: { kind: 'series', op: 'swap' },
                        artifact,
                        explore,
                    }),
                ),
            ).toMatchObject({ defaultVizType: 'horizontal' });
            expect(
                applyChartIntent({
                    intent: { kind: 'series', op: 'swap' },
                    artifact: withQuery({}, { defaultVizType: 'line' }),
                    explore,
                }),
            ).toBeNull();
        });

        it('stacks only charts that have series', () => {
            expect(
                chartOf(
                    applyChartIntent({
                        intent: { kind: 'series', op: 'stack' },
                        artifact,
                        explore,
                    }),
                ),
            ).toMatchObject({ stackBars: true });
            expect(
                applyChartIntent({
                    intent: { kind: 'series', op: 'stack' },
                    artifact: withQuery({}, { groupBy: null }),
                    explore,
                }),
            ).toBeNull();
        });

        it('splits series by every existing non-axis dimension and never the axis', () => {
            const edit = applyChartIntent({
                intent: { kind: 'series', op: 'split' },
                artifact: withQuery({}, { groupBy: null }),
                explore,
            });
            expect(chartOf(edit)).toMatchObject({
                xAxisDimension: 'orders_date',
                groupBy: ['orders_region'],
            });
            expect(edit?.response).toBe('Split the series by **Region**.');
        });

        it('keeps a plotted table calculation when changing presentation', () => {
            const edit = applyChartIntent({
                intent: { kind: 'chart_type', chartType: 'line' },
                artifact: withQuery(
                    {
                        tableCalculations: [
                            {
                                name: 'growth',
                                displayName: 'Growth',
                                sql: '1',
                                format: null,
                                type: null,
                            },
                        ] as never,
                    },
                    { yAxisMetrics: ['orders_revenue', 'growth'] },
                ),
                explore,
            });
            expect(chartOf(edit)).toMatchObject({
                yAxisMetrics: ['orders_revenue', 'growth'],
            });
        });
    });

    describe('add_field', () => {
        it('adds a same-explore dimension as series while keeping the axis', () => {
            const edit = applyChartIntent({
                intent: {
                    kind: 'add_field',
                    fieldId: 'orders_status',
                    chartType: null,
                },
                artifact,
                explore,
            });
            expect(edit?.config.config.queryConfig.dimensions).toEqual([
                'orders_date',
                'orders_region',
                'orders_status',
            ]);
            expect(chartOf(edit)).toMatchObject({
                xAxisDimension: 'orders_date',
                groupBy: ['orders_region', 'orders_status'],
            });
            expect(edit?.response).toBe('Added **Status**.');
        });

        it('makes the new field the axis of a table being charted', () => {
            const edit = applyChartIntent({
                intent: {
                    kind: 'add_field',
                    fieldId: 'orders_status',
                    chartType: 'bar',
                },
                artifact: withQuery(
                    { dimensions: ['orders_region'] },
                    {
                        defaultVizType: 'table',
                        xAxisDimension: 'orders_region',
                        groupBy: null,
                        xAxisType: 'category',
                    },
                ),
                explore,
            });
            expect(chartOf(edit)).toMatchObject({
                defaultVizType: 'bar',
                xAxisDimension: 'orders_status',
                groupBy: ['orders_region'],
                xAxisType: 'category',
                xAxisLabel: 'Status',
            });
            expect(edit?.response).toBe(
                'Added **Status** and updated the chart.',
            );
        });

        it('uses the added field type for the axis of a metric-only chart', () => {
            const edit = applyChartIntent({
                intent: {
                    kind: 'add_field',
                    fieldId: 'orders_date',
                    chartType: null,
                },
                artifact: withQuery(
                    { dimensions: [] },
                    { xAxisDimension: null, groupBy: null, xAxisType: null },
                ),
                explore,
            });
            expect(chartOf(edit)).toMatchObject({
                xAxisDimension: 'orders_date',
                xAxisType: 'time',
            });
        });

        it('names the explore when the field comes from another one', () => {
            const payments = {
                ...explore,
                name: 'payments',
                label: 'Payments',
                tables: {
                    ...explore.tables,
                    payments: {
                        label: 'Payments',
                        dimensions: {
                            method: {
                                ...dimension(
                                    'method',
                                    DimensionType.STRING,
                                    'Method',
                                ),
                                table: 'payments',
                            },
                        },
                        metrics: {},
                    },
                },
            } as unknown as Explore;
            const edit = applyChartIntent({
                intent: {
                    kind: 'add_field',
                    fieldId: 'payments_method',
                    chartType: null,
                },
                artifact,
                explore: payments,
            });
            expect(edit?.config.config.queryConfig.exploreName).toBe(
                'payments',
            );
            expect(edit?.response).toBe('Added **Method** from **Payments**.');
        });

        it('puts an added date on the axis of a categorical chart', () => {
            const edit = applyChartIntent({
                intent: {
                    kind: 'add_field',
                    fieldId: 'orders_date',
                    chartType: null,
                },
                artifact: withQuery(
                    { dimensions: ['orders_region'] },
                    {
                        xAxisDimension: 'orders_region',
                        groupBy: null,
                        xAxisType: 'category',
                    },
                ),
                explore,
            });
            expect(chartOf(edit)).toMatchObject({
                xAxisDimension: 'orders_date',
                groupBy: ['orders_region'],
                xAxisType: 'time',
            });
        });

        it('rejects fields that are not dimensions of the explore', () => {
            expect(
                applyChartIntent({
                    intent: {
                        kind: 'add_field',
                        fieldId: 'orders_revenue',
                        chartType: null,
                    },
                    artifact,
                    explore,
                }),
            ).toBeNull();
        });
    });

    describe('filters', () => {
        it('filters to the selected values of a query dimension', () => {
            const edit = applyChartIntent({
                intent: {
                    kind: 'filter_values',
                    fieldId: 'orders_region',
                    exclude: false,
                    values: ['North', 'South'],
                },
                artifact,
                explore,
            });
            expect(rulesOf(edit)).toMatchObject([
                {
                    fieldId: 'orders_region',
                    operator: FilterOperator.EQUALS,
                    values: ['North', 'South'],
                },
            ]);
            expect(edit?.response).toBe('Filtered to **North**, **South**.');
        });

        it('accumulates exclusions on the same field', () => {
            const first = applyChartIntent({
                intent: {
                    kind: 'filter_values',
                    fieldId: 'orders_region',
                    exclude: true,
                    values: ['North'],
                },
                artifact,
                explore,
            });
            const second = applyChartIntent({
                intent: {
                    kind: 'filter_values',
                    fieldId: 'orders_region',
                    exclude: true,
                    values: ['South'],
                },
                artifact: first!.config,
                explore,
            });
            expect(rulesOf(second)).toMatchObject([
                {
                    operator: FilterOperator.NOT_EQUALS,
                    values: ['North', 'South'],
                },
            ]);
        });

        it('replaces a period filter on another grain of the same date', () => {
            const yearExplore = structuredClone(explore);
            yearExplore.tables.orders.dimensions.date_year = {
                ...dimension('date_year', DimensionType.DATE, 'Date year'),
                timeIntervalBaseDimensionName: 'date',
            } as (typeof yearExplore.tables.orders.dimensions)[string];
            const edit = applyChartIntent({
                intent: {
                    kind: 'filter_period',
                    fieldId: 'orders_date_year',
                    period: {
                        type: 'calendar',
                        year: 2023,
                        quarter: null,
                        month: null,
                    },
                },
                artifact: withQuery({
                    filters: {
                        type: 'and',
                        dimensions: [
                            {
                                fieldId: 'orders_date',
                                fieldType: DimensionType.DATE,
                                fieldFilterType: FilterType.DATE,
                                operator: FilterOperator.IN_BETWEEN,
                                values: ['2024-01-01', '2024-12-31'],
                            },
                            {
                                fieldId: 'orders_region',
                                fieldType: DimensionType.STRING,
                                fieldFilterType: FilterType.STRING,
                                operator: FilterOperator.EQUALS,
                                values: ['North'],
                            },
                        ],
                        metrics: null,
                        tableCalculations: null,
                    },
                }),
                explore: yearExplore,
            });
            expect(rulesOf(edit)).toMatchObject([
                { fieldId: 'orders_region' },
                {
                    fieldId: 'orders_date_year',
                    operator: FilterOperator.GREATER_THAN_OR_EQUAL,
                    values: ['2023-01-01'],
                },
                {
                    fieldId: 'orders_date_year',
                    operator: FilterOperator.LESS_THAN,
                    values: ['2024-01-01'],
                },
            ]);
            expect(rulesOf(edit)).toHaveLength(3);
        });

        it('applies a trailing time window through the shared resolver', () => {
            const edit = applyChartIntent({
                intent: {
                    kind: 'filter_period',
                    fieldId: 'orders_date',
                    period: { type: 'last', count: 30, unit: 'days' },
                },
                artifact,
                explore,
            });
            expect(rulesOf(edit)).toMatchObject([
                {
                    fieldId: 'orders_date',
                    fieldFilterType: FilterType.DATE,
                    operator: FilterOperator.IN_THE_PAST,
                    values: [30],
                    settings: { unitOfTime: UnitOfTime.days, completed: false },
                },
            ]);
            expect(edit?.response).toBe('Filtered to the last 30 days.');
        });

        it('applies the current calendar period', () => {
            const edit = applyChartIntent({
                intent: {
                    kind: 'filter_period',
                    fieldId: 'orders_date',
                    period: { type: 'current', unit: 'months' },
                },
                artifact,
                explore,
            });
            expect(rulesOf(edit)).toMatchObject([
                { operator: FilterOperator.IN_THE_CURRENT },
            ]);
            expect(edit?.response).toBe('Filtered to this month.');
        });

        it('filters to a previous complete calendar period', () => {
            const edit = applyChartIntent({
                intent: {
                    kind: 'filter_period',
                    fieldId: 'orders_date',
                    period: { type: 'previous', unit: 'years' },
                },
                artifact,
                explore,
            });
            expect(rulesOf(edit)).toMatchObject([
                {
                    operator: FilterOperator.IN_THE_PAST,
                    values: [1],
                    settings: { unitOfTime: UnitOfTime.years, completed: true },
                },
            ]);
            expect(edit?.response).toBe('Filtered to last year.');
        });

        it.each([
            [
                { quarter: null, month: null },
                ['2023-01-01', '2024-01-01'],
                'Filtered to 2023.',
            ],
            [
                { quarter: 1, month: null },
                ['2023-01-01', '2023-04-01'],
                'Filtered to Q1 2023.',
            ],
            [
                { quarter: null, month: 3 },
                ['2023-03-01', '2023-04-01'],
                'Filtered to March 2023.',
            ],
        ] as const)(
            'filters to a named calendar period %j',
            (narrowing, range, response) => {
                const period = {
                    type: 'calendar' as const,
                    year: 2023,
                    ...narrowing,
                };
                expect(calendarRange(period)).toEqual(range);
                const edit = applyChartIntent({
                    intent: {
                        kind: 'filter_period',
                        fieldId: 'orders_date',
                        period,
                    },
                    artifact,
                    explore,
                });
                expect(rulesOf(edit)).toMatchObject([
                    {
                        operator: FilterOperator.GREATER_THAN_OR_EQUAL,
                        values: [range[0]],
                    },
                    { operator: FilterOperator.LESS_THAN, values: [range[1]] },
                ]);
                expect(edit?.response).toBe(response);
            },
        );

        it('rolls December into the next year', () => {
            expect(
                calendarRange({
                    type: 'calendar',
                    year: 2024,
                    quarter: null,
                    month: 12,
                }),
            ).toEqual(['2024-12-01', '2025-01-01']);
        });

        it('keeps the whole last day of a period on a timestamp field', () => {
            const edit = applyChartIntent({
                intent: {
                    kind: 'filter_period',
                    fieldId: 'orders_created_at',
                    period: {
                        type: 'calendar',
                        year: 2024,
                        quarter: null,
                        month: null,
                    },
                },
                artifact,
                explore,
            });
            expect(rulesOf(edit)).toMatchObject([
                {
                    fieldId: 'orders_created_at',
                    operator: FilterOperator.GREATER_THAN_OR_EQUAL,
                },
                {
                    fieldId: 'orders_created_at',
                    operator: FilterOperator.LESS_THAN,
                },
            ]);
            expect(edit?.response).toBe('Filtered to 2024.');
        });

        it('preserves other-field filters and rejects OR groups', () => {
            const base = applyChartIntent({
                intent: {
                    kind: 'filter_period',
                    fieldId: 'orders_date',
                    period: { type: 'last', count: 90, unit: 'days' },
                },
                artifact,
                explore,
            })!.config;
            const edit = applyChartIntent({
                intent: {
                    kind: 'filter_values',
                    fieldId: 'orders_region',
                    exclude: false,
                    values: ['North'],
                },
                artifact: base,
                explore,
            });
            expect(rulesOf(edit)?.map(({ fieldId }) => fieldId)).toEqual([
                'orders_date',
                'orders_region',
            ]);
            const orFilters = structuredClone(base);
            const { filters } = orFilters.config.queryConfig;
            if (filters && !('type' in filters) && filters.dimensions)
                filters.dimensions.connector = 'or';
            expect(
                applyChartIntent({
                    intent: {
                        kind: 'filter_values',
                        fieldId: 'orders_region',
                        exclude: false,
                        values: ['North'],
                    },
                    artifact: orFilters,
                    explore,
                }),
            ).toBeNull();
        });

        it('filters any dimension of the explore but nothing else', () => {
            expect(
                rulesOf(
                    applyChartIntent({
                        intent: {
                            kind: 'filter_values',
                            fieldId: 'orders_status',
                            exclude: false,
                            values: ['completed'],
                        },
                        artifact,
                        explore,
                    }),
                ),
            ).toMatchObject([{ fieldId: 'orders_status' }]);
            expect(
                applyChartIntent({
                    intent: {
                        kind: 'filter_values',
                        fieldId: 'orders_revenue',
                        exclude: false,
                        values: ['1'],
                    },
                    artifact,
                    explore,
                }),
            ).toBeNull();
        });

        it('clears filters', () => {
            const filtered = applyChartIntent({
                intent: {
                    kind: 'filter_values',
                    fieldId: 'orders_region',
                    exclude: false,
                    values: ['North'],
                },
                artifact,
                explore,
            })!.config;
            const edit = applyChartIntent({
                intent: { kind: 'clear_filters' },
                artifact: filtered,
                explore,
            });
            expect(edit?.config.config.queryConfig.filters).toBeNull();
            expect(getFilterFieldIds(filtered)).toEqual(['orders_region']);
        });

        const dateAndRegion = (type: 'and' | 'or') =>
            withQuery({
                filters: {
                    type,
                    dimensions: [
                        {
                            fieldId: 'orders_date',
                            fieldType: DimensionType.DATE,
                            fieldFilterType: FilterType.DATE,
                            operator: FilterOperator.IN_BETWEEN,
                            values: ['2024-01-01', '2024-12-31'],
                        },
                        {
                            fieldId: 'orders_region',
                            fieldType: DimensionType.STRING,
                            fieldFilterType: FilterType.STRING,
                            operator: FilterOperator.EQUALS,
                            values: ['North'],
                        },
                    ],
                    metrics: null,
                    tableCalculations: null,
                },
            });

        it('removes one filter and keeps the others', () => {
            const edit = applyChartIntent({
                intent: { kind: 'remove_filter', fieldId: 'orders_region' },
                artifact: dateAndRegion('and'),
                explore,
            });
            expect(rulesOf(edit)).toMatchObject([{ fieldId: 'orders_date' }]);
            expect(edit?.response).toBe('Removed the **Region** filter.');
        });

        it('clears the filters when the last one is removed', () => {
            const filtered = applyChartIntent({
                intent: {
                    kind: 'filter_values',
                    fieldId: 'orders_region',
                    exclude: false,
                    values: ['North'],
                },
                artifact,
                explore,
            })!.config;
            const edit = applyChartIntent({
                intent: { kind: 'remove_filter', fieldId: 'orders_region' },
                artifact: filtered,
                explore,
            });
            expect(edit?.config.config.queryConfig.filters).toBeNull();
        });

        it('leaves removing from an OR filter group to the agent', () => {
            expect(
                applyChartIntent({
                    intent: { kind: 'remove_filter', fieldId: 'orders_region' },
                    artifact: dateAndRegion('or'),
                    explore,
                }),
            ).toBeNull();
        });

        it('leaves a field the chart is not filtered on to the agent', () => {
            expect(
                applyChartIntent({
                    intent: { kind: 'remove_filter', fieldId: 'orders_status' },
                    artifact: dateAndRegion('and'),
                    explore,
                }),
            ).toBeNull();
        });
    });

    describe('ranges and thresholds', () => {
        it('filters an explicit date range with an exclusive end', () => {
            const edit = applyChartIntent({
                intent: {
                    kind: 'filter_period',
                    fieldId: 'orders_date',
                    period: {
                        type: 'range',
                        start: '2026-05-13',
                        end: '2026-05-21',
                    },
                },
                artifact,
                explore,
            });
            expect(rulesOf(edit)).toMatchObject([
                {
                    fieldId: 'orders_date',
                    operator: FilterOperator.GREATER_THAN_OR_EQUAL,
                    values: ['2026-05-13'],
                },
                {
                    fieldId: 'orders_date',
                    operator: FilterOperator.LESS_THAN,
                    values: ['2026-05-21'],
                },
            ]);
            expect(edit?.response).toBe(
                'Filtered to 13 May 2026 to 20 May 2026.',
            );
        });

        it('filters a chart metric as a group filter', () => {
            const edit = applyChartIntent({
                intent: {
                    kind: 'filter_number',
                    fieldId: 'orders_revenue',
                    comparison: 'gt',
                    values: [1000],
                },
                artifact,
                explore,
            });
            const filters = edit?.config.config.queryConfig.filters;
            expect(
                filters && !('type' in filters) ? filters.metrics?.rules : null,
            ).toMatchObject([
                {
                    fieldId: 'orders_revenue',
                    operator: FilterOperator.GREATER_THAN,
                    values: [1000],
                },
            ]);
            expect(edit?.response).toBe('Filtered to **Revenue** above 1,000.');
        });

        it('only applies thresholds to numbers', () => {
            expect(
                applyChartIntent({
                    intent: {
                        kind: 'filter_number',
                        fieldId: 'orders_region',
                        comparison: 'gt',
                        values: [5],
                    },
                    artifact,
                    explore,
                }),
            ).toBeNull();
        });
    });

    describe('metric and breakdown edits', () => {
        const metric = (name: string, label: string) => ({
            name,
            table: 'orders',
            fieldType: FieldType.METRIC,
            type: MetricType.SUM,
            label,
        });
        const rich = structuredClone(explore);
        Object.assign(rich.tables.orders.metrics, {
            profit: metric('profit', 'Profit'),
            units: metric('units', 'Units'),
        });
        Object.assign(rich.tables.orders.dimensions, {
            date_week: {
                ...dimension('date_week', DimensionType.DATE, 'Date week'),
                timeInterval: 'WEEK',
                timeIntervalBaseDimensionName: 'date',
            },
        });
        const twoMetrics = withQuery(
            {
                metrics: ['orders_revenue', 'orders_profit'],
                sorts: [
                    {
                        fieldId: 'orders_profit',
                        descending: true,
                        nullsFirst: null,
                    },
                ],
            },
            { yAxisMetrics: ['orders_revenue', 'orders_profit'] },
        );
        const queryOf = (edit: ReturnType<typeof applyChartIntent>) =>
            edit?.config.config.queryConfig;

        it('adds a metric to the query and the plotted series', () => {
            const edit = applyChartIntent({
                intent: { kind: 'add_metric', fieldId: 'orders_units' },
                artifact,
                explore: rich,
            });
            expect(queryOf(edit)?.metrics).toEqual([
                'orders_revenue',
                'orders_units',
            ]);
            expect(chartOf(edit)).toMatchObject({
                yAxisMetrics: ['orders_revenue', 'orders_units'],
            });
            expect(edit?.response).toBe('Added **Units**.');
        });

        it('only adds metrics the chart does not show yet', () => {
            for (const fieldId of ['orders_revenue', 'orders_status'])
                expect(
                    applyChartIntent({
                        intent: { kind: 'add_metric', fieldId },
                        artifact,
                        explore: rich,
                    }),
                ).toBeNull();
        });

        it('removes a metric with its sort but never the last one', () => {
            const edit = applyChartIntent({
                intent: { kind: 'remove_metric', fieldId: 'orders_profit' },
                artifact: twoMetrics,
                explore: rich,
            });
            expect(queryOf(edit)).toMatchObject({
                metrics: ['orders_revenue'],
                sorts: [],
            });
            expect(chartOf(edit)).toMatchObject({
                yAxisMetrics: ['orders_revenue'],
            });
            expect(
                applyChartIntent({
                    intent: {
                        kind: 'remove_metric',
                        fieldId: 'orders_revenue',
                    },
                    artifact,
                    explore: rich,
                }),
            ).toBeNull();
        });

        it('swaps a metric everywhere it is used', () => {
            const edit = applyChartIntent({
                intent: {
                    kind: 'swap_metric',
                    fromFieldId: 'orders_profit',
                    toFieldId: 'orders_units',
                },
                artifact: twoMetrics,
                explore: rich,
            });
            expect(queryOf(edit)).toMatchObject({
                metrics: ['orders_revenue', 'orders_units'],
                sorts: [{ fieldId: 'orders_units', descending: true }],
            });
            expect(chartOf(edit)).toMatchObject({
                yAxisMetrics: ['orders_revenue', 'orders_units'],
            });
            expect(edit?.response).toBe(
                'Showing **Units** instead of **Profit**.',
            );
        });

        it('leaves a metric with a metric filter to the agent', () => {
            expect(
                applyChartIntent({
                    intent: {
                        kind: 'swap_metric',
                        fromFieldId: 'orders_revenue',
                        toFieldId: 'orders_units',
                    },
                    artifact: withQuery({
                        filters: {
                            type: 'and',
                            dimensions: null,
                            metrics: [
                                {
                                    fieldId: 'orders_revenue',
                                    fieldType: MetricType.SUM,
                                    fieldFilterType: FilterType.NUMBER,
                                    operator: FilterOperator.GREATER_THAN,
                                    values: [100],
                                },
                            ],
                            tableCalculations: null,
                        },
                    }),
                    explore: rich,
                }),
            ).toBeNull();
        });

        it('removes a series breakdown and keeps the axis', () => {
            const edit = applyChartIntent({
                intent: { kind: 'remove_field', fieldId: 'orders_region' },
                artifact,
                explore: rich,
            });
            expect(queryOf(edit)?.dimensions).toEqual(['orders_date']);
            expect(chartOf(edit)).toMatchObject({
                xAxisDimension: 'orders_date',
                groupBy: null,
            });
            expect(edit?.response).toBe('Removed the **Region** breakdown.');
        });

        it('promotes the series field when the axis is removed', () => {
            const edit = applyChartIntent({
                intent: { kind: 'remove_field', fieldId: 'orders_date' },
                artifact,
                explore: rich,
            });
            expect(chartOf(edit)).toMatchObject({
                xAxisDimension: 'orders_region',
                groupBy: null,
                xAxisType: 'category',
                xAxisLabel: 'Region',
            });
        });

        it('never removes the only breakdown', () => {
            expect(
                applyChartIntent({
                    intent: { kind: 'remove_field', fieldId: 'orders_date' },
                    artifact: withQuery(
                        { dimensions: ['orders_date'] },
                        { groupBy: null },
                    ),
                    explore: rich,
                }),
            ).toBeNull();
        });

        it('swaps a breakdown in place', () => {
            const edit = applyChartIntent({
                intent: {
                    kind: 'swap_field',
                    fromFieldId: 'orders_region',
                    toFieldId: 'orders_status',
                },
                artifact,
                explore: rich,
            });
            expect(queryOf(edit)?.dimensions).toEqual([
                'orders_date',
                'orders_status',
            ]);
            expect(chartOf(edit)).toMatchObject({ groupBy: ['orders_status'] });
        });

        it('changes the time grain of the axis', () => {
            const edit = applyChartIntent({
                intent: {
                    kind: 'change_grain',
                    fromFieldId: 'orders_date',
                    toFieldId: 'orders_date_week',
                },
                artifact,
                explore: rich,
            });
            expect(queryOf(edit)?.dimensions).toEqual([
                'orders_date_week',
                'orders_region',
            ]);
            expect(chartOf(edit)).toMatchObject({
                xAxisDimension: 'orders_date_week',
                xAxisType: 'time',
                xAxisLabel: 'Date week',
            });
            expect(edit?.response).toBe(
                'Showing **Date week** instead of **Date**.',
            );
        });
    });

    describe('sort', () => {
        it('sorts by the implied chart metric and applies a limit', () => {
            const edit = applyChartIntent({
                intent: {
                    kind: 'sort',
                    fieldId: null,
                    descending: true,
                    limit: 5,
                },
                artifact,
                explore,
            });
            expect(edit?.config.config.queryConfig).toMatchObject({
                sorts: [
                    {
                        fieldId: 'orders_revenue',
                        descending: true,
                        nullsFirst: null,
                    },
                ],
                limit: 5,
            });
            expect(edit?.response).toBe(
                'Sorted by **Revenue**, highest first; showing 5.',
            );
        });

        it('only sorts by fields in the query', () => {
            expect(
                applyChartIntent({
                    intent: {
                        kind: 'sort',
                        fieldId: 'orders_status',
                        descending: false,
                        limit: null,
                    },
                    artifact,
                    explore,
                }),
            ).toBeNull();
        });

        it('clears the sort', () => {
            const edit = applyChartIntent({
                intent: { kind: 'clear_sort' },
                artifact: withQuery({
                    sorts: [
                        {
                            fieldId: 'orders_revenue',
                            descending: true,
                            nullsFirst: null,
                        },
                    ],
                }),
                explore,
            });
            expect(edit).toMatchObject({
                changed: true,
                response: 'Cleared the chart sort.',
            });
            expect(edit?.config.config.queryConfig.sorts).toEqual([]);
        });
    });
});
