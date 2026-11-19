import {
    ChartType,
    type ChartAsCode,
    type DataAppVizSchema,
} from '@lightdash/common';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import {
    libraryChartFields,
    withLibraryCharts,
    type LibraryChartBinding,
    type UsableLibraryChartType,
} from './libraryCharts';
import {
    analyticsContentAsCode,
    analyticsLibraryChartBindings,
    legacyLibraryChartBindings,
} from './sampleContent';

const allCharts = analyticsContentAsCode.flatMap(({ charts }) => charts);

const chart: ChartAsCode = {
    ...allCharts[0],
    slug: 'd-c',
    metricQuery: {
        ...allCharts[0].metricQuery,
        dimensions: ['t_a', 't_b'],
        metrics: ['t_m'],
    },
};

const binding: LibraryChartBinding = {
    slug: 'heatmap',
    minVersion: '0.4.0',
    fieldMapping: { x: 't_a', y: 't_b', value: 't_m' },
    optionValues: {},
    query: null,
};

const heatmapSchema: DataAppVizSchema = {
    fields: [
        { name: 'x', label: 'X', type: 'dimension', required: true },
        { name: 'y', label: 'Y', type: 'dimension', required: true },
        { name: 'value', label: 'Value', type: 'metric', required: true },
    ],
    configOptions: [
        {
            type: 'boolean',
            name: 'showLabels',
            label: 'Show labels',
            default: false,
        },
    ],
    colorPalette: null,
};

const usable = new Map<string, UsableLibraryChartType>([
    [
        'heatmap',
        {
            appSlug: 'heatmap-1',
            vizSchema: heatmapSchema,
            registryVersion: '0.4.0',
        },
    ],
]);

