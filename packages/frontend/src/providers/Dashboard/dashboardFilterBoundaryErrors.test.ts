import {
    DimensionType,
    FilterOperator,
    UnitOfTime,
    WeekDay,
    validateFilterBoundary,
    type DashboardFilterBoundarySourceContext,
    type DashboardFilters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getDashboardChartBoundaryErrors,
    getDashboardFilterBoundaryContexts,
} from './dashboardFilterBoundaryErrors';

const filters: DashboardFilters = {
    dimensions: [
        {
            id: 'date',
            label: undefined,
            target: { fieldId: 'orders_created_at', tableName: 'orders' },
            operator: FilterOperator.EQUALS,
            values: ['2026-03-02T04:00:00Z'],
            boundaries: {
                type: 'date',
                mode: 'fixed',
                start: '2026-03-01',
                end: '2026-03-01',
            },
        },
    ],
    metrics: [],
    tableCalculations: [],
};
const source: DashboardFilterBoundarySourceContext = {
    timezone: 'America/New_York',
    projectTimezone: 'UTC',
    startOfWeek: WeekDay.MONDAY,
    useTimezoneAwareDateTrunc: false,
    fields: { orders_created_at: { fieldType: DimensionType.TIMESTAMP } },
};
const args = {
    savedFilters: filters,
    filters,
    sessionTimezone: null,
    userTimezone: null,
    context: {},
};

