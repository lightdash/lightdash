import {
    FilterOperator,
    UnitOfTime,
    type FilterGroup,
    type FilterRule,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    compareDatePeriod,
    getDatePeriodCandidates,
    type RequestedDatePeriod,
} from './dateRanges';

const rule = (
    operator: FilterOperator,
    values: unknown[],
    fieldId = 'orders_date',
): FilterRule => ({
    id: 'filter',
    target: { fieldId },
    operator,
    values,
});
const range = (start: string, end: string): FilterRule =>
    rule(FilterOperator.IN_BETWEEN, [start, end]);
const february: RequestedDatePeriod = {
    kind: 'calendar',
    start: '2024-02-01',
    end: '2024-02-29',
};
const compare = (
    dimensions: FilterGroup,
    period: RequestedDatePeriod = february,
) =>
    compareDatePeriod({
        period,
        filters: { dimensions },
        fieldId: 'orders_date',
        calendarDate: true,
    });

describe('literal date candidates', () => {
    it.each([
        ['Revenue in February 2024', '2024-02-01', '2024-02-29'],
        ['Revenue in February 2023', '2023-02-01', '2023-02-28'],
        ['Revenue in December 2024', '2024-12-01', '2024-12-31'],
        ['Revenue during calendar year 2024', '2024-01-01', '2024-12-31'],
        ['Revenue on 2024-02-29', '2024-02-29', '2024-02-29'],
        [
            'Revenue from 2024-02-01 through 2024-03-10 inclusive',
            '2024-02-01',
            '2024-03-10',
        ],
    ])('extracts %s without duplicate inner dates', (text, start, end) => {
        expect(getDatePeriodCandidates(text)).toEqual([
            {
                text: expect.any(String),
                period: { kind: 'calendar', start, end },
            },
        ]);
    });
    it.each([
        'Revenue 2024',
        '2024-02-30',
        '2024-02-01T12:30:00Z',
        '2024-02-01 12:30:00',
        '2024-02-30 through 2024-03-01',
        '2024-03-01 through 2024-02-01',
        'FY2024',
        'last fiscal year',
        'the previous period',
        'revenue recently',
        'x'.repeat(8_001),
    ])('does not invent a period for %s', (text) => {
        expect(getDatePeriodCandidates(text)).toEqual([]);
    });
    it('keeps comparison candidates separate for semantic abstention', () => {
        expect(
            getDatePeriodCandidates('March 2024 versus April 2024'),
        ).toHaveLength(2);
    });
    it('bounds candidates without silently dropping a requested period', () => {
        expect(
            getDatePeriodCandidates(
                Array.from(
                    { length: 13 },
                    (_, i) => `January ${2020 + i}`,
                ).join(' versus '),
            ),
        ).toEqual([]);
    });
    it.each([
        ['last month', FilterOperator.IN_THE_PAST, 1, UnitOfTime.months, true],
        [
            'this year',
            FilterOperator.IN_THE_CURRENT,
            1,
            UnitOfTime.years,
            false,
        ],
        [
            'past 7 completed days',
            FilterOperator.IN_THE_PAST,
            7,
            UnitOfTime.days,
            true,
        ],
        [
            'past 7 rolling days',
            FilterOperator.IN_THE_PAST,
            7,
            UnitOfTime.days,
            false,
        ],
        ['last 7 days', FilterOperator.IN_THE_PAST, 7, UnitOfTime.days, null],
        ['last day', FilterOperator.IN_THE_PAST, 1, UnitOfTime.days, null],
    ])(
        'preserves explicit relative semantics for %s',
        (text, operator, count, unit, completed) => {
            expect(getDatePeriodCandidates(text)[0].period).toEqual({
                kind: 'relative',
                operator,
                count,
                unit,
                completed,
            });
        },
    );
});

