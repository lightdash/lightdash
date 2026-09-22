import {
    DimensionType,
    FilterOperator,
    FilterType,
    MetricType,
    parseAiArtifactChartConfig,
    UnitOfTime,
    type AiSemanticChartArtifactConfig,
    type Explore,
    type ToolRunQueryBuiltinChartConfig,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { AiDecisionClient } from './AiDecisionClient';
import {
    isChartQueryRefinementRequest,
    isChartUndoRequest,
    parseExactChartEdit,
    resolveChartEdit,
    resolveExactChartQueryEdit,
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

const client = (edit: string, complete = 0.999, dimension = 'keep') =>
    new AiDecisionClient(
        { apiKey: 'test', model: 'test', timeoutMs: 100 },
        async () => {
            const choice = (_key: string, value: string) => ({
                type: 'choice',
                choice: value,
                confidence: 0.99,
                probabilities: { [value]: 1 },
            });
            let grouping = 'split';
            if (dimension === 'keep') grouping = 'keep';
            if (dimension === 'orders_date') grouping = 'none';
            return Response.json({
                model: 'test',
                answers: {
                    edit: choice('edit', edit),
                    complete: { type: 'noul', noul: complete },
                    grouping: choice('grouping', grouping),
                },
            });
        },
    );

const refinementExplore = {
    name: 'orders',
    tables: {
        orders: {
            label: 'Orders',
            dimensions: {
                date: {
                    name: 'date',
                    table: 'orders',
                    fieldType: 'dimension',
                    type: DimensionType.DATE,
                    label: 'Date',
                },
                region: {
                    name: 'region',
                    table: 'orders',
                    fieldType: 'dimension',
                    type: DimensionType.STRING,
                    label: 'Region',
                },
            },
            metrics: {
                revenue: {
                    name: 'revenue',
                    table: 'orders',
                    fieldType: 'metric',
                    type: MetricType.SUM,
                    label: 'Revenue',
                },
            },
        },
    },
} as unknown as Explore;

describe('chart edits', () => {
    it('recognizes only guarded query-refinement and undo commands', () => {
        expect(isChartQueryRefinementRequest('only North')).toBe(true);
        expect(
            isChartQueryRefinementRequest('sort by Revenue descending'),
        ).toBe(true);
        expect(isChartUndoRequest('undo that')).toBe(true);
        expect(isChartQueryRefinementRequest('explain the filters')).toBe(
            false,
        );
    });

    it('filters the sole non-date query dimension through the shared grammar', () => {
        const result = resolveExactChartQueryEdit({
            prompt: 'only North',
            artifact,
            explore: refinementExplore,
        });

        expect(result?.response).toBe('Filtered to **North**.');
        expect(result?.config.config.queryConfig.filters).toMatchObject({
            dimensions: {
                connector: 'and',
                rules: [
                    {
                        fieldId: 'orders_region',
                        operator: 'equals',
                        values: ['North'],
                    },
                ],
            },
        });
    });

    it('supports exact relative-date filters without model inference', () => {
        const result = resolveExactChartQueryEdit({
            prompt: 'last 30 days',
            artifact,
            explore: refinementExplore,
        });

        expect(result?.config.config.queryConfig.filters).toMatchObject({
            dimensions: {
                rules: [
                    {
                        fieldId: 'orders_date',
                        operator: 'inThePast',
                        values: [30],
                        settings: {
                            unitOfTime: 'days',
                            completed: false,
                        },
                    },
                ],
            },
        });
    });

    it('preserves other-field filters and rejects mixed connector patches', () => {
        const filtered = structuredClone(artifact);
        filtered.config.queryConfig.filters = {
            type: 'and',
            dimensions: [
                {
                    fieldId: 'orders_date',
                    fieldType: DimensionType.DATE,
                    fieldFilterType: FilterType.DATE,
                    operator: FilterOperator.IN_THE_PAST,
                    values: [90],
                    settings: {
                        unitOfTime: UnitOfTime.days,
                        completed: false,
                    },
                },
            ],
            metrics: null,
            tableCalculations: null,
        };
        const result = resolveExactChartQueryEdit({
            prompt: 'only North',
            artifact: filtered,
            explore: refinementExplore,
        });
        const resultFilters = result?.config.config.queryConfig.filters;
        expect(
            resultFilters && !('type' in resultFilters)
                ? resultFilters.dimensions?.rules
                : null,
        ).toMatchObject([
            { fieldId: 'orders_date', values: [90] },
            { fieldId: 'orders_region', values: ['North'] },
        ]);

        const orFiltered = structuredClone(filtered);
        orFiltered.config.queryConfig.filters = {
            type: 'or',
            dimensions:
                filtered.config.queryConfig.filters &&
                'type' in filtered.config.queryConfig.filters
                    ? filtered.config.queryConfig.filters.dimensions
                    : null,
            metrics: null,
            tableCalculations: null,
        };
        expect(
            resolveExactChartQueryEdit({
                prompt: 'only North',
                artifact: orFiltered,
                explore: refinementExplore,
            }),
        ).toBeNull();
    });

    it('uses canonical multi-filter grammar and replaces existing rules on the same field', () => {
        const first = resolveExactChartQueryEdit({
            prompt: 'only South',
            artifact,
            explore: refinementExplore,
        });
        expect(first).not.toBeNull();
        const result = resolveExactChartQueryEdit({
            prompt: 'filter: orders_region equals=North AND orders_date inThePast=30{unit:days,completed:false}',
            artifact: first!.config,
            explore: refinementExplore,
        });
        const filters = result?.config.config.queryConfig.filters;
        expect(
            filters && !('type' in filters) ? filters.dimensions?.rules : null,
        ).toMatchObject([
            { fieldId: 'orders_region', values: ['North'] },
            { fieldId: 'orders_date', values: [30] },
        ]);
    });

    it('keeps refinement behavior behind its explicit gate', async () => {
        const evaluate = vi.fn();
        await expect(
            resolveChartEdit({
                decisions: { evaluate },
                prompt: 'only North',
                artifact,
                explore: refinementExplore,
            }),
        ).resolves.toBeNull();
        await expect(
            resolveChartEdit({
                decisions: { evaluate },
                prompt: 'only North',
                artifact,
                explore: refinementExplore,
                allowQueryRefinements: true,
            }),
        ).resolves.toMatchObject({ changed: true });
        expect(evaluate).not.toHaveBeenCalled();
    });

    it('sorts and limits only by selected unambiguous fields', () => {
        const sorted = resolveExactChartQueryEdit({
            prompt: 'sort by Revenue descending',
            artifact,
            explore: refinementExplore,
        });
        expect(sorted?.config.config.queryConfig.sorts).toEqual([
            {
                fieldId: 'orders_revenue',
                descending: true,
                nullsFirst: null,
            },
        ]);

        const top = resolveExactChartQueryEdit({
            prompt: 'top 5',
            artifact,
            explore: refinementExplore,
        });
        expect(top?.config.config.queryConfig).toMatchObject({
            limit: 5,
            sorts: [{ fieldId: 'orders_revenue', descending: true }],
        });
    });

    it('does not add provider latency to ordinary data questions', async () => {
        const fetcher = vi.fn<typeof fetch>();
        const decisions = new AiDecisionClient(
            { apiKey: 'test', model: 'test', timeoutMs: 100 },
            fetcher,
        );
        expect(
            await resolveChartEdit({
                decisions,
                prompt: 'What is revenue by month?',
                artifact,
            }),
        ).toBeNull();
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('creates a valid chart patch while preserving the entire query', async () => {
        const result = await resolveChartEdit({
            decisions: client('line'),
            prompt: 'Make it a line',
            artifact,
        });
        expect(result?.config.config.chartConfig).toMatchObject({
            defaultVizType: 'line',
            lineType: 'line',
            stackBars: null,
        });
        expect(result?.config.config.queryConfig).toEqual(
            artifact.config.queryConfig,
        );
        expect(parseAiArtifactChartConfig(result?.config)).not.toBeNull();
        expect(result?.config.config.description).toBe(
            artifact.config.description,
        );
        expect(artifact.config.chartConfig).toMatchObject({
            defaultVizType: 'bar',
        });
    });

    it('resolves a bare chart type without a provider request', async () => {
        const request = vi.fn<typeof fetch>();
        const result = await resolveChartEdit({
            decisions: new AiDecisionClient(
                { apiKey: 'test', model: 'test', timeoutMs: 100 },
                request,
            ),
            prompt: 'line',
            artifact,
        });

        expect(result?.config.config.chartConfig).toMatchObject({
            defaultVizType: 'line',
            lineType: 'line',
        });
        expect(request).not.toHaveBeenCalled();
    });

    it('resolves an exact as-a-chart request without a provider request', async () => {
        const request = vi.fn<typeof fetch>();
        const result = await resolveChartEdit({
            decisions: new AiDecisionClient(
                { apiKey: 'test', model: 'test', timeoutMs: 100 },
                request,
            ),
            prompt: 'as a bar chart',
            artifact,
        });

        expect(result?.config.config.chartConfig).toMatchObject({
            defaultVizType: 'bar',
        });
        expect(request).not.toHaveBeenCalled();
    });

    it('accepts a high-confidence natural chart refinement', async () => {
        const result = await resolveChartEdit({
            decisions: client('area', 0.95),
            prompt: 'Make it area actually',
            artifact,
        });

        expect(result?.config.config.chartConfig).toMatchObject({
            defaultVizType: 'line',
            lineType: 'area',
        });
    });

    it('falls back when the requested change also needs new data', async () => {
        expect(
            await resolveChartEdit({
                decisions: client('line', 0.1),
                prompt: 'Make it a line and show last year',
                artifact,
            }),
        ).toBeNull();
    });

    it('never puts the x-axis into the series grouping', async () => {
        expect(
            await resolveChartEdit({
                decisions: client('group', 0.999, 'orders_date'),
                prompt: 'Split by date',
                artifact,
            }),
        ).toBeNull();
    });

    it('changes series only to an existing non-axis dimension', async () => {
        const result = await resolveChartEdit({
            decisions: client('group', 0.999, 'orders_region'),
            prompt: 'Split by region',
            artifact,
        });
        expect(result?.config.config.chartConfig).toMatchObject({
            groupBy: ['orders_region'],
        });
        expect(result?.config.config.queryConfig).toEqual(
            artifact.config.queryConfig,
        );
    });

    it('splits by multiple existing dimensions without dropping the result grain', async () => {
        const grouped = structuredClone(artifact);
        grouped.config.queryConfig.dimensions.push('orders_channel');
        const result = await resolveChartEdit({
            decisions: client('group', 0.999, 'orders_region,orders_channel'),
            prompt: 'Split it by region and channel',
            artifact: grouped,
        });
        expect(result?.config.config.chartConfig).toMatchObject({
            groupBy: ['orders_region', 'orders_channel'],
        });
        expect(result?.config.config.queryConfig).toEqual(
            grouped.config.queryConfig,
        );
    });

    it('resolves a complete list of existing field IDs without a provider request', async () => {
        const grouped = structuredClone(artifact);
        grouped.config.queryConfig.dimensions.push('orders_channel');
        const request = vi.fn<typeof fetch>();
        const decisions = new AiDecisionClient(
            { apiKey: 'test', model: 'test', timeoutMs: 100 },
            request,
        );
        const result = await resolveChartEdit({
            decisions,
            prompt: 'Split by orders_channel and orders_region.',
            artifact: grouped,
        });
        expect(result?.config.config.chartConfig).toMatchObject({
            groupBy: ['orders_region', 'orders_channel'],
        });
        expect(result?.changed).toBe(true);
        expect(request).not.toHaveBeenCalled();
    });

    it('recognizes an already-complete edit without rewriting description or creating a new version', async () => {
        const result = await resolveChartEdit({
            decisions: client('group'),
            prompt: 'Split by orders_region.',
            artifact,
        });
        expect(result).toEqual({
            config: artifact,
            changed: false,
            response: 'The chart is already split that way.',
        });
    });

    it('falls back when changing grouping would hide another query dimension', async () => {
        const grouped = structuredClone(artifact);
        grouped.config.queryConfig.dimensions.push('orders_channel');
        expect(
            await resolveChartEdit({
                decisions: client('group', 0.999, 'orders_region'),
                prompt: 'Split by orders_region',
                artifact: grouped,
            }),
        ).toBeNull();
    });

    it.each(['Split it by territory.', 'Split this chart by order territory.'])(
        'resolves a complete label command without a provider request: %s',
        async (prompt) => {
            const request = vi.fn<typeof fetch>();
            const decisions = new AiDecisionClient(
                { apiKey: 'test', model: 'test', timeoutMs: 100 },
                request,
            );
            const explore = {
                name: 'orders',
                tables: {
                    orders: {
                        label: 'Orders',
                        dimensions: {
                            region: {
                                name: 'region',
                                table: 'orders',
                                fieldType: 'dimension',
                                type: DimensionType.STRING,
                                label: 'Territory',
                            },
                        },
                        metrics: {},
                    },
                },
            } as unknown as Explore;
            const result = await resolveChartEdit({
                decisions,
                prompt,
                artifact,
                explore,
            });
            expect(result?.config.config.chartConfig).toMatchObject({
                groupBy: ['orders_region'],
            });
            expect(request).not.toHaveBeenCalled();
        },
    );

    it('falls back when a label names multiple queried fields', async () => {
        const grouped = structuredClone(artifact);
        grouped.config.queryConfig.dimensions.push('orders_channel');
        const dimension = (name: string) => ({
            name,
            table: 'orders',
            fieldType: 'dimension',
            type: DimensionType.STRING,
            label: 'Category',
        });
        const explore = {
            name: 'orders',
            tables: {
                orders: {
                    dimensions: {
                        region: dimension('region'),
                        channel: dimension('channel'),
                    },
                    metrics: {},
                },
            },
        } as unknown as Explore;
        expect(
            await resolveChartEdit({
                decisions: client('none'),
                prompt: 'Split by category.',
                artifact: grouped,
                explore,
            }),
        ).toBeNull();
    });

    it('does not let a compound field label bypass whole-request classification', async () => {
        const explore = {
            name: 'orders',
            tables: {
                orders: {
                    dimensions: {
                        region: {
                            name: 'region',
                            table: 'orders',
                            fieldType: 'dimension',
                            type: DimensionType.STRING,
                            label: 'region and show last year',
                        },
                    },
                    metrics: {},
                },
            },
        } as unknown as Explore;
        expect(
            await resolveChartEdit({
                decisions: client('group', 0.1, 'orders_region'),
                prompt: 'Split by region and show last year',
                artifact,
                explore,
            }),
        ).toBeNull();
    });

    it('does not apply grouping to a chart type without series grouping', async () => {
        const pie = structuredClone(artifact);
        pie.config.chartConfig = {
            ...(pie.config.chartConfig as ToolRunQueryBuiltinChartConfig),
            defaultVizType: 'pie',
        };
        expect(
            await resolveChartEdit({
                decisions: client('group', 0.999, 'orders_region'),
                prompt: 'Split by region',
                artifact: pie,
            }),
        ).toBeNull();
    });

    it('keeps a plotted table calculation when changing presentation', async () => {
        const calculated = structuredClone(artifact);
        calculated.config.queryConfig.tableCalculations = [
            {
                name: 'growth',
                displayName: 'Growth',
                type: 'formula',
                formula: '${orders_revenue} * 2',
                format: null,
                resultType: 'number',
            },
        ];
        calculated.config.chartConfig = {
            ...(calculated.config
                .chartConfig as ToolRunQueryBuiltinChartConfig),
            yAxisMetrics: ['growth'],
        };
        const result = await resolveChartEdit({
            decisions: client('line'),
            prompt: 'Make it a line chart',
            artifact: calculated,
        });
        expect(result?.config.config.chartConfig).toMatchObject({
            yAxisMetrics: ['growth'],
            defaultVizType: 'line',
        });
        expect(result?.config.config.queryConfig).toEqual(
            calculated.config.queryConfig,
        );
    });

    it('falls back on unsupported operations or provider failure', async () => {
        expect(
            await resolveChartEdit({
                decisions: client('none'),
                prompt: 'Make it red',
                artifact,
            }),
        ).toBeNull();
        const offline = new AiDecisionClient(
            { apiKey: 'test', model: 'test', timeoutMs: 100 },
            async () => {
                throw new Error('offline');
            },
        );
        expect(
            await resolveChartEdit({
                decisions: offline,
                prompt: 'Turn the visualization into a trend over time',
                artifact,
            }),
        ).toBeNull();
        expect(
            await resolveChartEdit({
                decisions: offline,
                prompt: 'Make it a line chart',
                artifact,
            }),
        ).not.toBeNull();
    });

    it.each([
        'Make it a line chart and show last year',
        'Make the other chart a line',
        'Explain how to make it a line chart',
        'Make it a pie and save it',
        'Make it a line chart?',
    ])(
        'never partially executes a compound or unclear request: %s',
        (prompt) => {
            expect(parseExactChartEdit(prompt)).toBeNull();
        },
    );

    it('recognizes only complete presentation commands', () => {
        expect(
            parseExactChartEdit('Please make it a horizontal bar chart.'),
        ).toBe('horizontal');
        expect(parseExactChartEdit('Switch to a table')).toBe('table');
        expect(parseExactChartEdit('swap the axes')).toBe('swap');
    });
});
