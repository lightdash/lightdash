import {
    CartesianSeriesType,
    TimeFrames,
    transformToPercentageStacking,
    type EChartsSeries,
    type Field,
    type ResultRow,
} from '@lightdash/common';
import { describe, expect, test, vi } from 'vitest';
import {
    filterSeriesWithNoData,
    getAxisDefaultMaxValue,
    getAxisDefaultMinValue,
    getCategoryDateAxisConfig,
    getMinAndMaxValues,
    padDatasetForContinuousAxis,
} from './useEchartsCartesianConfig';

vi.mock('./../../providers/TrackingProvider');

describe('getAxisDefaultMinValue', () => {
    test('should return undefined', () => {
        expect(getAxisDefaultMinValue({ min: '', max: 5 })).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: 10, max: '' })).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: '', max: '' })).toBeUndefined();
        expect(
            getAxisDefaultMinValue({ min: undefined, max: undefined }),
        ).toBeUndefined();
        expect(
            getAxisDefaultMinValue({ min: null, max: null }),
        ).toBeUndefined();
        expect(
            getAxisDefaultMinValue({
                min: new Date('2021-03-10T00:00:00.000Z'),
                max: new Date('2021-03-10T00:00:00.100Z'),
            }),
        ).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: 0, max: 5 })).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: 0.1, max: 0.5 })).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: 10, max: 50 })).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: 100, max: 500 })).toBeUndefined();
        expect(
            getAxisDefaultMinValue({ min: 1000, max: 5000 }),
        ).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: 0, max: 60 })).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: -5, max: 0 })).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: -50, max: -10 })).toBeUndefined();
        expect(
            getAxisDefaultMinValue({ min: -500, max: -100 }),
        ).toBeUndefined();
        expect(
            getAxisDefaultMinValue({ min: -5000, max: -1000 }),
        ).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: -60, max: 0 })).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: -60, max: -50 })).toBeUndefined();
        expect(
            getAxisDefaultMinValue({ min: -600, max: -500 }),
        ).toBeUndefined();
        expect(
            getAxisDefaultMinValue({ min: -6000, max: -5000 }),
        ).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: -5, max: 5 })).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: -50, max: 50 })).toBeUndefined();
        expect(getAxisDefaultMinValue({ min: -500, max: 100 })).toBeUndefined();
        expect(
            getAxisDefaultMinValue({ min: -5000, max: 1000 }),
        ).toBeUndefined();
    });

    test('should return min value', () => {
        expect(getAxisDefaultMinValue({ min: 0.5, max: 0.6 })).toBe(0.5);
        expect(getAxisDefaultMinValue({ min: 50, max: 60 })).toBe(50);
        expect(getAxisDefaultMinValue({ min: 500, max: 600 })).toBe(500);
        expect(getAxisDefaultMinValue({ min: 5000, max: 6000 })).toBe(5000);
    });
});

describe('getAxisDefaultMaxValue', () => {
    test('should return undefined', () => {
        expect(getAxisDefaultMaxValue({ min: '', max: 5 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: 10, max: '' })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: '', max: '' })).toBeUndefined();
        expect(
            getAxisDefaultMaxValue({ min: undefined, max: undefined }),
        ).toBeUndefined();
        expect(
            getAxisDefaultMaxValue({ min: null, max: null }),
        ).toBeUndefined();
        expect(
            getAxisDefaultMaxValue({
                min: new Date('2021-03-10T00:00:00.000Z'),
                max: new Date('2021-03-10T00:00:00.100Z'),
            }),
        ).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: 0, max: 5 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: 0.1, max: 0.5 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: 10, max: 50 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: 100, max: 500 })).toBeUndefined();
        expect(
            getAxisDefaultMaxValue({ min: 1000, max: 5000 }),
        ).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: 0, max: 60 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: 0.5, max: 0.6 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: 50, max: 60 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: 50, max: 60 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: 500, max: 600 })).toBeUndefined();
        expect(
            getAxisDefaultMaxValue({ min: 5000, max: 6000 }),
        ).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: -5, max: 0 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: -50, max: -10 })).toBeUndefined();
        expect(
            getAxisDefaultMaxValue({ min: -500, max: -100 }),
        ).toBeUndefined();
        expect(
            getAxisDefaultMaxValue({ min: -5000, max: -1000 }),
        ).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: -60, max: 0 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: -5, max: 5 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: -50, max: 50 })).toBeUndefined();
        expect(getAxisDefaultMaxValue({ min: -500, max: 100 })).toBeUndefined();
        expect(
            getAxisDefaultMaxValue({ min: -5000, max: 1000 }),
        ).toBeUndefined();
    });

    test('should return max value', () => {
        expect(getAxisDefaultMaxValue({ min: -60, max: -50 })).toBe(-50);
        expect(getAxisDefaultMaxValue({ min: -600, max: -500 })).toBe(-500);
        expect(getAxisDefaultMaxValue({ min: -6000, max: -5000 })).toBe(-5000);
    });
});

