import { CartesianSeriesType } from '../../../types/savedCharts';
import { type EChartsSeries } from '../../types';
import { applyRoundedCornersToStackData } from './barChartStyles';

const makeRow = (date: string, value: number): Record<string, unknown> => ({
    date_month: date,
    count: value,
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
    test('builds tuples directly from canonical flat dataset values', () => {
        // Caller passes the canonicalized dataset (post-padding), so DST-drifted
        // input rows arrive already normalized to the axis labels.
        const dataset = [
            makeRow('2024-01-01T05:00:00Z', 1),
            makeRow('2024-11-01T05:00:00Z', 11),
            makeRow('2024-12-01T05:00:00Z', 12),
        ];

        const [out] = applyRoundedCornersToStackData(
            [makeStackedBarSeries()],
            dataset,
        );

        const tuples = (out.data as { value: unknown[] }[]).map((d) => d.value);
        expect(tuples[0][0]).toBe('2024-01-01T05:00:00Z');
        expect(tuples[1][0]).toBe('2024-11-01T05:00:00Z');
        expect(tuples[2][0]).toBe('2024-12-01T05:00:00Z');
        expect(tuples[0][1]).toBe(1);
        expect(tuples[1][1]).toBe(11);
        expect(tuples[2][1]).toBe(12);
    });

    test('marks the visible top of each stack with borderRadius', () => {
        const dataset = [
            { date_month: '2024-01-01', count: 5, count_b: 7 },
            { date_month: '2024-02-01', count: 3, count_b: 7 },
        ];
        const a = makeStackedBarSeries({ name: 'a' });
        const b = makeStackedBarSeries({
            name: 'b',
            encode: {
                x: 'date_month',
                y: 'count_b',
                tooltip: [],
                seriesName: 'count_b',
            },
        });

        const result = applyRoundedCornersToStackData([a, b], dataset);

        // b is at the visible end (last in the stack group), so its tuples get
        // a borderRadius itemStyle; a's tuples don't.
        const aData = result[0].data as Array<{
            value: unknown[];
            itemStyle?: unknown;
        }>;
        const bData = result[1].data as Array<{
            value: unknown[];
            itemStyle?: unknown;
        }>;
        expect(aData.every((d) => d.itemStyle === undefined)).toBe(true);
        expect(bData.every((d) => d.itemStyle !== undefined)).toBe(true);
    });

    test('skips non-bar series', () => {
        const lineSeries: EChartsSeries = {
            ...makeStackedBarSeries(),
            type: CartesianSeriesType.LINE,
        };
        const dataset = [makeRow('2024-01-01', 1)];

        const result = applyRoundedCornersToStackData([lineSeries], dataset);

        // No mutation: the line series passes through unchanged.
        expect(result[0]).toEqual(lineSeries);
    });
});
