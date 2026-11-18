import { ChartType, type ChartAsCode } from '@lightdash/common';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import {
    libraryChartFields,
    withLibraryCharts,
    type LibraryChartBinding,
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

describe('withLibraryCharts', () => {
    it('swaps the config when the type is usable', () => {
        const [out] = withLibraryCharts(
            [chart],
            new Map([['d-c', binding]]),
            new Map([['heatmap', 'heatmap-1']]),
        );
        expect(out.chartConfig).toEqual({
            type: ChartType.DATA_APP_VIZ,
            config: {
                dataAppVizSlug: 'heatmap-1',
                fieldMapping: binding.fieldMapping,
                optionValues: {},
            },
        });
        expect(out.metricQuery).toEqual(chart.metricQuery);
    });

    it('runs the binding query in place of the fallback query', () => {
        const query = {
            dimensions: ['t_a'],
            metrics: ['t_m', 't_n'],
            sorts: [{ fieldId: 't_a', descending: false }],
            limit: 7,
        };
        const [out] = withLibraryCharts(
            [chart],
            new Map([['d-c', { ...binding, query }]]),
            new Map([['heatmap', 'heatmap-1']]),
        );
        expect(out.metricQuery.dimensions).toEqual(query.dimensions);
        expect(out.metricQuery.metrics).toEqual(query.metrics);
        expect(out.metricQuery.sorts).toEqual(query.sorts);
        expect(out.metricQuery.limit).toBe(7);
        expect(out.metricQuery.filters).toEqual(chart.metricQuery.filters);
        expect(out.metricQuery.exploreName).toBe(chart.metricQuery.exploreName);
        expect(out.tableConfig?.columnOrder).toEqual(['t_a', 't_m', 't_n']);
        expect(out.chartConfig.type).toBe(ChartType.DATA_APP_VIZ);
        expect(out.slug).toBe(chart.slug);
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
        const [out] = withLibraryCharts(
            [chartWithCalc],
            new Map([
                [
                    'd-c',
                    {
                        ...binding,
                        query: {
                            dimensions: ['t_b'],
                            metrics: ['t_m'],
                            sorts: [],
                            limit: 5,
                        },
                    },
                ],
            ]),
            new Map([['heatmap', 'heatmap-1']]),
        );
        expect(out.metricQuery.tableCalculations).toEqual([]);
    });

    it('keeps table calculations when the binding has no query', () => {
        const [out] = withLibraryCharts(
            [chartWithCalc],
            new Map([['d-c', binding]]),
            new Map([['heatmap', 'heatmap-1']]),
        );
        expect(out.metricQuery.tableCalculations).toEqual([tableCalc]);
    });

    it('keeps the fallback query when the binding has no query', () => {
        const [out] = withLibraryCharts(
            [chart],
            new Map([['d-c', binding]]),
            new Map([['heatmap', 'heatmap-1']]),
        );
        expect(out.metricQuery).toEqual(chart.metricQuery);
        expect(out.tableConfig).toEqual(chart.tableConfig);
    });

    it('returns the same chart object when the type is not usable', () => {
        expect(
            withLibraryCharts(
                [chart],
                new Map([['d-c', binding]]),
                new Map(),
            )[0],
        ).toBe(chart);
    });

    it('returns the same chart object when the chart has no binding', () => {
        expect(
            withLibraryCharts(
                [chart],
                new Map(),
                new Map([['heatmap', 'heatmap-1']]),
            )[0],
        ).toBe(chart);
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
});
