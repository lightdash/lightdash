import { DimensionType, type ResultColumn } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildComposerChartSpec } from './composerChartSpec';

const column = (reference: string, type: DimensionType): ResultColumn => ({
    reference,
    type,
});
const status = column('status', DimensionType.STRING);
const n = column('n', DimensionType.NUMBER);
const m = column('m', DimensionType.NUMBER);
const columns = [status, n, m];
const rows = [
    { status: 'a', n: 3, m: 30 },
    { status: 'b', n: 1, m: 10 },
];
const colors = ['#111', '#222'];

const build = (kind: Parameters<typeof buildComposerChartSpec>[0]['kind']) =>
    buildComposerChartSpec({
        kind,
        columns,
        rows,
        axes:
            kind === 'big_number'
                ? { x: null, y: n }
                : kind === 'scatter'
                  ? { x: n, y: m }
                  : { x: status, y: n },
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

    it('draws a horizontal bar with the category axis down the side', async () => {
        const option = await echarts('horizontal');
        expect(option.series).toHaveLength(1);
        expect(option.series[0].type).toBe('bar');
        expect(option.yAxis.type).toBe('category');
        expect(option.xAxis.type).toBe('value');
        expect(option.series[0].encode).toEqual({ x: 'n', y: 'status' });
    });

    it('draws a line series', async () => {
        const option = await echarts('line');
        expect(option.series.map((s: { type: string }) => s.type)).toEqual([
            'line',
        ]);
    });

    it('draws a scatter over a numeric x axis', async () => {
        const option = await echarts('scatter');
        expect(option.series.map((s: { type: string }) => s.type)).toEqual([
            'scatter',
        ]);
        expect(option.xAxis.type).toBe('value');
        expect(option.dataset.source).toEqual([
            { n: 3, m: 30 },
            { n: 1, m: 10 },
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

    it('draws one funnel stage per row', async () => {
        const option = await echarts('funnel');
        expect(option.series[0].type).toBe('funnel');
        expect(option.series[0].data).toEqual([
            { name: 'a', value: 3 },
            { name: 'b', value: 1 },
        ]);
    });

    it('builds a big number from the value column', async () => {
        const spec = await buildComposerChartSpec({
            kind: 'big_number',
            columns,
            rows: [rows[0]],
            axes: { x: null, y: n },
            colors,
        });
        expect(spec).toEqual({
            kind: 'big_number',
            spec: expect.objectContaining({ value: 3, label: 'n' }),
        });
    });
});
