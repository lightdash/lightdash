import { getCalendarMonthPeriod } from './types';

describe('getCalendarMonthPeriod', () => {
    test('covers the UTC month of the instant, up to but not including the next month', () => {
        const period = getCalendarMonthPeriod(new Date('2026-09-29T23:59:59Z'));
        expect(period.periodStart.toISOString()).toBe(
            '2026-09-01T00:00:00.000Z',
        );
        expect(period.periodEnd.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    });

    test('rolls over the year in December', () => {
        expect(
            getCalendarMonthPeriod(
                new Date('2026-12-15T12:00:00Z'),
            ).periodEnd.toISOString(),
        ).toBe('2027-01-01T00:00:00.000Z');
    });
});
