import {
    FilterOperator,
    ParameterError,
    UnitOfTime,
    type FilterRule,
} from '@lightdash/common';
import {
    getApiDateRange,
    getIsoDateInTimeZone,
    resolveAbsoluteDateRange,
    splitDateRangeFilter,
    toAbsoluteDateRange,
} from './apiDateRange';

const DATE = 'report_date';
const TODAY = '2026-11-04'; // a Wednesday

const rule = (
    operator: FilterOperator,
    values: unknown[],
    settings?: { unitOfTime: UnitOfTime; completed: boolean },
    fieldId = DATE,
): FilterRule => ({
    id: `${fieldId}-${operator}`,
    target: { fieldId },
    operator,
    values,
    ...(settings ? { settings } : {}),
});

const range = (dateRule: FilterRule | null) =>
    getApiDateRange({ rule: dateRule, defaultDays: 28, today: TODAY });

describe('splitDateRangeFilter', () => {
    const channel = rule(
        FilterOperator.EQUALS,
        ['Direct'],
        undefined,
        'report_channel',
    );

    test('takes the date filter out of a top-level AND group', () => {
        const date = rule(FilterOperator.IN_THE_PAST, [7]);
        expect(
            splitDateRangeFilter({ id: 'root', and: [date, channel] }, DATE),
        ).toEqual({
            dateRule: date,
            otherFilters: { id: 'root', and: [channel] },
        });
    });

    test('leaves no filters when the date was the only one', () => {
        const date = rule(FilterOperator.IN_THE_PAST, [7]);
        expect(splitDateRangeFilter({ id: 'root', or: [date] }, DATE)).toEqual({
            dateRule: date,
            otherFilters: undefined,
        });
    });

    test('ignores a disabled date filter', () => {
        const date = {
            ...rule(FilterOperator.IN_THE_PAST, [7]),
            disabled: true,
        };
        expect(
            splitDateRangeFilter({ id: 'root', and: [date] }, DATE).dateRule,
        ).toBeNull();
    });
});

describe('getApiDateRange', () => {
    test('uses the last full days without a date filter', () => {
        expect(range(null)).toEqual({
            start: { daysAgo: 28 },
            end: { daysAgo: 1 },
        });
    });

    test('keeps day ranges relative, ending today or yesterday', () => {
        expect(
            range(
                rule(FilterOperator.IN_THE_PAST, [7], {
                    unitOfTime: UnitOfTime.days,
                    completed: false,
                }),
            ),
        ).toEqual({ start: { daysAgo: 7 }, end: { daysAgo: 0 } });
        expect(
            range(
                rule(FilterOperator.IN_THE_PAST, [7], {
                    unitOfTime: UnitOfTime.days,
                    completed: true,
                }),
            ),
        ).toEqual({ start: { daysAgo: 7 }, end: { daysAgo: 1 } });
    });

    test('turns rolling weeks and months into days', () => {
        expect(
            range(
                rule(FilterOperator.IN_THE_PAST, [2], {
                    unitOfTime: UnitOfTime.weeks,
                    completed: false,
                }),
            ),
        ).toEqual({ start: { daysAgo: 14 }, end: { daysAgo: 0 } });
        expect(
            range(
                rule(FilterOperator.IN_THE_PAST, [1], {
                    unitOfTime: UnitOfTime.months,
                    completed: false,
                }),
            ),
        ).toEqual({ start: { daysAgo: 31 }, end: { daysAgo: 0 } });
    });

    test.each([
        [UnitOfTime.weeks, 1, '2026-10-26', '2026-11-01'],
        [UnitOfTime.months, 3, '2026-08-01', '2026-10-31'],
        [UnitOfTime.quarters, 1, '2026-07-01', '2026-09-30'],
        [UnitOfTime.years, 1, '2025-01-01', '2025-12-31'],
    ])(
        'turns %s completed periods into calendar dates',
        (unitOfTime, count, startDate, endDate) => {
            expect(
                range(
                    rule(FilterOperator.IN_THE_PAST, [count], {
                        unitOfTime,
                        completed: true,
                    }),
                ),
            ).toEqual({ start: { date: startDate }, end: { date: endDate } });
        },
    );

    test('reads between and equals as calendar dates', () => {
        expect(
            range(
                rule(FilterOperator.IN_BETWEEN, [
                    '2026-10-01T00:00:00.000Z',
                    new Date('2026-10-28T00:00:00Z'),
                ]),
            ),
        ).toEqual({
            start: { date: '2026-10-01' },
            end: { date: '2026-10-28' },
        });
        expect(range(rule(FilterOperator.EQUALS, ['2026-10-05']))).toEqual({
            start: { date: '2026-10-05' },
            end: { date: '2026-10-05' },
        });
    });

    test.each([
        [
            rule(FilterOperator.IN_BETWEEN, ['2026-10-28', '2026-10-01']),
            'on or before',
        ],
        [
            rule(FilterOperator.EQUALS, ['2026-10-01', '2026-10-02']),
            'Filter one date',
        ],
        [rule(FilterOperator.IN_THE_PAST, [0]), 'at least 1'],
        [
            rule(FilterOperator.IN_THE_PAST, [3], {
                unitOfTime: UnitOfTime.hours,
                completed: false,
            }),
            'days or longer',
        ],
        [rule(FilterOperator.EQUALS, ['next week']), "isn't a date"],
        [rule(FilterOperator.IN_THE_NEXT, [3]), 'Use "in the past"'],
        [
            rule(FilterOperator.LESS_THAN, ['2026-10-01']),
            'can\'t be filtered with "lessThan" on this source',
        ],
        [
            rule(FilterOperator.GREATER_THAN, ['2026-10-01', '2026-10-02']),
            'one date',
        ],
    ])('refuses ranges the API cannot take (%#)', (dateRule, message) => {
        expect(() => range(dateRule)).toThrow(message);
    });
});