describe('getMinAndMaxValues', () => {
    test('should return min/max values for numbers in a single series', () => {
        const axes = ['axis1'];
        const values = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, -1, -2, -3, -100, 0,
        ];
        const resultRow: ResultRow[] = values.map((v) => ({
            [axes[0]]: { value: { raw: v, formatted: v.toString() } },
        }));
        expect(getMinAndMaxValues(axes, resultRow)).toStrictEqual([-100, 50]);
    });

    test('should return min/max values for dates in a single series', () => {
        const axes = ['axis1'];
        const time = ':00:00.000Z';
        const values = [
            '2018-02-28',
            '2018-02-29',
            '2018-02-30',
            '2018-01-29',
            '2017-03-29',
            '2019-01-15',
        ];
        const resultRow: ResultRow[] = values.map((v) => ({
            [axes[0]]: { value: { raw: `${v}${time}`, formatted: v } },
        }));
        expect(getMinAndMaxValues(axes, resultRow)).toStrictEqual([
            `2017-03-29${time}`,
            `2019-01-15${time}`,
        ]);
    });

    test('should return min/max values for floats in a single series', () => {
        const axes = ['axis1'];
        const values = [
            '1.000',
            '2.000',
            '5.000',
            '8.000',
            '50.000',
            '-5.000',
            '0.000',
        ];
        const resultRow: ResultRow[] = values.map((v) => ({
            [axes[0]]: { value: { raw: v, formatted: v } },
        }));
        expect(getMinAndMaxValues(axes, resultRow)).toStrictEqual([-5.0, 50.0]);
    });

    test('string values should return invalid min/max in a single series', () => {
        const axes = ['axis1'];

        const values = ['a', 'b', 'c', 'z'];
        const resultRow: ResultRow[] = values.map((v) => ({
            [axes[0]]: { value: { raw: v, formatted: v } },
        }));
        expect(getMinAndMaxValues(axes, resultRow)).toStrictEqual([0, 0]);
    });

    test('should return min/max values for numbers in multiple series', () => {
        const axes = ['axis1', 'axis2'];
        const values = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, -1, -2, -3, -100, 0,
        ];
        const resultRow: ResultRow[] = values.map((v) => ({
            [axes[0]]: { value: { raw: v, formatted: v.toString() } },
        }));
        const values2 = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 70, -1, -2, -3, -10, 0,
        ];
        const resultRow2: ResultRow[] = values2.map((v) => ({
            [axes[1]]: { value: { raw: v, formatted: v.toString() } },
        }));
        expect(
            getMinAndMaxValues(axes, [...resultRow, ...resultRow2]),
        ).toStrictEqual([-100, 70]);
    });

    test('should return min/max values for dates in multiple series', () => {
        const axes = ['axis1', 'axis2'];
        const time = ':00:00.000Z';
        const values = [
            '2018-02-28',
            '2018-02-29',
            '2018-02-30',
            '2018-01-29',
            '2017-03-29',
            '2019-01-15', // max
        ];
        const resultRow: ResultRow[] = values.map((v) => ({
            [axes[0]]: { value: { raw: `${v}${time}`, formatted: v } },
        }));

        const values2 = [
            '2018-02-28',
            '2018-02-29',
            '2018-02-30',
            '2018-01-29',
            '2016-03-29', // min
            '2019-01-15',
        ];
        const resultRow2: ResultRow[] = values2.map((v) => ({
            [axes[1]]: { value: { raw: `${v}${time}`, formatted: v } },
        }));
        expect(
            getMinAndMaxValues(axes, [...resultRow, ...resultRow2]),
        ).toStrictEqual([`2016-03-29${time}`, `2019-01-15${time}`]);
    });

    test('should return min/max values for floats in multiple series', () => {
        const axes = ['axis1', 'axis2'];
        const values = [
            '1.000',
            '2.000',
            '5.000',
            '8.000',
            '50.000', // max
            '-5.000',
            '0.000',
        ];
        const resultRow: ResultRow[] = values.map((v) => ({
            [axes[0]]: { value: { raw: v, formatted: v } },
        }));
        const values2 = [
            '1.000',
            '2.000',
            '5.000',
            '8.000',
            '50.000',
            '-10.000', // min
            '0.000',
        ];
        const resultRow2: ResultRow[] = values2.map((v) => ({
            [axes[1]]: { value: { raw: v, formatted: v } },
        }));
        expect(
            getMinAndMaxValues(axes, [...resultRow, ...resultRow2]),
        ).toStrictEqual([-10.0, 50.0]);
    });

    test('string values should return invalid min/max in multiple series', () => {
        const axes = ['axis1', 'axis2'];

        const values = ['a', 'b', 'c', 'z'];
        const resultRow: ResultRow[] = values.map((v) => ({
            [axes[0]]: { value: { raw: v, formatted: v } },
        }));

        const values2 = ['y', 'x', 'c', 'z'];
        const resultRow2: ResultRow[] = values2.map((v) => ({
            [axes[1]]: { value: { raw: v, formatted: v } },
        }));
        expect(
            getMinAndMaxValues(axes, [...resultRow, ...resultRow2]),
        ).toStrictEqual([0, 0]);
    });
});