describe('calendar date filter comparison', () => {
    it('does not count disabled date restrictions as executed scope', () => {
        const disabled = {
            ...range('2024-02-01', '2024-02-29'),
            disabled: true,
        };
        expect(compare({ id: 'root', and: [disabled] })).toBe('mismatch');
        expect(
            compare({
                id: 'root',
                or: [disabled, range('2024-02-01', '2024-02-29')],
            }),
        ).toBe('unknown');
        expect(
            compare({
                id: 'root',
                and: [
                    range('2024-02-01', '2024-02-29'),
                    { ...range('2024-01-01', '2024-01-31'), disabled: true },
                ],
            }),
        ).toBe('match');
    });
    it('matches inclusive between and exclusive upper bounds', () => {
        expect(
            compare({ id: 'root', and: [range('2024-02-01', '2024-02-29')] }),
        ).toBe('match');
        expect(
            compare({
                id: 'root',
                and: [
                    rule(FilterOperator.GREATER_THAN_OR_EQUAL, ['2024-02-01']),
                    rule(FilterOperator.LESS_THAN, ['2024-03-01']),
                ],
            }),
        ).toBe('match');
    });
    it('detects leap-day omissions and inclusive next-month leakage', () => {
        expect(
            compare({ id: 'root', and: [range('2024-02-01', '2024-02-28')] }),
        ).toBe('mismatch');
        expect(
            compare({ id: 'root', and: [range('2024-02-01', '2024-03-01')] }),
        ).toBe('mismatch');
    });
    it('retains OR unions instead of flattening them into intersections', () => {
        expect(
            compare({
                id: 'root',
                or: [
                    range('2024-02-01', '2024-02-14'),
                    range('2024-02-15', '2024-02-29'),
                ],
            }),
        ).toBe('match');
        expect(
            compare({
                id: 'root',
                or: [
                    range('2024-02-01', '2024-02-14'),
                    range('2024-02-16', '2024-02-29'),
                ],
            }),
        ).toBe('mismatch');
    });
    it('intersects nested unions and retains unrelated conjuncts', () => {
        expect(
            compare({
                id: 'root',
                and: [
                    {
                        id: 'or',
                        or: [
                            range('2024-01-01', '2024-02-14'),
                            range('2024-02-15', '2024-03-31'),
                        ],
                    },
                    range('2024-02-01', '2024-02-29'),
                    rule(FilterOperator.EQUALS, ['active'], 'orders_status'),
                ],
            }),
        ).toBe('match');
    });
    it('abstains on a different field inside OR', () => {
        expect(
            compare({
                id: 'root',
                or: [
                    range('2024-02-01', '2024-02-29'),
                    rule(FilterOperator.EQUALS, ['active'], 'orders_status'),
                ],
            }),
        ).toBe('unknown');
    });
    it('detects missing, empty and contradictory date scopes', () => {
        expect(compare({ id: 'root', and: [] })).toBe('mismatch');
        expect(compare({ id: 'root', or: [] })).toBe('mismatch');
        expect(
            compare({
                id: 'root',
                and: [
                    range('2024-02-01', '2024-02-10'),
                    range('2024-02-20', '2024-02-29'),
                ],
            }),
        ).toBe('mismatch');
    });
    it.each([
        rule(FilterOperator.IN_BETWEEN, [
            '2024-02-01T00:00:00Z',
            '2024-02-29T00:00:00Z',
        ]),
        rule(FilterOperator.IN_BETWEEN, ['2024-02-01', '2024-02-30']),
        rule(FilterOperator.NOT_EQUALS, ['2024-02-29']),
        rule(FilterOperator.IN_THE_PAST, [1]),
        rule(FilterOperator.EQUALS, []),
        rule(FilterOperator.NULL, []),
    ])('abstains for unsupported literal/operator semantics %#', (filter) => {
        expect(compare({ id: 'root', and: [filter] })).toBe('unknown');
    });
    it('never treats a timestamp field like a calendar date', () => {
        expect(
            compareDatePeriod({
                period: february,
                filters: {
                    dimensions: {
                        id: 'and',
                        and: [range('2024-02-01', '2024-02-29')],
                    },
                },
                fieldId: 'orders_date',
                calendarDate: false,
            }),
        ).toBe('unknown');
    });
    it('handles multi-value equality without mutating filters', () => {
        const filters: FilterGroup = {
            id: 'and',
            and: [
                rule(FilterOperator.EQUALS, [
                    '2024-02-03',
                    '2024-02-01',
                    '2024-02-02',
                ]),
            ],
        };
        const before = structuredClone(filters);
        expect(
            compare(filters, {
                kind: 'calendar',
                start: '2024-02-01',
                end: '2024-02-03',
            }),
        ).toBe('match');
        expect(filters).toEqual(before);
    });
});

describe('relative date comparison without clock arithmetic', () => {
    const lastMonth = getDatePeriodCandidates('last month')[0].period;
    const relative = (
        count: number,
        unit: UnitOfTime,
        completed: boolean,
    ): FilterRule => ({
        ...rule(FilterOperator.IN_THE_PAST, [count]),
        settings: { unitOfTime: unit, completed },
    });
    it('ignores disabled relative restrictions', () => {
        const active = relative(1, UnitOfTime.months, true);
        expect(
            compare(
                { id: 'root', and: [{ ...active, disabled: true }] },
                lastMonth,
            ),
        ).toBe('mismatch');
        expect(
            compare(
                {
                    id: 'root',
                    and: [
                        active,
                        {
                            ...relative(2, UnitOfTime.days, false),
                            disabled: true,
                        },
                    ],
                },
                lastMonth,
            ),
        ).toBe('match');
    });
    it.each([
        [1, UnitOfTime.months, true, 'match'],
        [1, UnitOfTime.months, false, 'mismatch'],
        [2, UnitOfTime.months, true, 'mismatch'],
        [1, UnitOfTime.days, true, 'mismatch'],
    ])(
        'compares count, units and completed periods %#',
        (count, unit, completed, outcome) => {
            expect(
                compare(
                    { id: 'and', and: [relative(count, unit, completed)] },
                    lastMonth,
                ),
            ).toBe(outcome);
        },
    );
    it('leaves ambiguous completed/rolling semantics unspecified', () => {
        const { period } = getDatePeriodCandidates('last 7 days')[0];
        for (const completed of [false, true])
            expect(
                compare(
                    {
                        id: 'and',
                        and: [relative(7, UnitOfTime.days, completed)],
                    },
                    period,
                ),
            ).toBe('match');
    });
    it('abstains across absolute and relative representations and combined relative scopes', () => {
        expect(
            compare(
                { id: 'and', and: [range('2024-02-01', '2024-02-29')] },
                lastMonth,
            ),
        ).toBe('unknown');
        expect(
            compare(
                {
                    id: 'and',
                    and: [
                        relative(1, UnitOfTime.months, true),
                        relative(2, UnitOfTime.weeks, false),
                    ],
                },
                lastMonth,
            ),
        ).toBe('unknown');
    });
});