describe('withLibraryCharts', () => {
    const swap = (
        charts: ChartAsCode[],
        bindings: ReadonlyMap<string, LibraryChartBinding>,
        types: ReadonlyMap<string, UsableLibraryChartType> = usable,
    ) => withLibraryCharts(charts, bindings, types);
    const query = {
        dimensions: ['t_a', 't_b'],
        metrics: ['t_m', 't_n'],
        sorts: [{ fieldId: 't_a', descending: false }],
        limit: 7,
        description: 'Library description',
    };

    it('swaps the config when the type is usable', () => {
        const {
            charts: [out],
            rejected,
        } = swap([chart], new Map([['d-c', binding]]));
        expect(out.chartConfig).toEqual({
            type: ChartType.DATA_APP_VIZ,
            config: {
                dataAppVizSlug: 'heatmap-1',
                fieldMapping: binding.fieldMapping,
                optionValues: {},
            },
        });
        expect(out.metricQuery).toEqual(chart.metricQuery);
        expect(rejected).toEqual([]);
    });

    it('runs the binding query in place of the fallback query', () => {
        const {
            charts: [out],
        } = swap([chart], new Map([['d-c', { ...binding, query }]]));
        expect(out.metricQuery.dimensions).toEqual(query.dimensions);
        expect(out.metricQuery.metrics).toEqual(query.metrics);
        expect(out.metricQuery.sorts).toEqual(query.sorts);
        expect(out.metricQuery.limit).toBe(7);
        expect(out.metricQuery.filters).toEqual(chart.metricQuery.filters);
        expect(out.metricQuery.exploreName).toBe(chart.metricQuery.exploreName);
        expect(out.tableConfig?.columnOrder).toEqual([
            't_a',
            't_b',
            't_m',
            't_n',
        ]);
        expect(out.chartConfig.type).toBe(ChartType.DATA_APP_VIZ);
        expect(out.slug).toBe(chart.slug);
    });

    it('uses the binding query description when the binding has its own query', () => {
        const {
            charts: [out],
        } = swap(
            [{ ...chart, description: 'Fallback description' }],
            new Map([['d-c', { ...binding, query }]]),
        );
        expect(out.description).toBe('Library description');
    });

    it('keeps the chart description when the binding has no query', () => {
        const {
            charts: [out],
        } = swap(
            [{ ...chart, description: 'Fallback description' }],
            new Map([['d-c', binding]]),
        );
        expect(out.description).toBe('Fallback description');
    });

    const tableCalc = {
        name: 'calc',
        displayName: 'Calc',
        sql: '${t_a}',
    } as NonNullable<ChartAsCode['metricQuery']['tableCalculations']>[number];
    const chartWithCalc: ChartAsCode = {
        ...chart,
        metricQuery: { ...chart.metricQuery, tableCalculations: [tableCalc] },
    };

    it('drops table calculations when the binding has its own query', () => {
        const {
            charts: [out],
        } = swap([chartWithCalc], new Map([['d-c', { ...binding, query }]]));
        expect(out.metricQuery.tableCalculations).toEqual([]);
    });

    it('keeps table calculations when the binding has no query', () => {
        const {
            charts: [out],
        } = swap([chartWithCalc], new Map([['d-c', binding]]));
        expect(out.metricQuery.tableCalculations).toEqual([tableCalc]);
    });

    it('accepts a table calculation mapped from the fallback query', () => {
        const {
            charts: [out],
            rejected,
        } = swap(
            [chartWithCalc],
            new Map([
                [
                    'd-c',
                    {
                        ...binding,
                        fieldMapping: {
                            ...binding.fieldMapping,
                            value: 'calc',
                        },
                    },
                ],
            ]),
        );
        expect(rejected).toEqual([]);
        expect(out.chartConfig.type).toBe(ChartType.DATA_APP_VIZ);
    });

    it('keeps the fallback query when the binding has no query', () => {
        const {
            charts: [out],
        } = swap([chart], new Map([['d-c', binding]]));
        expect(out.metricQuery).toEqual(chart.metricQuery);
        expect(out.tableConfig).toEqual(chart.tableConfig);
    });

    it('returns the same chart object when the type is not usable', () => {
        const result = swap([chart], new Map([['d-c', binding]]), new Map());
        expect(result.charts[0]).toBe(chart);
        expect(result.rejected).toEqual([]);
    });

    it('returns the same chart object when the chart has no binding', () => {
        expect(swap([chart], new Map()).charts[0]).toBe(chart);
    });

    describe('validation against the installed type', () => {
        const rejects = (invalid: LibraryChartBinding) => {
            const result = swap([chart], new Map([['d-c', invalid]]));
            expect(result.charts[0]).toBe(chart);
            expect(result.rejected).toEqual([
                {
                    chartSlug: 'd-c',
                    typeSlug: 'heatmap',
                    reason: 'schema',
                    errors: [expect.any(String)],
                },
            ]);
            return result.rejected[0].errors[0];
        };

        it('rejects a field name the type does not declare', () => {
            expect(
                rejects({
                    ...binding,
                    fieldMapping: { ...binding.fieldMapping, size: 't_m' },
                }),
            ).toMatch(/Unknown field slots in fieldMapping: size/);
        });

        it('rejects a binding that leaves a required field unmapped', () => {
            expect(
                rejects({
                    ...binding,
                    fieldMapping: { x: 't_a', value: 't_m' },
                }),
            ).toMatch(/Required field slots not bound in fieldMapping: y/);
        });

        it('rejects a field that is not in the query the chart runs', () => {
            expect(
                rejects({
                    ...binding,
                    query: { ...query, dimensions: ['t_a'] },
                }),
            ).toMatch(/not selected in queryConfig: y → t_b/);
        });

        it('rejects a field of the wrong kind', () => {
            expect(
                rejects({
                    ...binding,
                    fieldMapping: { x: 't_a', y: 't_m', value: 't_m' },
                }),
            ).toMatch(/Slot "y" \(dimension\) only accepts dimensions/);
        });

        it('rejects an option the type does not declare', () => {
            expect(
                rejects({ ...binding, optionValues: { stacked: true } }),
            ).toMatch(/Unknown option "stacked"/);
        });

        it('rejects an option value of the wrong type', () => {
            expect(
                rejects({ ...binding, optionValues: { showLabels: 'yes' } }),
            ).toMatch(/Option "showLabels" \(boolean\) expects true or false/);
        });

        it('still swaps another chart with a valid binding', () => {
            const other: ChartAsCode = { ...chart, slug: 'd-other' };
            const result = swap(
                [chart, other],
                new Map([
                    [
                        'd-c',
                        { ...binding, optionValues: { showLabels: 'yes' } },
                    ],
                    ['d-other', binding],
                ]),
            );
            expect(result.charts[0]).toBe(chart);
            expect(result.charts[1].chartConfig.type).toBe(
                ChartType.DATA_APP_VIZ,
            );
            expect(result.rejected.map(({ chartSlug }) => chartSlug)).toEqual([
                'd-c',
            ]);
        });
    });

    describe('version each binding needs', () => {
        const older: ChartAsCode = { ...chart, slug: 'd-older' };
        const newer: ChartAsCode = { ...chart, slug: 'd-newer' };
        const bindings = new Map([
            ['d-older', { ...binding, minVersion: '0.6.0' }],
            ['d-newer', { ...binding, minVersion: '0.7.0' }],
        ]);
        const installedAt = (registryVersion: string) =>
            new Map([
                [
                    'heatmap',
                    {
                        appSlug: 'heatmap-1',
                        vizSchema: heatmapSchema,
                        registryVersion,
                    },
                ],
            ]);

        it('swaps only the charts whose binding the installed version meets', () => {
            const result = swap([older, newer], bindings, installedAt('0.6.0'));
            expect(result.charts[0].chartConfig.type).toBe(
                ChartType.DATA_APP_VIZ,
            );
            expect(result.charts[1]).toBe(newer);
            expect(result.rejected).toEqual([
                {
                    chartSlug: 'd-newer',
                    typeSlug: 'heatmap',
                    reason: 'version',
                    errors: ['needs 0.7.0, installed 0.6.0'],
                },
            ]);
        });

        it('swaps every chart when the installed version meets all bindings', () => {
            const result = swap([older, newer], bindings, installedAt('0.7.0'));
            expect(
                result.charts.map(({ chartConfig }) => chartConfig.type),
            ).toEqual([ChartType.DATA_APP_VIZ, ChartType.DATA_APP_VIZ]);
            expect(result.rejected).toEqual([]);
        });

        it('swaps nothing when the installed version cannot be compared', () => {
            const result = swap(
                [older, newer],
                bindings,
                installedAt('not-a-version'),
            );
            expect(result.charts[0]).toBe(older);
            expect(result.charts[1]).toBe(newer);
            expect(result.rejected.map(({ reason }) => reason)).toEqual([
                'version',
                'version',
            ]);
        });
    });
});