describe('getCategoryDateAxisConfig', () => {
    const axisId = 'date_axis';

    const createRows = (dates: string[]): ResultRow[] =>
        dates.map((d) => ({
            [axisId]: { value: { raw: d, formatted: d } },
        }));

    const createAxisField = (timeInterval: TimeFrames) =>
        ({
            timeInterval,
            name: 'test_date',
            table: 'test_table',
        }) as unknown as Field;

    test('returns empty object when axisType is not category', () => {
        const result = getCategoryDateAxisConfig(
            axisId,
            createAxisField(TimeFrames.YEAR),
            createRows(['2024-01-01', '2025-01-01']),
            'time',
        );
        expect(result).toEqual({});
    });

    test('returns empty object when axisField has no timeInterval', () => {
        const result = getCategoryDateAxisConfig(
            axisId,
            { name: 'test', table: 'test' } as never,
            createRows(['2024-01-01', '2025-01-01']),
            'category',
        );
        expect(result).toEqual({});
    });

    describe('YEAR interval', () => {
        test('generates continuous year range', () => {
            const result = getCategoryDateAxisConfig(
                axisId,
                createAxisField(TimeFrames.YEAR),
                createRows(['2024-01-01', '2026-01-01']),
                'category',
            );
            expect(result.data).toHaveLength(3);
            expect(result.data?.[0]).toContain('2024');
            expect(result.data?.[1]).toContain('2025');
            expect(result.data?.[2]).toContain('2026');
        });

        test('handles single year', () => {
            const result = getCategoryDateAxisConfig(
                axisId,
                createAxisField(TimeFrames.YEAR),
                createRows(['2024-01-01']),
                'category',
            );
            expect(result.data).toHaveLength(1);
            expect(result.data?.[0]).toContain('2024');
        });
    });

    describe('QUARTER interval', () => {
        test('generates continuous quarter range', () => {
            const result = getCategoryDateAxisConfig(
                axisId,
                createAxisField(TimeFrames.QUARTER),
                createRows(['2024-01-01', '2024-10-01']),
                'category',
            );
            expect(result.data).toHaveLength(4); // Q1, Q2, Q3, Q4
        });

        test('handles quarters spanning year boundary', () => {
            const result = getCategoryDateAxisConfig(
                axisId,
                createAxisField(TimeFrames.QUARTER),
                createRows(['2024-10-01', '2025-04-01']),
                'category',
            );
            expect(result.data).toHaveLength(3); // Q4 2024, Q1 2025, Q2 2025
        });
    });

    describe('MONTH interval', () => {
        test('generates continuous month range', () => {
            const result = getCategoryDateAxisConfig(
                axisId,
                createAxisField(TimeFrames.MONTH),
                createRows(['2024-01-01', '2024-03-01']),
                'category',
            );
            expect(result.data).toHaveLength(3); // Jan, Feb, Mar
        });

        test('handles months spanning year boundary', () => {
            const result = getCategoryDateAxisConfig(
                axisId,
                createAxisField(TimeFrames.MONTH),
                createRows(['2024-11-01', '2025-02-01']),
                'category',
            );
            expect(result.data).toHaveLength(4); // Nov, Dec, Jan, Feb
        });
    });

    describe('WEEK interval', () => {
        test('generates continuous week range', () => {
            const rows = createRows([
                '2024-01-01T00:00:00.000Z',
                '2024-01-22T00:00:00.000Z',
            ]);
            const result = getCategoryDateAxisConfig(
                axisId,
                createAxisField(TimeFrames.WEEK),
                rows,
                'category',
            );
            // 21 days = 3 weeks, so 4 data points: Jan 1, 8, 15, 22
            expect(result.data).toHaveLength(4);
        });
    });

    // Regression: iteration landing exactly on maxX produced a duplicate
    // trailing category due to dayjs.tz .isBefore drift.
    describe('no duplicate entries when range lands exactly on maxX', () => {
        const expectStrictlyIncreasingAndUnique = (data: string[]) => {
            expect(new Set(data).size).toBe(data.length);
            const values = data.map((d) => new Date(d).valueOf());
            for (let i = 1; i < values.length; i += 1) {
                expect(values[i]).toBeGreaterThan(values[i - 1]);
            }
        };

        test('WEEK iteration ending exactly on maxX produces no duplicate', () => {
            // 6 weeks apart — iteration lands exactly on maxX
            const rows = createRows([
                '2020-06-29T01:00:00Z',
                '2020-08-10T01:00:00Z',
            ]);
            const result = getCategoryDateAxisConfig(
                axisId,
                createAxisField(TimeFrames.WEEK),
                rows,
                'category',
            );
            expect(result.data).toHaveLength(7);
            expectStrictlyIncreasingAndUnique(result.data!);
        });

        test('MONTH iteration ending exactly on maxX produces no duplicate', () => {
            const rows = createRows([
                '2024-01-15T00:00:00.000Z',
                '2024-06-15T00:00:00.000Z',
            ]);
            const result = getCategoryDateAxisConfig(
                axisId,
                createAxisField(TimeFrames.MONTH),
                rows,
                'category',
            );
            // Jan..Jun inclusive = 6 months
            expect(result.data).toHaveLength(6);
            expectStrictlyIncreasingAndUnique(result.data!);
        });

        test('QUARTER iteration ending exactly on maxX produces no duplicate', () => {
            const rows = createRows([
                '2024-01-15T00:00:00.000Z',
                '2024-10-15T00:00:00.000Z',
            ]);
            const result = getCategoryDateAxisConfig(
                axisId,
                createAxisField(TimeFrames.QUARTER),
                rows,
                'category',
            );
            // Q1..Q4 = 4 quarters
            expect(result.data).toHaveLength(4);
            expectStrictlyIncreasingAndUnique(result.data!);
        });

        test('YEAR iteration ending exactly on maxX produces no duplicate', () => {
            const rows = createRows([
                '2020-06-15T00:00:00.000Z',
                '2024-06-15T00:00:00.000Z',
            ]);
            const result = getCategoryDateAxisConfig(
                axisId,
                createAxisField(TimeFrames.YEAR),
                rows,
                'category',
            );
            // 2020..2024 inclusive = 5 years
            expect(result.data).toHaveLength(5);
            expectStrictlyIncreasingAndUnique(result.data!);
        });
    });
});

