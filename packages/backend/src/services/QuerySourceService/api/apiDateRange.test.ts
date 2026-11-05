import {
    FilterOperator,
    ParameterError,
    UnitOfTime,
    type FilterRule,
} from '@lightdash/common';
import {
    getApiDateRange,
    getIsoDateInTimeZone,
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

    test('refuses a date filter inside an OR group', () => {
        const date = rule(FilterOperator.IN_THE_PAST, [7]);
        expect(() =>
            splitDateRangeFilter({ id: 'root', or: [date, channel] }, DATE),
        ).toThrow(ParameterError);
        expect(() =>
            splitDateRangeFilter(
                { id: 'root', and: [{ id: 'nested', or: [date, channel] }] },
                DATE,
            ),
        ).toThrow('not inside an OR group');
    });

    test('refuses two date filters', () => {
        expect(() =>
            splitDateRangeFilter(
                {
                    id: 'root',
                    and: [
                        rule(FilterOperator.IN_THE_PAST, [7]),
                        rule(FilterOperator.EQUALS, ['2026-11-01']),
                    ],
                },
                DATE,
            ),
        ).toThrow('Filter the date once');
    });
});

describe('getApiDateRange', () => {
    test('uses the last full days without a date filter', () => {
        expect(range(null)).toEqual({
            kind: 'relative',
            startDaysAgo: 28,
            endDaysAgo: 1,
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
        ).toEqual({ kind: 'relative', startDaysAgo: 7, endDaysAgo: 0 });
        expect(
            range(
                rule(FilterOperator.IN_THE_PAST, [7], {
                    unitOfTime: UnitOfTime.days,
                    completed: true,
                }),
            ),
        ).toEqual({ kind: 'relative', startDaysAgo: 7, endDaysAgo: 1 });
    });

    test('turns rolling weeks and months into days', () => {
        expect(
            range(
                rule(FilterOperator.IN_THE_PAST, [2], {
                    unitOfTime: UnitOfTime.weeks,
                    completed: false,
                }),
            ),
        ).toEqual({ kind: 'relative', startDaysAgo: 14, endDaysAgo: 0 });
        expect(
            range(
                rule(FilterOperator.IN_THE_PAST, [1], {
                    unitOfTime: UnitOfTime.months,
                    completed: false,
                }),
            ),
        ).toEqual({ kind: 'relative', startDaysAgo: 31, endDaysAgo: 0 });
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
            ).toEqual({ kind: 'absolute', startDate, endDate });
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
            kind: 'absolute',
            startDate: '2026-10-01',
            endDate: '2026-10-28',
        });
        expect(range(rule(FilterOperator.EQUALS, ['2026-10-05']))).toEqual({
            kind: 'absolute',
            startDate: '2026-10-05',
            endDate: '2026-10-05',
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
        [
            rule(FilterOperator.GREATER_THAN, ['2026-10-01']),
            'Use "in the past"',
        ],
    ])('refuses ranges the API cannot take (%#)', (dateRule, message) => {
        expect(() => range(dateRule)).toThrow(message);
    });
});

describe('toAbsoluteDateRange', () => {
    test('counts relative days back from today', () => {
        expect(
            toAbsoluteDateRange(
                { kind: 'relative', startDaysAgo: 28, endDaysAgo: 1 },
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