describe('analyticsLibraryChartBindings', () => {
    const entries = [...analyticsLibraryChartBindings.entries()];
    const chartFor = (slug: string) => allCharts.find((c) => c.slug === slug);

    it('uses a known library chart', () => {
        entries.forEach(([, b]) => {
            expect(Object.keys(libraryChartFields)).toContain(b.slug);
        });
    });

    it('maps only field names the type accepts', () => {
        entries.forEach(([, b]) => {
            const { fields } = libraryChartFields[b.slug];
            Object.keys(b.fieldMapping).forEach((key) => {
                expect(fields).toContain(key);
            });
        });
    });

    it('maps every required field', () => {
        entries.forEach(([, b]) => {
            const { required } = libraryChartFields[b.slug];
            required.forEach((key) => {
                expect(Object.keys(b.fieldMapping)).toContain(key);
            });
        });
    });

    it('maps only fields in the chart query', () => {
        entries.forEach(([slug, b]) => {
            const { metricQuery } = chartFor(slug)!;
            const known = [
                ...(b.query ?? metricQuery).dimensions,
                ...(b.query ?? metricQuery).metrics,
                ...(metricQuery.tableCalculations ?? []).map((c) => c.name),
            ];
            Object.values(b.fieldMapping)
                .flat()
                .forEach((id) => {
                    expect(known).toContain(id);
                });
        });
    });

    it('maps only dimensions and metrics of a binding query', () => {
        entries.forEach(([, b]) => {
            if (!b.query) return;
            const known = [...b.query.dimensions, ...b.query.metrics];
            Object.values(b.fieldMapping)
                .flat()
                .forEach((id) => {
                    expect(known).toContain(id);
                });
        });
    });

    it('a binding query uses only fields that exist in its chart explore', () => {
        const explores = createAnalyticsExplores();
        entries.forEach(([slug, b]) => {
            if (!b.query) return;
            const explore = explores.find(
                ({ name }) => name === chartFor(slug)!.metricQuery.exploreName,
            )!;
            const fieldIds = Object.entries(explore.tables).flatMap(
                ([table, { dimensions, metrics }]) =>
                    [...Object.keys(dimensions), ...Object.keys(metrics)].map(
                        (name) => `${table}_${name}`,
                    ),
            );
            [...b.query.dimensions, ...b.query.metrics].forEach((id) => {
                expect(fieldIds).toContain(id);
            });
        });
    });

    // A schema that accepts exactly what the binding maps, so the real swap runs.
    const schemaAccepting = (b: LibraryChartBinding): DataAppVizSchema => ({
        fields: Object.entries(b.fieldMapping).map(([name, value]) => ({
            name,
            label: name,
            type: 'column',
            required: false,
            multiple: Array.isArray(value),
        })),
        configOptions: Object.entries(b.optionValues).map(([name, value]) => {
            if (typeof value === 'boolean') {
                return { type: 'boolean', name, label: name, default: value };
            }
            if (typeof value === 'number') {
                return { type: 'number', name, label: name, default: value };
            }
            if (typeof value === 'string') {
                return { type: 'text', name, label: name, default: value };
            }
            return { type: 'gradient', name, label: name, default: value };
        }),
        colorPalette: null,
    });

    it('keeps sorts within the query a library chart runs', () => {
        entries.forEach(([slug, b]) => {
            if (!b.query) return;
            const queryFields = [...b.query.dimensions, ...b.query.metrics];
            b.query.sorts.forEach(({ fieldId }) => {
                expect(queryFields).toContain(fieldId);
            });
            const {
                charts: [out],
                rejected,
            } = withLibraryCharts(
                [chartFor(slug)!],
                new Map([[slug, b]]),
                new Map([
                    [
                        b.slug,
                        {
                            appSlug: b.slug,
                            vizSchema: schemaAccepting(b),
                            registryVersion: b.minVersion,
                        },
                    ],
                ]),
            );
            expect(rejected).toEqual([]);
            expect(out.chartConfig.type).toBe(ChartType.DATA_APP_VIZ);
            out.metricQuery.sorts.forEach(({ fieldId }) => {
                expect(queryFields).toContain(fieldId);
            });
            expect(out.pivotConfig).toBeUndefined();
        });
    });

    it('has a chart for every binding', () => {
        entries.forEach(([slug]) => {
            expect(chartFor(slug)).toBeDefined();
        });
    });
});