describe('filterSeriesWithNoData', () => {
    const makeSeries = (tooltipKey: string | undefined): EChartsSeries =>
        ({
            type: CartesianSeriesType.BAR,
            encode: tooltipKey
                ? {
                      x: 'date',
                      y: tooltipKey,
                      tooltip: [tooltipKey],
                      seriesName: tooltipKey,
                  }
                : undefined,
        }) as EChartsSeries;

    const rowLimit = {
        mode: 'show' as const,
        direction: 'first' as const,
        count: 5,
    };

    test('removes series whose data column is all null in visible results', () => {
        const series = [makeSeries('metric_a'), makeSeries('metric_b')];
        const results = [
            { metric_a: 10, metric_b: null },
            { metric_a: 20, metric_b: null },
        ];

        const filtered = filterSeriesWithNoData(series, results, rowLimit);
        expect(filtered).toHaveLength(1);
        expect(filtered[0].encode?.tooltip?.[0]).toBe('metric_a');
    });

    test('removes series whose data column is all undefined in visible results', () => {
        const series = [makeSeries('metric_a'), makeSeries('metric_b')];
        const results = [
            { metric_a: 10, metric_b: undefined },
            { metric_a: 20 },
        ];

        const filtered = filterSeriesWithNoData(series, results, rowLimit);
        expect(filtered).toHaveLength(1);
        expect(filtered[0].encode?.tooltip?.[0]).toBe('metric_a');
    });

    test('keeps series with zero values (falsy but valid data)', () => {
        const series = [makeSeries('metric_a'), makeSeries('metric_b')];
        const results = [
            { metric_a: 10, metric_b: 0 },
            { metric_a: 20, metric_b: 0 },
        ];

        const filtered = filterSeriesWithNoData(series, results, rowLimit);
        expect(filtered).toHaveLength(2);
    });

    test('keeps series with empty string values (falsy but not null/undefined)', () => {
        const series = [makeSeries('metric_a'), makeSeries('metric_b')];
        const results = [
            { metric_a: 10, metric_b: '' },
            { metric_a: 20, metric_b: '' },
        ];

        const filtered = filterSeriesWithNoData(series, results, rowLimit);
        expect(filtered).toHaveLength(2);
    });

    test('keeps series with no encode/tooltip (fallback: keep everything)', () => {
        const series = [makeSeries('metric_a'), makeSeries(undefined)];
        const results = [{ metric_a: 10 }];

        const filtered = filterSeriesWithNoData(series, results, rowLimit);
        expect(filtered).toHaveLength(2);
    });

    test('returns unfilteredSeries when results array is empty', () => {
        const series = [makeSeries('metric_a'), makeSeries('metric_b')];
        const results: Record<string, unknown>[] = [];

        const filtered = filterSeriesWithNoData(series, results, rowLimit);
        expect(filtered).toBe(series);
    });

    test('returns unfilteredSeries when rowLimit is undefined', () => {
        const series = [makeSeries('metric_a'), makeSeries('metric_b')];
        const results = [{ metric_a: 10, metric_b: null }];

        const filtered = filterSeriesWithNoData(series, results, undefined);
        expect(filtered).toBe(series);
    });

    test('keeps series when at least one row has non-null data', () => {
        const series = [makeSeries('metric_a'), makeSeries('metric_b')];
        const results = [
            { metric_a: 10, metric_b: null },
            { metric_a: 20, metric_b: 5 },
        ];

        const filtered = filterSeriesWithNoData(series, results, rowLimit);
        expect(filtered).toHaveLength(2);
    });

    test('treats formatted null placeholder strings as having data', () => {
        // getResultValueArray uses `raw ?? formatted`, so null raw values
        // with a formatted string like '∅' appear as non-null in results.
        // The filter correctly keeps these series because the result value
        // is the formatted string, not null. This documents current behavior.
        const series = [makeSeries('metric_a'), makeSeries('metric_b')];
        const results = [
            { metric_a: 10, metric_b: '∅' },
            { metric_a: 20, metric_b: '∅' },
        ];

        const filtered = filterSeriesWithNoData(series, results, rowLimit);
        // '∅' is a truthy string — series is kept. This is a known limitation:
        // getResultValueArray falls back from null raw to formatted string.
        expect(filtered).toHaveLength(2);
    });

    test('keeps series when any tooltip key has data (multiple tooltip keys)', () => {
        const seriesWithMultipleKeys = {
            type: CartesianSeriesType.BAR,
            encode: {
                x: 'date',
                y: 'metric_b',
                tooltip: ['label_col', 'metric_b'],
                seriesName: 'metric_b',
            },
        } as EChartsSeries;
        const series = [makeSeries('metric_a'), seriesWithMultipleKeys];
        const results = [
            { metric_a: 10, label_col: null, metric_b: 5 },
            { metric_a: 20, label_col: null, metric_b: null },
        ];

        const filtered = filterSeriesWithNoData(series, results, rowLimit);
        expect(filtered).toHaveLength(2);
    });
});