describe('dashboard chart boundary errors', () => {
    it.each([
        { timezone: 'America/New_York', userTimezone: null },
        { timezone: 'user_timezone', userTimezone: 'America/New_York' },
    ])(
        'accepts a timestamp inside the chart day with $timezone',
        ({ timezone, userTimezone }) => {
            expect(
                getDashboardChartBoundaryErrors({
                    ...args,
                    userTimezone,
                    filterBoundaryContexts: {
                        chart: [{ ...source, timezone }],
                    },
                }),
            ).toEqual([]);
        },
    );
    it('rejects a selection outside any affected chart and honors excluded tiles', () => {
        const filterBoundaryContexts = {
            'new-york': [source],
            utc: [{ ...source, timezone: 'project_timezone' }],
        };
        expect(
            getDashboardChartBoundaryErrors({
                ...args,
                filterBoundaryContexts,
            }),
        ).toEqual(['Choose dates between 2026-03-01 and 2026-03-01.']);
        const savedFilters = {
            ...filters,
            dimensions: [
                {
                    ...filters.dimensions[0],
                    tileTargets: { utc: false as const },
                },
            ],
        };
        expect(
            getDashboardChartBoundaryErrors({
                ...args,
                savedFilters,
                filterBoundaryContexts,
            }),
        ).toEqual([]);
    });

    it('applies the viewing session override before chart and project timezones', () => {
        expect(
            getDashboardChartBoundaryErrors({
                ...args,
                sessionTimezone: 'UTC',
                filterBoundaryContexts: { chart: [source] },
            }),
        ).toHaveLength(1);
    });

    it('validates a mapped field in every merged source using its own precision', () => {
        const rule = {
            ...filters.dimensions[0],
            values: ['2026-03-01T18:00:00Z'],
            tileTargets: {
                merged: { fieldId: 'users_created_at', tableName: 'users' },
            },
        };
        const contexts = getDashboardFilterBoundaryContexts(rule, {
            ...args,
            filterBoundaryContexts: {
                merged: [
                    {
                        ...source,
                        fields: {
                            users_created_at: {
                                fieldType: DimensionType.TIMESTAMP,
                            },
                        },
                    },
                    {
                        ...source,
                        fields: {
                            users_created_at: {
                                fieldType: DimensionType.TIMESTAMP,
                                fieldGranularity: UnitOfTime.months,
                            },
                        },
                    },
                ],
            },
        });
        expect(contexts).toHaveLength(2);
        expect(
            contexts.map((context) =>
                validateFilterBoundary(rule.boundaries, rule, context),
            ),
        ).toEqual([null, 'Choose dates between 2026-03-01 and 2026-03-01.']);
    });

    it('uses the selected connection week start for a mapped chart', () => {
        const rule = {
            ...filters.dimensions[0],
            operator: FilterOperator.IN_THE_CURRENT,
            values: [1],
            settings: { unitOfTime: UnitOfTime.weeks },
            boundaries: {
                type: 'date' as const,
                mode: 'fixed' as const,
                start: '2026-03-02',
                end: '2026-03-08',
            },
        };
        const now = new Date('2026-03-04T12:00:00Z');
        const contextArgs = {
            ...args,
            context: { now },
        };
        const monday = getDashboardFilterBoundaryContexts(rule, {
            ...contextArgs,
            filterBoundaryContexts: { chart: [source] },
        });
        const sunday = getDashboardFilterBoundaryContexts(rule, {
            ...contextArgs,
            filterBoundaryContexts: {
                chart: [{ ...source, startOfWeek: WeekDay.SUNDAY }],
            },
        });
        expect(
            validateFilterBoundary(rule.boundaries, rule, monday[0]),
        ).toBeNull();
        expect(
            validateFilterBoundary(rule.boundaries, rule, sunday[0]),
        ).not.toBeNull();
    });

    it('rejects February at UTC rollover when it is still the current month in an affected chart', () => {
        const rule = {
            ...filters.dimensions[0],
            values: ['2026-02-15T12:00:00Z'],
            boundaries: {
                type: 'date' as const,
                mode: 'relative' as const,
                value: 1,
                unitOfTime: UnitOfTime.months,
                completed: true,
            },
        };
        const contexts = getDashboardFilterBoundaryContexts(rule, {
            ...args,
            context: { now: new Date('2026-03-01T00:30:00Z') },
            filterBoundaryContexts: {
                chart: [{ ...source, timezone: 'UTC' }, source],
            },
        });
        expect(
            contexts.map((context) =>
                validateFilterBoundary(rule.boundaries, rule, context),
            ),
        ).toEqual([null, 'Choose dates within the last 1 completed month.']);
    });
    it('preserves merged-query execution timezone semantics under a session override', () => {
        expect(
            getDashboardChartBoundaryErrors({
                ...args,
                sessionTimezone: 'UTC',
                filterBoundaryContexts: {
                    merged: [{ ...source, isMergeSource: true }],
                },
            }),
        ).toEqual([]);
    });

    it('uses the selected SQL connection week start and UTC despite a session override', () => {
        const rule = {
            ...filters.dimensions[0],
            operator: FilterOperator.IN_THE_CURRENT,
            values: [1],
            settings: { unitOfTime: UnitOfTime.weeks },
            boundaries: {
                type: 'date' as const,
                mode: 'fixed' as const,
                start: '2026-03-02',
                end: '2026-03-08',
            },
            tileTargets: {
                sql: {
                    fieldId: 'created_at',
                    tableName: 'orders',
                    isSqlColumn: true,
                    fallbackType: DimensionType.TIMESTAMP,
                },
            },
        };
        const contexts = getDashboardFilterBoundaryContexts(rule, {
            ...args,
            sessionTimezone: 'America/New_York',
            context: { now: new Date('2026-03-04T12:00:00Z') },
            filterBoundaryContexts: {
                sql: [
                    {
                        ...source,
                        isSqlChart: true,
                        fields: {},
                        startOfWeek: WeekDay.SUNDAY,
                    },
                ],
            },
        });
        expect(contexts).toHaveLength(1);
        expect(contexts[0].timezone).toBe('UTC');
        expect(
            validateFilterBoundary(rule.boundaries, rule, contexts[0]),
        ).not.toBeNull();
        expect(
            getDashboardFilterBoundaryContexts(
                { ...rule, tileTargets: undefined },
                {
                    ...args,
                    filterBoundaryContexts: {
                        sql: [{ ...source, isSqlChart: true, fields: {} }],
                    },
                },
            ),
        ).toEqual([]);
    });
});
