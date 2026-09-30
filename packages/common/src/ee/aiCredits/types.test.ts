import { getAiCreditContractWindow, getCalendarMonthPeriod } from './types';

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

describe('getAiCreditContractWindow', () => {
    const monthly = {
        startsAt: new Date('2026-01-15T00:00:00Z'),
        endsAt: null,
        resetIntervalMonths: 1,
    };
    const window = (
        contract: Parameters<typeof getAiCreditContractWindow>[0],
        at: string,
    ) => {
        const result = getAiCreditContractWindow(contract, new Date(at));
        return result === null
            ? null
            : [
                  result.periodStart.toISOString(),
                  result.periodEnd.toISOString(),
              ];
    };

    test('resets every interval from the start date', () => {
        expect(window(monthly, '2026-09-29T12:00:00Z')).toEqual([
            '2026-09-15T00:00:00.000Z',
            '2026-10-15T00:00:00.000Z',
        ]);
        expect(window(monthly, '2026-09-14T23:59:59Z')).toEqual([
            '2026-08-15T00:00:00.000Z',
            '2026-09-15T00:00:00.000Z',
        ]);
        expect(window(monthly, '2026-09-15T00:00:00Z')).toEqual([
            '2026-09-15T00:00:00.000Z',
            '2026-10-15T00:00:00.000Z',
        ]);
    });

    test('supports quarterly and yearly contracts', () => {
        expect(
            window(
                { ...monthly, resetIntervalMonths: 3 },
                '2026-09-29T00:00:00Z',
            ),
        ).toEqual(['2026-07-15T00:00:00.000Z', '2026-10-15T00:00:00.000Z']);
        expect(
            window(
                { ...monthly, resetIntervalMonths: 12 },
                '2027-02-01T00:00:00Z',
            ),
        ).toEqual(['2027-01-15T00:00:00.000Z', '2028-01-15T00:00:00.000Z']);
    });

    test('a contract starting on the 31st resets on the last day of shorter months, without drifting', () => {
        const endOfMonth = {
            ...monthly,
            startsAt: new Date('2026-01-31T00:00:00Z'),
        };
        expect(window(endOfMonth, '2026-02-28T12:00:00Z')).toEqual([
            '2026-02-28T00:00:00.000Z',
            '2026-03-31T00:00:00.000Z',
        ]);
        expect(window(endOfMonth, '2026-04-30T12:00:00Z')).toEqual([
            '2026-04-30T00:00:00.000Z',
            '2026-05-31T00:00:00.000Z',
        ]);
    });

    test('has no window before the start or from the end, and the last window stops at the end', () => {
        const ending = {
            ...monthly,
            endsAt: new Date('2026-10-01T00:00:00Z'),
        };
        expect(window(ending, '2026-01-01T00:00:00Z')).toBeNull();
        expect(window(ending, '2026-10-01T00:00:00Z')).toBeNull();
        expect(window(ending, '2026-09-29T00:00:00Z')).toEqual([
            '2026-09-15T00:00:00.000Z',
            '2026-10-01T00:00:00.000Z',
        ]);
    });
});
