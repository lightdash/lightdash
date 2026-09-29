import { describe, expect, it, vi } from 'vitest';
import {
    createBoundaryDateFormatter,
    renderDateFilterSql,
} from '../compiler/filtersCompiler';
import { SupportedDbtAdapter } from '../types/dbt';
import { DimensionType } from '../types/field';
import {
    FilterOperator,
    UnitOfTime,
    type DashboardFilterRule,
} from '../types/filter';
import {
    getDashboardBoundaryErrors,
    validateFilterBoundary,
} from './filterBoundaries';

const rule = (
    values: unknown[],
    operator = FilterOperator.EQUALS,
): DashboardFilterRule => ({
    id: 'filter',
    target: { tableName: 'orders', fieldId: 'orders_value' },
    label: undefined,
    operator,
    values,
});

describe('dashboard filter boundaries', () => {
    it('validates saved boundaries even when overrides omit, disable, retarget or replace metadata', () => {
        const savedRule = {
            ...rule([50]),
            boundaries: { type: 'number' as const, min: 0, max: 100 },
        };
        const saved = {
            dimensions: [savedRule],
            metrics: [],
            tableCalculations: [],
        };
        const check = (dimensions: DashboardFilterRule[]) =>
            getDashboardBoundaryErrors(
                saved,
                { ...saved, dimensions },
                'tile',
                ['orders_value'],
            );
        expect(check([rule([25])])).toEqual([]);
        for (const overrides of [
            [],
            [{ ...rule([25]), disabled: true }],
            [
                {
                    ...rule([25]),
                    target: { tableName: 'orders', fieldId: 'other' },
                },
            ],
            [
                {
                    ...rule([200]),
                    boundaries: { type: 'number' as const, min: 0, max: 500 },
                },
            ],
            [{ ...rule([25]), tileTargets: { tile: false as const } }],
        ]) {
            expect(check(overrides)).toHaveLength(1);
        }
        expect(check([{ ...rule([25]), id: 'sdk-generated-id' }])).toEqual([]);
        expect(
            getDashboardBoundaryErrors(
                saved,
                { ...saved, dimensions: [] },
                'tile',
                ['unrelated_field'],
            ),
        ).toEqual([]);
    });
    it('uses DATE precision for relative boundaries but instant precision for timestamps', () => {
        const boundary = {
            type: 'date' as const,
            mode: 'relative' as const,
            value: 1,
            unitOfTime: UnitOfTime.days,
            completed: false,
        };
        const context = {
            timezone: 'America/New_York',
            useTimezoneAwareDateTrunc: true,
            now: new Date('2026-03-08T16:00:00Z'),
            fieldType: DimensionType.DATE,
        };
        expect(
            validateFilterBoundary(boundary, rule(['2026-03-08']), context),
        ).toBeNull();
        expect(
            validateFilterBoundary(boundary, rule(['2026-03-07']), context),
        ).toBeNull();
        expect(
            validateFilterBoundary(boundary, rule(['2026-03-06']), context),
        ).not.toBeNull();
        expect(
            validateFilterBoundary(boundary, rule(['2026-03-08']), {
                ...context,
                fieldType: DimensionType.TIMESTAMP,
            }),
        ).not.toBeNull();
        expect(
            validateFilterBoundary(
                { ...boundary, completed: true },
                rule(['2026-03-08']),
                context,
            ),
        ).not.toBeNull();
    });

    it.each([
        {
            timezone: 'America/New_York',
            now: '2026-03-01T04:30:00Z',
            unitOfTime: UnitOfTime.months,
            enabledRange: ['2026-01-01', '2026-01-31', '2026-02-01'],
            legacyRange: ['2026-02-01', '2026-02-28', '2026-03-01'],
        },
        {
            timezone: 'Asia/Tokyo',
            now: '2026-02-28T23:30:00Z',
            unitOfTime: UnitOfTime.months,
            enabledRange: ['2026-02-01', '2026-02-28', '2026-03-01'],
            legacyRange: ['2026-01-01', '2026-01-31', '2026-02-01'],
        },
        {
            timezone: 'America/New_York',
            now: '2026-03-09T02:30:00Z',
            unitOfTime: UnitOfTime.days,
            enabledRange: ['2026-03-07', '2026-03-07', '2026-03-08'],
            legacyRange: ['2026-03-08', '2026-03-08', '2026-03-09'],
        },
    ])(
        'matches DATE SQL with timezone support on and off in $timezone at $now',
        ({ timezone, now, unitOfTime, enabledRange, legacyRange }) => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date(now));
            try {
                for (const enabled of [true, false]) {
                    const [start, lastDay, end] = enabled
                        ? enabledRange
                        : legacyRange;
                    const selection = {
                        ...rule([1], FilterOperator.IN_THE_PAST),
                        settings: { unitOfTime, completed: true },
                    };
                    const context = {
                        timezone,
                        fieldType: DimensionType.DATE,
                        useTimezoneAwareDateTrunc: enabled,
                    };
                    const sql = renderDateFilterSql({
                        dimensionSql: 'order_date',
                        filter: selection,
                        adapterType: SupportedDbtAdapter.POSTGRES,
                        timezone,
                        boundaryDateFormatter: enabled
                            ? createBoundaryDateFormatter(timezone)
                            : undefined,
                    });
                    expect(sql).toBe(
                        `((order_date) >= ('${start}') AND (order_date) < ('${end}'))`,
                    );
                    expect(
                        validateFilterBoundary(
                            {
                                type: 'date',
                                mode: 'fixed',
                                start,
                                end: lastDay,
                            },
                            selection,
                            context,
                        ),
                    ).toBeNull();
                    const boundary = {
                        type: 'date' as const,
                        mode: 'relative' as const,
                        value: 1,
                        unitOfTime,
                        completed: true,
                    };
                    expect(
                        validateFilterBoundary(
                            boundary,
                            rule([start, lastDay], FilterOperator.IN_BETWEEN),
                            context,
                        ),
                    ).toBeNull();
                    expect(
                        validateFilterBoundary(boundary, rule([end]), context),
                    ).not.toBeNull();
                }
            } finally {
                vi.useRealTimers();
            }
        },
    );

    it('rejects timestamp-shaped DATE literals outside their SQL calendar date and partial coarse relative buckets', () => {
        const boundary = {
            type: 'date' as const,
            mode: 'fixed' as const,
            start: '2026-02-28',
            end: '2026-02-28',
        };
        expect(
            validateFilterBoundary(boundary, rule(['2026-03-01T00:00:00Z']), {
                timezone: 'America/New_York',
                fieldType: DimensionType.DATE,
            }),
        ).not.toBeNull();
        expect(
            validateFilterBoundary(
                { ...boundary, start: '2026-03-01', end: '2026-03-15' },
                {
                    ...rule([], FilterOperator.IN_THE_CURRENT),
                    settings: { unitOfTime: UnitOfTime.days },
                },
                {
                    timezone: 'UTC',
                    now: new Date('2026-03-01T12:00:00Z'),
                    fieldType: DimensionType.DATE,
                    fieldGranularity: UnitOfTime.months,
                },
            ),
        ).not.toBeNull();
    });

    it('contains entire date periods and includes timestamps throughout the final fixed day', () => {
        const boundary = {
            type: 'date' as const,
            mode: 'fixed' as const,
            start: '2026-02-01',
            end: '2026-02-28',
        };
        const context = { timezone: 'America/New_York' };
        const month = {
            ...rule(['2026-02-01']),
            settings: { selectedPeriod: UnitOfTime.months as const },
        };
        expect(validateFilterBoundary(boundary, month, context)).toBeNull();
        expect(
            validateFilterBoundary(
                { ...boundary, start: '2026-02-02' },
                month,
                context,
            ),
        ).not.toBeNull();
        expect(
            validateFilterBoundary(
                boundary,
                rule(['2026-03-01T04:59:59Z']),
                context,
            ),
        ).toBeNull();
        expect(
            validateFilterBoundary(
                boundary,
                rule(['2026-03-01T05:00:00Z']),
                context,
            ),
        ).not.toBeNull();
        expect(
            validateFilterBoundary(boundary, rule(['2026-02-30']), context),
        ).not.toBeNull();
    });
    it('resolves moving and completed windows at query time in the query timezone', () => {
        const boundary = {
            type: 'date' as const,
            mode: 'relative' as const,
            value: 12,
            unitOfTime: UnitOfTime.months,
            completed: true,
        };
        const context = {
            timezone: 'America/New_York',
            now: new Date('2026-03-01T04:30:00Z'),
        };
        const february = {
            ...rule(['2026-02-01']),
            settings: { selectedPeriod: UnitOfTime.months as const },
        };
        expect(
            validateFilterBoundary(boundary, february, context),
        ).not.toBeNull();
        expect(
            validateFilterBoundary(boundary, february, {
                ...context,
                now: new Date('2026-03-01T05:00:00Z'),
            }),
        ).toBeNull();
        const old = rule(['2025-02-01']);
        expect(validateFilterBoundary(boundary, old, context)).toBeNull();
        expect(
            validateFilterBoundary(boundary, old, {
                ...context,
                now: new Date('2026-03-01T05:00:00Z'),
            }),
        ).not.toBeNull();
        const rolling = {
            ...boundary,
            completed: false,
            value: 300,
            unitOfTime: UnitOfTime.days,
        };
        expect(
            validateFilterBoundary(
                rolling,
                {
                    ...rule([300], FilterOperator.IN_THE_PAST),
                    settings: { unitOfTime: UnitOfTime.days },
                },
                context,
            ),
        ).toBeNull();
        expect(
            validateFilterBoundary(
                rolling,
                {
                    ...rule([301], FilterOperator.IN_THE_PAST),
                    settings: { unitOfTime: UnitOfTime.days },
                },
                context,
            ),
        ).not.toBeNull();
    });
    it('uses query case matching without trimming string values', () => {
        const boundary = {
            type: 'string' as const,
            values: ['Pending', ' Active '],
        };
        expect(
            validateFilterBoundary(boundary, rule(['Pending', ' Active '])),
        ).toBeNull();
        expect(
            validateFilterBoundary(boundary, rule(['pending'])),
        ).not.toBeNull();
        expect(
            validateFilterBoundary(boundary, rule(['pending']), {
                caseSensitive: false,
            }),
        ).toBeNull();
        expect(
            validateFilterBoundary(boundary, rule(['Active']), {
                caseSensitive: false,
            }),
        ).not.toBeNull();
        expect(
            validateFilterBoundary(boundary, rule(['Pending', 'Other'])),
        ).not.toBeNull();
        expect(
            validateFilterBoundary(
                boundary,
                rule(['Pending'], FilterOperator.NOT_EQUALS),
            ),
        ).not.toBeNull();
    });
    it('accepts inclusive decimal endpoints and rejects any out-of-range value or unbounded operator', () => {
        const boundary = { type: 'number' as const, min: 0, max: 100 };
        expect(
            validateFilterBoundary(boundary, rule([0, 99.5, 100])),
        ).toBeNull();
        for (const values of [[-0.1], [100.1], [50, 100.1], [''], [NaN]]) {
            expect(
                validateFilterBoundary(boundary, rule(values)),
            ).not.toBeNull();
        }
        expect(
            validateFilterBoundary(
                boundary,
                rule([0, 100], FilterOperator.IN_BETWEEN),
            ),
        ).toBeNull();
        expect(
            validateFilterBoundary(
                boundary,
                rule([100, 0], FilterOperator.IN_BETWEEN),
            ),
        ).not.toBeNull();
        expect(
            validateFilterBoundary(
                boundary,
                rule([50], FilterOperator.GREATER_THAN),
            ),
        ).not.toBeNull();
    });
});
