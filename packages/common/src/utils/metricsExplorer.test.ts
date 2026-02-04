import dayjs from 'dayjs';
import { TimeFrames } from '../types/timeFrames';
import { getDateCalcUtils } from './metricsExplorer';

const formatDate = (date: Date) => dayjs(date).format('YYYY-MM-DD');

describe('getDateCalcUtils', () => {
    test('day shift', () => {
        const { back, forward } = getDateCalcUtils(
            TimeFrames.DAY,
            TimeFrames.DAY,
        );
        const base = new Date('2026-03-31T00:00:00Z');
        expect(formatDate(back(base))).toBe('2026-03-30');
        expect(formatDate(forward(base))).toBe('2026-04-01');
    });

    test('week shift', () => {
        const { back, forward } = getDateCalcUtils(
            TimeFrames.WEEK,
            TimeFrames.WEEK,
        );
        const base = new Date('2026-03-31T00:00:00Z');
        expect(formatDate(back(base))).toBe('2026-03-24');
        expect(formatDate(forward(base))).toBe('2026-04-07');
    });

    test('month shift clamps end of month', () => {
        const { back, forward } = getDateCalcUtils(
            TimeFrames.MONTH,
            TimeFrames.MONTH,
        );
        const base = new Date('2026-03-31T00:00:00Z');
        expect(formatDate(back(base))).toBe('2026-02-28');
        expect(formatDate(forward(new Date('2026-01-31T00:00:00Z')))).toBe(
            '2026-02-28',
        );
    });

    test('year shift clamps leap day', () => {
        const { back } = getDateCalcUtils(TimeFrames.YEAR, TimeFrames.YEAR);
        const leap = new Date('2024-02-29T00:00:00Z');
        expect(formatDate(back(leap))).toBe('2023-02-28');
    });
});
