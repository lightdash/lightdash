import {
    applyDashboardFiltersForTile,
    DimensionType,
    FilterOperator,
    getFilterRulesFromGroup,
    TimeFrames,
    UnitOfTime,
    type DashboardFilterBoundary,
    type DashboardFilters,
    type Filters,
} from '@lightdash/common';
import { validExplore } from '../ProjectService/ProjectService.mock';
import {
    assertDashboardMetricFilterBoundaries,
    resolveDashboardFilterBoundaries,
} from './dashboardFilterBoundaries';

const selection = {
    id: 'status',
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'a_dim1' },
    values: ['Pending'],
};
const saved: DashboardFilters = {
    dimensions: [
        {
            ...selection,
            target: { fieldId: 'a_dim1', tableName: 'a' },
            label: undefined,
            boundaries: { type: 'string', values: ['Pending', 'Active'] },
        },
    ],
    metrics: [],
    tableCalculations: [],
};

describe('dashboard boundaries on derived queries', () => {
    it.each<{
        fieldType: DimensionType;
        boundary: DashboardFilterBoundary;
        expected: {
            operator: FilterOperator;
            values: (string | number)[];
            settings?: unknown;
        }[];
    }>([
        {
            fieldType: DimensionType.STRING,
            boundary: { type: 'string', values: ['Pending', 'Active'] },
            expected: [
                {
                    operator: FilterOperator.EQUALS,
                    values: ['Pending', 'Active'],
                },
            ],
        },
        {
            fieldType: DimensionType.NUMBER,
            boundary: { type: 'number', min: -1.25, max: 9.5 },
            expected: [
                { operator: FilterOperator.IN_BETWEEN, values: [-1.25, 9.5] },
            ],
        },
        {
            fieldType: DimensionType.TIMESTAMP,
            boundary: {
                type: 'date',
                mode: 'relative',
                value: 12,
                unitOfTime: UnitOfTime.months,
                completed: true,
            },
            expected: [
                {
                    operator: FilterOperator.IN_THE_PAST,
                    values: [12],
                    settings: {
                        unitOfTime: UnitOfTime.months,
                        completed: true,
                    },
                },
            ],
        },
        {
            fieldType: DimensionType.DATE,
            boundary: {
                type: 'date',
                mode: 'fixed',
                start: '2026-03-07',
                end: '2026-03-08',
            },
            expected: [
                {
                    operator: FilterOperator.GREATER_THAN_OR_EQUAL,
                    values: ['2026-03-07'],
                },
                { operator: FilterOperator.LESS_THAN, values: ['2026-03-09'] },
            ],
        },
        {
            fieldType: DimensionType.TIMESTAMP,
            boundary: {
                type: 'date',
                mode: 'fixed',
                start: '2026-03-07',
                end: '2026-03-08',
            },
            expected: [
                {
                    operator: FilterOperator.GREATER_THAN_OR_EQUAL,
                    values: ['2026-03-07T05:00:00.000Z'],
                },
                {
                    operator: FilterOperator.LESS_THAN,
                    values: ['2026-03-09T04:00:00.000Z'],
                },
            ],
        },
    ])(
        'runs unset $fieldType filters with their full authoritative $boundary.type boundary',
        ({ fieldType, boundary, expected }) => {
            const configured = {
                ...saved,
                dimensions: [{ ...saved.dimensions[0], boundaries: boundary }],
            };
            const explore = {
                ...validExplore,
                tables: {
                    ...validExplore.tables,
                    a: {
                        ...validExplore.tables.a,
                        dimensions: {
                            ...validExplore.tables.a.dimensions,
                            dim1: {
                                ...validExplore.tables.a.dimensions.dim1,
                                type: fieldType,
                            },
                        },
                    },
                },
            };
            const context = {
                timezone: 'America/New_York',
                useTimezoneAwareDateTrunc: true,
            };
            for (const dimensions of [
                [],
                [
                    {
                        ...configured.dimensions[0],
                        disabled: true,
                        boundaries: undefined,
                    },
                ],
            ]) {
                const result = resolveDashboardFilterBoundaries({
                    savedFilters: configured,
                    filters: { dimensions, metrics: [], tableCalculations: [] },
                    tileUuid: 'tile',
                    explore,
                    context,
                });
                expect(result.dimensions).toMatchObject(
                    expected.map((predicate) => ({
                        ...predicate,
                        disabled: false,
                    })),
                );
                const { metricQuery } = applyDashboardFiltersForTile({
                    tileUuid: 'tile',
                    explore,
                    dashboardFilters: result,
                    metricQuery: {
                        exploreName: explore.name,
                        dimensions: ['a_dim1'],
                        metrics: [],
                        filters: {},
                        sorts: [],
                        limit: 100,
                        tableCalculations: [],
                    },
                });
                expect(
                    getFilterRulesFromGroup(metricQuery.filters.dimensions),
                ).toMatchObject(expected);
                expect(() =>
                    assertDashboardMetricFilterBoundaries({
                        savedFilters: configured,
                        filters: metricQuery.filters,
                        tileUuid: 'tile',
                        explore,
                        context,
                    }),
                ).not.toThrow();
                if (expected.length === 2) {
                    const [lower] = getFilterRulesFromGroup(
                        metricQuery.filters.dimensions,
                    );
                    expect(() =>
                        assertDashboardMetricFilterBoundaries({
                            savedFilters: configured,
                            filters: {
                                dimensions: { id: 'and', and: [lower] },
                            },
                            tileUuid: 'tile',
                            explore,
                            context,
                        }),
                    ).toThrow(
                        'Choose a valid value for the following filters: dim1.',
                    );
                }
            }
        },
    );

    it('keeps independent same-field boundaries on their own tiles for omitted and explicit selections', () => {
        const configured: DashboardFilters = {
            ...saved,
            dimensions: [
                {
                    ...saved.dimensions[0],
                    id: 'pending',
                    values: ['Pending'],
                    boundaries: { type: 'string', values: ['Pending'] },
                    tileTargets: { active: false },
                },
                {
                    ...saved.dimensions[0],
                    id: 'active',
                    values: ['Active'],
                    boundaries: { type: 'string', values: ['Active'] },
                    tileTargets: { pending: false },
                },
            ],
        };
        for (const dimensions of [
            [],
            configured.dimensions,
            [
                {
                    ...configured.dimensions[0],
                    id: 'stale-pending',
                    boundaries: undefined,
                },
            ],
        ]) {
            for (const [tileUuid, value] of [
                ['pending', 'Pending'],
                ['active', 'Active'],
            ]) {
                const resolved = resolveDashboardFilterBoundaries({
                    savedFilters: configured,
                    filters: { ...configured, dimensions },
                    tileUuid,
                    explore: validExplore,
                    context: {},
                });
                expect(resolved.dimensions.map((rule) => rule.id)).toEqual([
                    'pending',
                    'active',
                ]);
                const { metricQuery } = applyDashboardFiltersForTile({
                    tileUuid,
                    explore: validExplore,
                    dashboardFilters: resolved,
                    metricQuery: {
                        exploreName: validExplore.name,
                        dimensions: ['a_dim1'],
                        metrics: [],
                        filters: {},
                        sorts: [],
                        limit: 100,
                        tableCalculations: [],
                    },
                });
                expect(
                    getFilterRulesFromGroup(metricQuery.filters.dimensions),
                ).toMatchObject([
                    { operator: FilterOperator.EQUALS, values: [value] },
                ]);
                expect(() =>
                    assertDashboardMetricFilterBoundaries({
                        savedFilters: configured,
                        filters: metricQuery.filters,
                        tileUuid,
                        explore: validExplore,
                        context: {},
                    }),
                ).not.toThrow();
            }
        }
    });

    it.each(['and', 'or'] as const)(
        'enforces the full boundary outside chart %s branches without inheriting nullable predicates',
        (operator) => {
            const resolved = resolveDashboardFilterBoundaries({
                savedFilters: saved,
                filters: { dimensions: [], metrics: [], tableCalculations: [] },
                tileUuid: 'tile',
                explore: validExplore,
                context: {},
            });
            const chartRules = [
                {
                    ...selection,
                    id: 'chart-status',
                    values: ['Other'],
                    includeNull: true,
                },
                {
                    id: 'chart-category',
                    operator: FilterOperator.EQUALS,
                    target: { fieldId: 'b_dim1' },
                    values: ['X'],
                },
            ];
            const group =
                operator === 'and'
                    ? { id: 'chart-group', and: chartRules }
                    : { id: 'chart-group', or: chartRules };
            const { metricQuery } = applyDashboardFiltersForTile({
                tileUuid: 'tile',
                explore: validExplore,
                dashboardFilters: resolved,
                metricQuery: {
                    exploreName: validExplore.name,
                    dimensions: ['a_dim1'],
                    metrics: [],
                    filters: { dimensions: group },
                    sorts: [],
                    limit: 100,
                    tableCalculations: [],
                },
            });
            expect(() =>
                assertDashboardMetricFilterBoundaries({
                    savedFilters: saved,
                    filters: metricQuery.filters,
                    tileUuid: 'tile',
                    explore: validExplore,
                    context: {},
                }),
            ).not.toThrow();
        },
    );

    const validate = (filters: Filters) =>
        assertDashboardMetricFilterBoundaries({
            savedFilters: saved,
            filters,
            tileUuid: 'tile',
            explore: validExplore,
            context: {},
        });

    it('requires the actual underlying-data predicate to constrain the field, not merely a valid source query', () => {
        expect(() =>
            validate({ dimensions: { id: 'and', and: [selection] } }),
        ).not.toThrow();
        for (const filters of [
            {},
            {
                dimensions: {
                    id: 'and',
                    and: [{ ...selection, values: ['Other'] }],
                },
            },
            {
                dimensions: {
                    id: 'or',
                    or: [
                        selection,
                        {
                            ...selection,
                            id: 'escape',
                            operator: FilterOperator.NOT_EQUALS,
                        },
                    ],
                },
            },
            { dimensions: { id: 'and', and: [{ id: 'or', or: [selection] }] } },
        ]) {
            expect(() => validate(filters)).toThrow(
                'Choose a valid value for the following filters: dim1.',
            );
        }
    });

    it('validates the effective date-zoom bucket rather than its unzoomed literal', () => {
        const dateField = {
            ...validExplore.tables.a.dimensions.dim1,
            type: DimensionType.DATE,
        };
        const args = {
            savedFilters: {
                ...saved,
                dimensions: [
                    {
                        ...saved.dimensions[0],
                        boundaries: {
                            type: 'date' as const,
                            mode: 'fixed' as const,
                            start: '2026-03-01',
                            end: '2026-03-15',
                        },
                    },
                ],
            },
            tileUuid: 'tile',
            explore: validExplore,
            context: { timezone: 'UTC' },
            filters: {
                dimensions: {
                    id: 'and',
                    and: [{ ...selection, values: ['2026-03-01'] }],
                },
            },
        };
        expect(() =>
            assertDashboardMetricFilterBoundaries({
                ...args,
                fields: { a_dim1: dateField },
            }),
        ).not.toThrow();
        const zoomedField = { ...dateField, timeInterval: TimeFrames.MONTH };
        expect(() =>
            assertDashboardMetricFilterBoundaries({
                ...args,
                fields: { a_dim1: zoomedField },
            }),
        ).toThrow('Choose a valid value for the following filters: dim1.');
    });

    it('revalidates the recorded date selection before a derived query after a calendar rollover', () => {
        const dateExplore = {
            ...validExplore,
            tables: {
                ...validExplore.tables,
                a: {
                    ...validExplore.tables.a,
                    dimensions: {
                        dim1: {
                            ...validExplore.tables.a.dimensions.dim1,
                            type: DimensionType.DATE,
                        },
                    },
                },
            },
        };
        const dateSaved: DashboardFilters = {
            ...saved,
            dimensions: [
                {
                    ...saved.dimensions[0],
                    boundaries: {
                        type: 'date',
                        mode: 'relative',
                        value: 1,
                        unitOfTime: UnitOfTime.months,
                        completed: true,
                    },
                },
            ],
        };
        const validateDate = (now: Date) =>
            assertDashboardMetricFilterBoundaries({
                savedFilters: dateSaved,
                tileUuid: 'tile',
                explore: dateExplore,
                filters: {
                    dimensions: {
                        id: 'and',
                        and: [{ ...selection, values: ['2026-02-10'] }],
                    },
                },
                context: {
                    now,
                    timezone: 'America/New_York',
                    useTimezoneAwareDateTrunc: true,
                },
            });
        expect(() =>
            validateDate(new Date('2026-04-01T03:59:59Z')),
        ).not.toThrow();
        expect(() => validateDate(new Date('2026-04-01T04:00:00Z'))).toThrow(
            'Choose a valid value for the following filters: dim1.',
        );
    });
});