describe('legacyLibraryChartBindings', () => {
    it('keys a sample chart binding by its final slug', () => {
        const map = legacyLibraryChartBindings([
            {
                key: 'dash',
                charts: [
                    { ...allCharts[0], key: 'with', libraryChart: binding },
                    { ...allCharts[0], key: 'without' },
                ],
            },
        ]);
        expect([...map.keys()]).toEqual(['dash-with']);
        expect(map.get('dash-with')).toBe(binding);
    });

    it('is covered by the combined bindings map', () => {
        const slugs = allCharts.map(({ slug }) => slug);
        [...analyticsLibraryChartBindings.keys()].forEach((slug) => {
            expect(slugs).toContain(slug);
        });
    });

    it('binds the Overview charts under their final slugs', () => {
        const prefix = 'lightdash-analytics-overview-';
        [
            'ai-calls',
            'tokens',
            'output-tokens',
            'ai-users',
            'ai-calls-by-day',
            'tokens-by-day',
        ].forEach((key) => {
            expect(analyticsLibraryChartBindings.has(`${prefix}${key}`)).toBe(
                true,
            );
        });
        ['tokens-by-model', 'calls-by-model'].forEach((key) => {
            expect(analyticsLibraryChartBindings.has(`${prefix}${key}`)).toBe(
                false,
            );
        });
    });

    it('shows the latest day and daily trend on the AI users card', () => {
        expect(
            analyticsLibraryChartBindings.get(
                'lightdash-analytics-overview-ai-users',
            ),
        ).toEqual({
            slug: 'big-number-with-sparkline-trend',
            minVersion: '0.7.1',
            fieldMapping: {
                value: 'ai_usage_unique_users',
                sparklineMetric: 'ai_usage_unique_users',
                time: 'ai_usage_event_ts_day',
            },
            optionValues: {
                valueAggregation: 'latest',
                showComparison: false,
                colorSparklineByTrend: false,
                showLabel: true,
                label: 'Latest day',
                showCardBorder: false,
                showCardShadow: false,
            },
            query: {
                dimensions: ['ai_usage_event_ts_day'],
                metrics: ['ai_usage_unique_users'],
                sorts: [
                    { fieldId: 'ai_usage_event_ts_day', descending: false },
                ],
                limit: 500,
                description:
                    'People who used AI on the latest day in the selected period, with the daily trend. A person active on several days is counted on each of those days.',
            },
        });
    });

    it('binds the Queries Overview charts under their final slugs', () => {
        const prefix = 'lightdash-analytics-query-activity-';
        const queryBinding = (key: string) =>
            analyticsLibraryChartBindings.get(`${prefix}${key}`);
        expect(queryBinding('queries')).toMatchObject({
            slug: 'big-number-with-sparkline-trend',
            minVersion: '0.7.1',
            optionValues: {
                valueAggregation: 'sum',
                colorSparklineByTrend: false,
                showLabel: false,
                showCardBorder: false,
                showCardShadow: false,
            },
        });
        ['query-users', 'avg-execution-time', 'p90-execution-time'].forEach(
            (key) => {
                expect(queryBinding(key)).toMatchObject({
                    slug: 'big-number-with-sparkline-trend',
                    minVersion: '0.7.1',
                    optionValues: {
                        valueAggregation: 'latest',
                        showComparison: false,
                        colorSparklineByTrend: false,
                        showLabel: true,
                        label: 'Latest day',
                        showCardBorder: false,
                        showCardShadow: false,
                    },
                });
                expect(queryBinding(key)?.query?.dimensions).toEqual([
                    'query_events_event_ts_day',
                ]);
                expect(queryBinding(key)?.query?.description).toContain(
                    'latest day in the selected period, with the daily trend.',
                );
            },
        );
        expect(queryBinding('queries-by-day')).toMatchObject({
            slug: 'customizable-cartesian-chart',
            minVersion: '0.17.1',
            fieldMapping: {
                x: 'query_events_event_ts_day',
                m1: 'query_events_total_queries',
                splitBy: 'query_events_context',
            },
            optionValues: { splitTopN: 6 },
        });
        [
            'warehouse-versus-cached-demand',
            'active-users-by-day',
            'query-cache',
            'queries-by-context',
            'query-latency-by-day',
            'query-calendar',
        ].forEach((key) => {
            expect(queryBinding(key)).toBeUndefined();
        });
    });

    it('runs the day query on the real AI calls chart only when its type is usable', () => {
        const slug = 'lightdash-analytics-overview-ai-calls';
        const real = allCharts.find((c) => c.slug === slug)!;
        const bigNumberSchema: DataAppVizSchema = {
            fields: ['value', 'sparklineMetric', 'time'].map((name) => ({
                name,
                label: name,
                type: 'column',
                required: false,
            })),
            configOptions: [
                {
                    type: 'text',
                    name: 'valueAggregation',
                    label: 'Aggregation',
                    default: 'last',
                },
                {
                    type: 'text',
                    name: 'style',
                    label: 'Number format',
                    default: 'default',
                },
                {
                    type: 'boolean',
                    name: 'colorSparklineByTrend',
                    label: 'Colour by trend',
                    default: true,
                },
                {
                    type: 'boolean',
                    name: 'showLabel',
                    label: 'showLabel',
                    default: true,
                },
                {
                    type: 'text',
                    name: 'label',
                    label: 'label',
                    default: '',
                },
                {
                    type: 'boolean',
                    name: 'showCardBorder',
                    label: 'showCardBorder',
                    default: true,
                },
                {
                    type: 'boolean',
                    name: 'showCardShadow',
                    label: 'showCardShadow',
                    default: true,
                },
            ],
            colorPalette: null,
        };
        const {
            charts: [swapped],
            rejected,
        } = withLibraryCharts(
            [real],
            analyticsLibraryChartBindings,
            new Map([
                [
                    'big-number-with-sparkline-trend',
                    {
                        appSlug: 'big-number-1',
                        vizSchema: bigNumberSchema,
                        registryVersion:
                            analyticsLibraryChartBindings.get(slug)!.minVersion,
                    },
                ],
            ]),
        );
        expect(rejected).toEqual([]);
        expect(swapped.chartConfig.type).toBe(ChartType.DATA_APP_VIZ);
        expect(swapped.metricQuery.dimensions).toEqual([
            'ai_usage_event_ts_day',
        ]);
        expect(swapped.description).toBe(real.description);
        const {
            charts: [plain],
        } = withLibraryCharts([real], analyticsLibraryChartBindings, new Map());
        expect(plain).toBe(real);
    });

    it('describes each library rendering that runs its own query', () => {
        const queryDescription = (slug: string) =>
            analyticsLibraryChartBindings.get(slug)?.query?.description;
        const chartDescription = (slug: string) =>
            allCharts.find((c) => c.slug === slug)?.description;
        [
            'lightdash-analytics-overview-ai-calls',
            'lightdash-analytics-overview-tokens',
            'lightdash-analytics-overview-output-tokens',
            'lightdash-analytics-overview-ai-calls-by-day',
            'lightdash-analytics-overview-tokens-by-day',
        ].forEach((slug) => {
            expect(queryDescription(slug)).toBe(chartDescription(slug));
        });
        expect(
            queryDescription('lightdash-analytics-query-activity-queries'),
        ).toBe(chartDescription('lightdash-analytics-query-activity-queries'));
        expect(
            queryDescription(
                'lightdash-analytics-query-activity-queries-by-day',
            ),
        ).toBe(
            `Queries per day, split by the six contexts that ran the most, with the rest grouped as Other. ${chartDescription('lightdash-analytics-query-activity-queries-by-day')}`,
        );
        const agentChart = (key: string) =>
            [...analyticsLibraryChartBindings.keys()].find((slug) =>
                slug.endsWith(`-${key}`),
            )!;
        expect(queryDescription(agentChart('agent-adoption-by-week'))).toBe(
            'Requests per person and agent over the selected period. People without a display name are grouped as Unknown user. This is not an eligible-user adoption rate.',
        );
        expect(
            queryDescription(
                agentChart('ai-consumption-by-person-feature-and-model'),
            ),
        ).toBe(
            'Top 24 person and model pairs by tokens over the selected period, so a person near the cut-off can be missing smaller models. People without a display name are grouped as Unknown user. Tokens are not monetary cost.',
        );
        expect(queryDescription(agentChart('agent-requests-trend'))).toBe(
            chartDescription(agentChart('agent-requests-trend')),
        );
        expect(
            queryDescription(
                agentChart('agent-retries-latency-and-consumption'),
            ),
        ).toBe(
            'Requests and average request latency by captured retry count. Agent steps are not equivalent to retries.',
        );
    });
});