describe('getApiDateRange with open-ended filters', () => {
    const openRange = (dateRule: FilterRule) =>
        getApiDateRange({
            rule: dateRule,
            defaultDays: 28,
            today: TODAY,
            earliestDate: '2015-08-14',
        });

    test.each([
        [UnitOfTime.days, '2026-11-04'],
        [UnitOfTime.weeks, '2026-11-02'],
        [UnitOfTime.months, '2026-11-01'],
        [UnitOfTime.quarters, '2026-10-01'],
        [UnitOfTime.years, '2026-01-01'],
    ])('reads "in the current %s" as its start until today', (unit, start) => {
        expect(
            openRange(
                rule(FilterOperator.IN_THE_CURRENT, [1], {
                    unitOfTime: unit,
                    completed: false,
                }),
            ),
        ).toEqual({ start: { date: start }, end: { daysAgo: 0 } });
    });

    test.each([
        [FilterOperator.GREATER_THAN, { date: '2026-10-02' }, { daysAgo: 0 }],
        [
            FilterOperator.GREATER_THAN_OR_EQUAL,
            { date: '2026-10-01' },
            { daysAgo: 0 },
        ],
        [
            FilterOperator.LESS_THAN,
            { date: '2015-08-14' },
            { date: '2026-09-30' },
        ],
        [
            FilterOperator.LESS_THAN_OR_EQUAL,
            { date: '2015-08-14' },
            { date: '2026-10-01' },
        ],
    ])('reads %s 2026-10-01 as an open-ended range', (operator, start, end) => {
        expect(openRange(rule(operator, ['2026-10-01']))).toEqual({
            start,
            end,
        });
    });

    test('reads "not in the past" as everything before that range', () => {
        expect(
            openRange(
                rule(FilterOperator.NOT_IN_THE_PAST, [7], {
                    unitOfTime: UnitOfTime.days,
                    completed: false,
                }),
            ),
        ).toEqual({ start: { date: '2015-08-14' }, end: { daysAgo: 8 } });
        expect(
            openRange(
                rule(FilterOperator.NOT_IN_THE_PAST, [2], {
                    unitOfTime: UnitOfTime.weeks,
                    completed: false,
                }),
            ),
        ).toEqual({ start: { date: '2015-08-14' }, end: { daysAgo: 15 } });
    });

    test('refuses "not in the past" completed periods, which leave two ranges', () => {
        expect(() =>
            openRange(
                rule(FilterOperator.NOT_IN_THE_PAST, [1], {
                    unitOfTime: UnitOfTime.months,
                    completed: true,
                }),
            ),
        ).toThrow('two date ranges');
    });
});

describe('toAbsoluteDateRange', () => {
    test('counts relative days back from today', () => {
        expect(
            toAbsoluteDateRange(
                { start: { daysAgo: 28 }, end: { daysAgo: 1 } },
                TODAY,
            ),
        ).toEqual({ startDate: '2026-10-07', endDate: '2026-11-03' });
    });
});

describe('getIsoDateInTimeZone', () => {
    test('uses the calendar date in that time zone', () => {
        const now = new Date('2026-11-04T03:00:00Z');
        expect(getIsoDateInTimeZone(now, 'UTC')).toBe('2026-11-04');
        expect(getIsoDateInTimeZone(now, 'America/Los_Angeles')).toBe(
            '2026-11-03',
        );
    });
});

describe('resolveAbsoluteDateRange', () => {
    const channel = rule(
        FilterOperator.EQUALS,
        ['Direct'],
        undefined,
        'report_channel',
    );

    test('reads the date filter and leaves the others', () => {
        const date = rule(FilterOperator.IN_THE_PAST, [7]);
        expect(
            resolveAbsoluteDateRange({
                dateRange: { fieldId: DATE, defaultDays: 28 },
                filters: { id: 'root', and: [date, channel] },
                today: TODAY,
            }),
        ).toEqual({
            startDate: '2026-10-28',
            endDate: TODAY,
            otherFilters: { id: 'root', and: [channel] },
        });
    });

    test('falls back to the default window ending yesterday', () => {
        expect(
            resolveAbsoluteDateRange({
                dateRange: { fieldId: DATE, defaultDays: 28 },
                filters: undefined,
                today: TODAY,
            }),
        ).toEqual({
            startDate: '2026-10-07',
            endDate: '2026-11-03',
            otherFilters: undefined,
        });
    });
});