describe('padDatasetForContinuousAxis', () => {
    const xField = 'date_month';

    test('inserts empty rows for gap dates', () => {
        const data = [
            { [xField]: '2023-03-01', value: 10 },
            { [xField]: '2023-05-01', value: 20 },
        ];
        const range = ['2023-03-01', '2023-04-01', '2023-05-01'];

        const result = padDatasetForContinuousAxis(data, range, xField);
        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ [xField]: '2023-03-01', value: 10 });
        expect(result[1]).toEqual({ [xField]: '2023-04-01' });
        expect(result[2]).toEqual({ [xField]: '2023-05-01', value: 20 });
    });

    test('matches dates despite timezone offset differences', () => {
        const data = [
            { [xField]: '2023-03-01T00:00:00Z', value: 10 },
            { [xField]: '2023-05-01T01:00:00Z', value: 20 },
        ];
        const range = [
            '2023-03-01T00:00:00Z',
            '2023-04-01T00:00:00Z',
            '2023-05-01T00:00:00Z',
        ];

        const result = padDatasetForContinuousAxis(data, range, xField);
        expect(result).toHaveLength(3);
        expect(result[0].value).toBe(10);
        expect(result[1]).toEqual({ [xField]: '2023-04-01T00:00:00Z' });
        expect(result[2].value).toBe(20);
    });

    test('returns data unchanged when no gaps', () => {
        const data = [
            { [xField]: '2023-03-01', value: 10 },
            { [xField]: '2023-04-01', value: 20 },
        ];
        const range = ['2023-03-01', '2023-04-01'];

        const result = padDatasetForContinuousAxis(data, range, xField);
        expect(result).toHaveLength(2);
        expect(result).toEqual(data);
    });

    test('returns data unchanged when range is empty', () => {
        const data = [{ [xField]: '2023-03-01', value: 10 }];
        const result = padDatasetForContinuousAxis(data, [], xField);
        expect(result).toBe(data);
    });

    test('returns data unchanged when data is empty', () => {
        const range = ['2023-03-01', '2023-04-01'];
        const result = padDatasetForContinuousAxis([], range, xField);
        expect(result).toEqual([]);
    });

    test('drops rows whose dates are not in the continuous range', () => {
        const data = [
            { [xField]: '2023-03-01', value: 10 },
            { [xField]: '2023-06-01', value: 30 },
        ];
        const range = ['2023-03-01', '2023-04-01', '2023-05-01'];

        const result = padDatasetForContinuousAxis(data, range, xField);
        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ [xField]: '2023-03-01', value: 10 });
        expect(result[1]).toEqual({ [xField]: '2023-04-01' });
        expect(result[2]).toEqual({ [xField]: '2023-05-01' });
    });

    test('rewrites x-field to canonical range value while preserving other columns', () => {
        const data = [
            { [xField]: '2023-03-01T01:00:00Z', value: 10, extra: 'a' },
            { [xField]: '2023-04-01T01:00:00Z', value: 20, extra: 'b' },
        ];
        const range = ['2023-03-01T00:00:00Z', '2023-04-01T00:00:00Z'];

        const result = padDatasetForContinuousAxis(data, range, xField);
        expect(result).toHaveLength(2);
        expect(result[0][xField]).toBe('2023-03-01T00:00:00Z');
        expect(result[0].value).toBe(10);
        expect(result[0].extra).toBe('a');
        expect(result[1][xField]).toBe('2023-04-01T00:00:00Z');
        expect(result[1].value).toBe(20);
        expect(result[1].extra).toBe('b');
    });

    test('matches DST-offset rows to non-DST continuous range', () => {
        const data = [
            { [xField]: '2024-01-01T05:00:00Z', value: 1 },
            { [xField]: '2024-10-01T05:00:00Z', value: 10 },
            // Nov 1 is still EDT (DST ends Nov 3), so the warehouse emits
            // -04:00. The snap's iteration stays at the start-of-range -05:00.
            { [xField]: '2024-11-01T04:00:00Z', value: 11 },
            { [xField]: '2024-12-01T05:00:00Z', value: 12 },
        ];
        const range = [
            '2024-01-01T05:00:00Z',
            '2024-10-01T05:00:00Z',
            '2024-11-01T05:00:00Z',
            '2024-12-01T05:00:00Z',
        ];

        const result = padDatasetForContinuousAxis(data, range, xField);
        expect(result).toHaveLength(4);
        expect(result[2][xField]).toBe('2024-11-01T05:00:00Z');
        expect(result[2].value).toBe(11);
    });

    test('is a no-op when row x-field already equals category', () => {
        const data = [
            { [xField]: '2024-04-01T00:00:00Z', value: 4, extra: 'a' },
            { [xField]: '2024-05-01T00:00:00Z', value: 5, extra: 'b' },
            { [xField]: '2024-06-01T00:00:00Z', value: 6, extra: 'c' },
        ];
        const range = [
            '2024-04-01T00:00:00Z',
            '2024-05-01T00:00:00Z',
            '2024-06-01T00:00:00Z',
        ];

        const result = padDatasetForContinuousAxis(data, range, xField);
        expect(result).toEqual(data);
    });
});

