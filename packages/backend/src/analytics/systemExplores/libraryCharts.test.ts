import { ChartType, type ChartAsCode } from '@lightdash/common';
import {
    libraryChartFields,
    withLibraryCharts,
    type LibraryChartBinding,
} from './libraryCharts';
import { analyticsContentAsCode } from './sampleContent';
import { analyticsLibraryChartBindings } from './usageDashboards';

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
                ...metricQuery.dimensions,
                ...metricQuery.metrics,
                ...(metricQuery.tableCalculations ?? []).map((c) => c.name),
            ];
            Object.values(b.fieldMapping)
                .flat()
                .forEach((id) => {
                    expect(known).toContain(id);
                });
        });
    });

    it('has a chart for every binding', () => {
        entries.forEach(([slug]) => {
            expect(chartFor(slug)).toBeDefined();
        });
    });
});
