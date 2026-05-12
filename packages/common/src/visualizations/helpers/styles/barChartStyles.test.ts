import { type ResultRow } from '../../../types/results';
import { CartesianSeriesType } from '../../../types/savedCharts';
import { type EChartsSeries } from '../../types';
import { applyRoundedCornersToStackData } from './barChartStyles';

const makeRow = (date: string, value: number): ResultRow => ({
    date_month: { value: { raw: date, formatted: date } },
    count: { value: { raw: value, formatted: String(value) } },
});

const makeStackedBarSeries = (
    overrides?: Partial<EChartsSeries>,
): EChartsSeries => ({
    type: CartesianSeriesType.BAR,
    stack: 'stack-all-series',
    encode: {
        x: 'date_month',
        y: 'count',
        tooltip: [],
        seriesName: 'count',
    },
    dimensions: [
        { name: 'date_month', displayName: 'Month' },
        { name: 'count', displayName: 'Count' },
    ],
    ...overrides,
});

describe('applyRoundedCornersToStackData', () => {
    test('substitutes canonical category values into series.data tuples', () => {
        const rows = [
            makeRow('2024-01-01T05:00:00Z', 1),
            // DST-drifted row: warehouse emits -04:00 while axis stays at -05:00.
            makeRow('2024-11-01T04:00:00Z', 11),
            makeRow('2024-12-01T05:00:00Z', 12),
        ];
        const categoryValues = [
            '2024-01-01T05:00:00Z',
            '2024-11-01T05:00:00Z',
            '2024-12-01T05:00:00Z',
        ];

        const [out] = applyRoundedCornersToStackData(
            [makeStackedBarSeries()],
            rows,
            { categoryValues },
        );

        const tuples = (out.data as { value: unknown[] }[]).map((d) => d.value);
        expect(tuples[0][0]).toBe('2024-01-01T05:00:00Z');
        expect(tuples[1][0]).toBe('2024-11-01T05:00:00Z');
        expect(tuples[2][0]).toBe('2024-12-01T05:00:00Z');
        expect(tuples[0][1]).toBe(1);
        expect(tuples[1][1]).toBe(11);
        expect(tuples[2][1]).toBe(12);
    });

    test('falls back to raw row value when categoryValues is omitted', () => {
        const rows = [
            makeRow('2024-01-01T05:00:00Z', 1),
            makeRow('2024-11-01T04:00:00Z', 11),
        ];

        const [out] = applyRoundedCornersToStackData(
            [makeStackedBarSeries()],
            rows,
        );

        const tuples = (out.data as { value: unknown[] }[]).map((d) => d.value);
        expect(tuples[0][0]).toBe('2024-01-01T05:00:00Z');
        expect(tuples[1][0]).toBe('2024-11-01T04:00:00Z');
    });

    test('falls back to raw row value at indices missing from categoryValues', () => {
        const rows = [
            makeRow('2024-01-01T05:00:00Z', 1),
            makeRow('2024-11-01T04:00:00Z', 11),
        ];
        const categoryValues = ['2024-01-01T05:00:00Z'];

        const [out] = applyRoundedCornersToStackData(
            [makeStackedBarSeries()],
            rows,
            { categoryValues },
        );

        const tuples = (out.data as { value: unknown[] }[]).map((d) => d.value);
        expect(tuples[0][0]).toBe('2024-01-01T05:00:00Z');
        expect(tuples[1][0]).toBe('2024-11-01T04:00:00Z');
    });
});
