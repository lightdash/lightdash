import {
    DimensionType,
    VizAggregationOptions,
    VizIndexType,
    type ResultColumn,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildComposerChartSpec,
    buildComposerPivotSpec,
} from './composerChartSpec';

const column = (reference: string, type: DimensionType): ResultColumn => ({
    reference,
    type,
});
const status = column('status', DimensionType.STRING);
const n = column('n', DimensionType.NUMBER);
const columns = [status, n];
const rows = [
    { status: 'a', n: 3 },
    { status: 'b', n: 1 },
];
const colors = ['#111', '#222'];

const build = (kind: Parameters<typeof buildComposerChartSpec>[0]['kind']) =>
    buildComposerChartSpec({
        kind,
        columns,
        rows,
        x: kind === 'big_number' ? null : status,
        y: [n],
        colors,
    });

const echarts = async (kind: Parameters<typeof build>[0]) => {
    const spec = await build(kind);
    if (spec.kind !== 'echarts') throw new Error('expected an ECharts spec');
    return spec.option;
};

describe('buildComposerChartSpec', () => {
    it('draws one bar series over a category x axis', async () => {
        const option = await echarts('bar');
        expect(option.series).toHaveLength(1);
        expect(option.series[0].type).toBe('bar');
        expect(option.xAxis.type).toBe('category');
        expect(option.dataset.source).toEqual([
            { status: 'a', n: 3 },
            { status: 'b', n: 1 },
        ]);
    });

    it('draws a line series', async () => {
        const option = await echarts('line');
        expect(option.series.map((s: { type: string }) => s.type)).toEqual([
            'line',
        ]);
    });

    it('draws one pie slice per row in the palette', async () => {
        const option = await echarts('pie');
        expect(option.color).toEqual(colors);
        expect(option.series[0].type).toBe('pie');
        expect(option.series[0].data).toEqual([
            expect.objectContaining({ name: 'a', value: 3 }),
            expect.objectContaining({ name: 'b', value: 1 }),
        ]);
    });

    it('builds a big number from the value column', async () => {
        const spec = await buildComposerChartSpec({
            kind: 'big_number',
            columns,
            rows: [rows[0]],
            x: null,
            y: [n],
            colors,
        });
        expect(spec).toEqual({
            kind: 'big_number',
            spec: expect.objectContaining({ value: 3, label: 'n' }),
        });
    });
});

describe('buildComposerChartSpec with two values', () => {
    it('draws one bar series per y column', async () => {
        const m = column('m', DimensionType.NUMBER);
        const spec = await buildComposerChartSpec({
            kind: 'bar',
            columns: [status, n, m],
            rows: [
                { status: 'a', n: 3, m: 5 },
                { status: 'b', n: 1, m: 2 },
            ],
            x: status,
            y: [n, m],
            colors,
        });
        if (spec.kind !== 'echarts') throw new Error('expected ECharts');
        expect(spec.option.series).toHaveLength(2);
    });
});

describe('buildComposerPivotSpec', () => {
    it('builds a big number from an aggregated pivot without an index', async () => {
        const spec = await buildComposerPivotSpec({
            kind: 'big_number',
            result: {
                pivotChartData: {
                    queryUuid: 'q',
                    fileUrl: undefined,
                    results: [{ n_sum: 4 }],
                    indexColumn: undefined,
                    valuesColumns: [
                        {
                            referenceField: 'n',
                            pivotColumnName: 'n_sum',
                            aggregation: VizAggregationOptions.SUM,
                            pivotValues: [],
                        },
                    ],
                    columns: [{ reference: 'n_sum' }],
                    columnCount: 1,
                },
                originalColumns: { n },
            },
            layout: {
                x: undefined,
                y: [{ reference: 'n', aggregation: VizAggregationOptions.SUM }],
                groupBy: [],
            },
            colors,
        });
        expect(spec).toEqual({
            kind: 'big_number',
            spec: expect.objectContaining({ value: 4 }),
        });
    });

    it('draws one line per groupBy value from the pivoted result', async () => {
        const valuesColumn = (region: string) => ({
            referenceField: 'revenue',
            pivotColumnName: `revenue_sum_region_${region}`,
            aggregation: VizAggregationOptions.SUM,
            pivotValues: [{ referenceField: 'region', value: region }],
        });
        const spec = await buildComposerPivotSpec({
            kind: 'line',
            result: {
                pivotChartData: {
                    queryUuid: 'q',
                    fileUrl: undefined,
                    results: [
                        {
                            month: '2024-01-01',
                            revenue_sum_region_eu: 10,
                            revenue_sum_region_us: 20,
                        },
                        {
                            month: '2024-02-01',
                            revenue_sum_region_eu: 30,
                            revenue_sum_region_us: null,
                        },
                    ],
                    indexColumn: {
                        reference: 'month',
                        type: VizIndexType.TIME,
                    },
                    valuesColumns: [valuesColumn('eu'), valuesColumn('us')],
                    columns: [
                        { reference: 'month' },
                        { reference: 'revenue_sum_region_eu' },
                        { reference: 'revenue_sum_region_us' },
                    ],
                    columnCount: 3,
                },
                originalColumns: {
                    month: column('month', DimensionType.DATE),
                    region: column('region', DimensionType.STRING),
                    revenue: column('revenue', DimensionType.NUMBER),
                },
            },
            layout: {
                x: { reference: 'month', type: VizIndexType.TIME },
                y: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupBy: [{ reference: 'region' }],
            },
            colors,
        });
        if (spec.kind !== 'echarts') throw new Error('expected ECharts');
        const { option } = spec;
        expect(option.series.map((s: { type: string }) => s.type)).toEqual([
            'line',
            'line',
        ]);
        expect(option.dataset.source).toHaveLength(2);
    });
});
