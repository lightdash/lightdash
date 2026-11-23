import { describe, expect, it } from 'vitest';
import { ChartKind } from '../types/savedCharts';
import {
    recommendChart,
    TOP_N_CATEGORIES,
    type ChartShapeDimension,
    type ChartShapeValue,
} from './chartRecommendation';

const category = (
    fieldId: string,
    distinctValueCount: number,
    longestValueLength = 8,
): ChartShapeDimension => ({
    fieldId,
    label: fieldId,
    isTime: false,
    distinctValueCount,
    longestValueLength,
});

const time = (
    fieldId: string,
    distinctValueCount: number,
): ChartShapeDimension => ({
    fieldId,
    label: fieldId,
    isTime: true,
    distinctValueCount,
});

const metric = (fieldId: string, unit: string | null = 'count') =>
    ({ fieldId, label: fieldId, unit }) satisfies ChartShapeValue;

const shape = (
    dimensions: ChartShapeDimension[],
    metrics: ChartShapeValue[],
    rowCount: number,
) => ({ dimensions, metrics, tableCalculations: [], rowCount });

describe('recommendChart', () => {
    it('0 dimensions, 1 metric, 1 row: big number', () => {
        expect(recommendChart(shape([], [metric('events')], 1))).toMatchObject({
            kind: ChartKind.BIG_NUMBER,
            yFields: ['events'],
        });
    });

    it('1 time dimension, 1 metric: line, noting bars work for few periods', () => {
        const result = recommendChart(
            shape([time('month', 6)], [metric('events')], 6),
        );
        expect(result).toMatchObject({
            kind: ChartKind.LINE,
            xField: 'month',
            yFields: ['events'],
        });
        expect(result.reason).toContain('bar chart works as well');
    });

    it('1 time dimension, 3 metrics: lines on one axis, never bars', () => {
        expect(
            recommendChart(
                shape(
                    [time('month', 24)],
                    [metric('a'), metric('b', 'currency'), metric('c')],
                    24,
                ),
            ),
        ).toMatchObject({ kind: ChartKind.LINE, yFields: ['a', 'b', 'c'] });
    });

    it('1 time + 1 category with few values: lines split by the category', () => {
        expect(
            recommendChart(
                shape(
                    [time('month', 12), category('platform', 3)],
                    [metric('events')],
                    36,
                ),
            ),
        ).toMatchObject({
            kind: ChartKind.LINE,
            xField: 'month',
            groupBy: 'platform',
        });
    });

    it('1 time + 1 category with many values: table, saying why', () => {
        const result = recommendChart(
            shape(
                [time('month', 12), category('country', 30)],
                [metric('events')],
                360,
            ),
        );
        expect(result.kind).toBe(ChartKind.TABLE);
        expect(result.reason).toContain('30 country values would be 30 lines');
    });

    it('1 category up to 10 values: bar sorted by value', () => {
        expect(
            recommendChart(
                shape([category('event_name', 8)], [metric('events')], 8),
            ),
        ).toMatchObject({
            kind: ChartKind.VERTICAL_BAR,
            xField: 'event_name',
            sort: { fieldId: 'events', descending: true },
        });
    });

    it('1 category with 11 to 20 values: horizontal bar, largest first', () => {
        const result = recommendChart(
            shape([category('event_name', 15)], [metric('events')], 15),
        );
        expect(result).toMatchObject({
            kind: ChartKind.HORIZONTAL_BAR,
            sort: { fieldId: 'events', descending: true },
        });
        expect(result).not.toHaveProperty('topN');
    });

    it('1 category with long labels: horizontal bar even when few', () => {
        expect(
            recommendChart(
                shape([category('event_name', 5, 40)], [metric('events')], 5),
            ).kind,
        ).toBe(ChartKind.HORIZONTAL_BAR);
    });

    it('1 category with more than 20 values: top N of M, without summing the rest', () => {
        const result = recommendChart(
            shape([category('event_name', 154)], [metric('events')], 154),
        );
        expect(result).toMatchObject({
            kind: ChartKind.HORIZONTAL_BAR,
            sort: { fieldId: 'events', descending: true },
            topN: { count: TOP_N_CATEGORIES, total: 154 },
        });
        expect(result.reason).toContain(`top ${TOP_N_CATEGORIES} of 154`);
    });

    it('2 categories in a small grid: grouped bar, the smaller one as groups', () => {
        expect(
            recommendChart(
                shape(
                    [category('platform', 3), category('event_name', 8)],
                    [metric('events')],
                    24,
                ),
            ),
        ).toMatchObject({
            kind: ChartKind.VERTICAL_BAR,
            xField: 'event_name',
            groupBy: 'platform',
        });
    });

    it('2 categories in a large grid: table', () => {
        expect(
            recommendChart(
                shape(
                    [category('platform', 6), category('event_name', 40)],
                    [metric('events')],
                    240,
                ),
            ).kind,
        ).toBe(ChartKind.TABLE);
    });

    it('1 category, 2 metrics sharing a unit: grouped bars', () => {
        const result = recommendChart(
            shape(
                [category('platform', 4)],
                [metric('events'), metric('users')],
                4,
            ),
        );
        expect(result).toMatchObject({
            kind: ChartKind.VERTICAL_BAR,
            yFields: ['events', 'users'],
        });
        expect(result).not.toHaveProperty('groupBy');
    });

    it('1 category, 2 metrics in different units: table', () => {
        expect(
            recommendChart(
                shape(
                    [category('platform', 4)],
                    [metric('events'), metric('revenue', 'currency')],
                    4,
                ),
            ).kind,
        ).toBe(ChartKind.TABLE);
    });

    it.each([
        [
            '3 dimensions',
            shape(
                [category('a', 2), category('b', 2), category('c', 2)],
                [metric('m')],
                8,
            ),
        ],
        [
            '4 metrics',
            shape(
                [category('a', 5)],
                [metric('m1'), metric('m2'), metric('m3'), metric('m4')],
                5,
            ),
        ],
        ['no metric', shape([category('a', 5)], [], 5)],
    ])('%s: table', (_name, input) => {
        expect(recommendChart(input).kind).toBe(ChartKind.TABLE);
    });

    it('counts table calculations as metrics', () => {
        expect(
            recommendChart({
                dimensions: [],
                metrics: [],
                tableCalculations: [metric('ratio')],
                rowCount: 1,
            }).kind,
        ).toBe(ChartKind.BIG_NUMBER);
    });
});
