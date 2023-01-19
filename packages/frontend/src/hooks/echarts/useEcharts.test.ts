import { ResultRow } from '@lightdash/common';
import {
    getAxisDefaultMaxValue,
    getAxisDefaultMinValue,
    getMinAndMaxValues,
} from './useEcharts';

jest.mock('./../../providers/TrackingProvider');

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
    test('should return min/max values for numbers', () => {
        const axis = 'axis';
        const values = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, -1, -2, -3, -100, 0,
        ];
        const resultRow: ResultRow[] = values.map((v) => ({
            [axis]: { value: { raw: v, formatted: v } },
        }));
        expect(getMinAndMaxValues(axis, resultRow)).toStrictEqual([-100, 50]);
    });

    test('should return min/max values for dates', () => {
        const axis = 'axis';
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
            [axis]: { value: { raw: `${v}${time}`, formatted: v } },
        }));
        expect(getMinAndMaxValues(axis, resultRow)).toStrictEqual([
            `2017-03-29${time}`,
            `2019-01-15${time}`,
        ]);
    });

    test('should return min/max values for floats', () => {
        const axis = 'axis';
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
            [axis]: { value: { raw: v, formatted: v } },
        }));
        expect(getMinAndMaxValues(axis, resultRow)).toStrictEqual([-5.0, 50.0]);
    });

    test('string values should return invalid min/max', () => {
        const axis = 'axis';
        const values = ['a', 'b', 'c', 'z'];
        const resultRow: ResultRow[] = values.map((v) => ({
            [axis]: { value: { raw: v, formatted: v } },
        }));
        expect(getMinAndMaxValues(axis, resultRow)).toStrictEqual([0, 0]);
    });
});