describe('padDatasetForContinuousAxis ∘ transformToPercentageStacking', () => {
    // Padding and the 100%-stack transform must commute on non-gap rows so
    // dataset.source consumers can read from either composition order.
    const xField = 'date';
    const yFields = ['a', 'b'];
    const range = [
        '2024-01-01T00:00:00Z',
        '2024-02-01T00:00:00Z',
        '2024-03-01T00:00:00Z',
    ];

    test('produces equivalent ratios on non-gap rows regardless of order', () => {
        // Drifted offsets — same calendar dates, different hours.
        const rows = [
            { [xField]: '2024-01-01T01:00:00Z', a: 3, b: 7 },
            { [xField]: '2024-02-01T01:00:00Z', a: 1, b: 1 },
            { [xField]: '2024-03-01T01:00:00Z', a: 4, b: 6 },
        ];

        const transformedFirst = transformToPercentageStacking(
            rows,
            xField,
            yFields,
        ).transformedResults;
        const padThenTransform = padDatasetForContinuousAxis(
            transformedFirst,
            range,
            xField,
        );

        const paddedFirst = padDatasetForContinuousAxis(rows, range, xField);
        const transformThenPad = transformToPercentageStacking(
            paddedFirst,
            xField,
            yFields,
        ).transformedResults;

        // Cats must match xAxis.data in both orders.
        for (let i = 0; i < range.length; i++) {
            expect(padThenTransform[i][xField]).toBe(range[i]);
            expect(transformThenPad[i][xField]).toBe(range[i]);
        }

        // Ratios for present rows must match. Gap-row values legitimately
        // differ between orders (undefined vs explicit 0%) — covered by the
        // gap-tolerance test in tooltipFormatter.test.ts.
        for (let i = 0; i < range.length; i++) {
            for (const y of yFields) {
                expect(transformThenPad[i][y]).toBe(padThenTransform[i][y]);
            }
        }
    });

    test('canonicalizes cats even when transform writes ratios first', () => {
        const rows = [
            { [xField]: '2024-01-01T01:00:00Z', a: 3, b: 7 },
            { [xField]: '2024-02-01T01:00:00Z', a: 1, b: 1 },
        ];
        const partialRange = range.slice(0, 2);

        const transformedFirst = transformToPercentageStacking(
            rows,
            xField,
            yFields,
        ).transformedResults;
        const padThenTransformCats = padDatasetForContinuousAxis(
            transformedFirst,
            partialRange,
            xField,
        ).map((r) => r[xField]);
        const transformThenPadCats = transformToPercentageStacking(
            padDatasetForContinuousAxis(rows, partialRange, xField),
            xField,
            yFields,
        ).transformedResults.map((r) => r[xField]);

        expect(padThenTransformCats).toEqual(partialRange);
        expect(transformThenPadCats).toEqual(partialRange);
    });
});
