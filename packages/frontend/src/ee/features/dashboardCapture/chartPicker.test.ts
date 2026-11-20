import { describe, expect, it } from 'vitest';
import { chartTarget, pickChartAt } from './chartPicker';
import { type ChartHit } from './echartsHit';

const tile = { uuid: 'tile-1', title: 'Revenue per payment method' };
const rect = { x: 10, y: 20, width: 30, height: 40 };

const point = (
    overrides: Partial<Extract<ChartHit, { kind: 'point' }>>,
): ChartHit => ({
    kind: 'point',
    seriesType: 'bar',
    seriesIndex: 0,
    dataIndex: 2,
    seriesName: 'Total revenue',
    name: '',
    value: { payments_method: 'credit_card', payments_total: 1023.4 },
    encode: { x: [0], y: [1] },
    dimensionNames: ['payments_method', 'payments_total'],
    baseAxis: 'x',
    rect,
    ...overrides,
});

describe('chartTarget', () => {
    it('names a bar by its category, series and value, and keeps its tile', () => {
        expect(chartTarget(point({}), tile)).toEqual({
            kind: 'chart-point',
            id: 'tile-1/point/0/2',
            label: 'bar "credit_card" in series "Total revenue" (1,023.4) on "Revenue per payment method"',
            parentId: 'tile-1',
        });
    });

    it('gives two bars of one chart different ids', () => {
        const a = chartTarget(point({ dataIndex: 0 }), tile);
        const b = chartTarget(point({ dataIndex: 1 }), tile);
        const c = chartTarget(point({ dataIndex: 0, seriesIndex: 1 }), tile);
        expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    });

    it('reads a flipped bar: categories run up the y axis', () => {
        const target = chartTarget(
            point({
                value: [540, 'gift_card'],
                encode: { x: [0], y: [1] },
                dimensionNames: null,
                baseAxis: 'y',
            }),
            tile,
        );
        expect(target.label).toContain(
            'bar "gift_card" in series "Total revenue" (540)',
        );
    });

    it('names a line point and shows a midnight timestamp as its date', () => {
        const target = chartTarget(
            point({
                seriesType: 'line',
                value: { month: '2024-03-01T00:00:00.000Z', total: 12 },
                dimensionNames: ['month', 'total'],
            }),
            tile,
        );
        expect(target.label).toBe(
            'point "2024-03-01" in series "Total revenue" (12) on "Revenue per payment method"',
        );
    });

    it('names a pie slice by its name and value, without a series', () => {
        const target = chartTarget(
            point({
                seriesType: 'pie',
                seriesName: 'series0',
                name: 'coupon',
                value: 310,
                encode: null,
                dimensionNames: null,
                baseAxis: null,
            }),
            tile,
        );
        expect(target.label).toBe(
            'slice "coupon" (310) on "Revenue per payment method"',
        );
    });

    it('leaves out a value it cannot read', () => {
        const target = chartTarget(
            point({ value: { payments_method: 'coupon' } }),
            tile,
        );
        expect(target.label).toBe(
            'bar "coupon" in series "Total revenue" on "Revenue per payment method"',
        );
    });

    it('names a legend entry as its whole series', () => {
        expect(
            chartTarget({ kind: 'series', seriesName: 'Orders', rect }, tile),
        ).toEqual({
            kind: 'chart-series',
            id: 'tile-1/series/Orders',
            label: 'series "Orders" on "Revenue per payment method"',
            parentId: 'tile-1',
        });
    });

    it('names an axis, with or without a title', () => {
        expect(
            chartTarget(
                { kind: 'axis', axis: 'y', index: 0, name: 'Revenue', rect },
                tile,
            ),
        ).toEqual({
            kind: 'chart-axis',
            id: 'tile-1/axis/y0',
            label: 'y axis "Revenue" on "Revenue per payment method"',
            parentId: 'tile-1',
        });
        expect(
            chartTarget(
                { kind: 'axis', axis: 'x', index: 1, name: '', rect },
                tile,
            ).label,
        ).toBe('x axis on "Revenue per payment method"');
    });

    it('keeps a label of long names to about 120 characters', () => {
        const long = 'x'.repeat(200);
        const target = chartTarget(
            point({
                seriesName: 'y'.repeat(200),
                value: { payments_method: long, payments_total: 1 },
            }),
            { uuid: 'tile-1', title: long },
        );
        expect(target.label.length).toBeLessThanOrEqual(120);
        expect(target.label).toMatch(
            /^bar "x+…" in series "y+…" \(1\) on "x+…"$/,
        );
    });
});

describe('pickChartAt', () => {
    const chart = () => {
        const element = document.createElement('div');
        element.setAttribute('_echarts_instance_', 'ec_1');
        element.getBoundingClientRect = () => new DOMRect(100, 200, 400, 300);
        const canvas = document.createElement('canvas');
        element.appendChild(canvas);
        return { element, canvas };
    };

    it('asks the chart in its own pixels and outlines the hit on the page', () => {
        const { element, canvas } = chart();
        const asked: unknown[] = [];
        const picked = pickChartAt(
            canvas,
            { x: 150, y: 260 },
            tile,
            (el, x, y) => {
                asked.push([el, x, y]);
                return point({});
            },
        );
        expect(asked).toEqual([[element, 50, 60]]);
        expect(picked?.target.kind).toBe('chart-point');
        expect(picked?.rect).toEqual(new DOMRect(110, 220, 30, 40));
    });

    it('is nothing off a chart or where the chart shows nothing', () => {
        const { canvas } = chart();
        const at = { x: 150, y: 260 };
        expect(
            pickChartAt(document.createElement('p'), at, tile, () => point({})),
        ).toBeNull();
        expect(pickChartAt(canvas, at, tile, () => null)).toBeNull();
    });
});
