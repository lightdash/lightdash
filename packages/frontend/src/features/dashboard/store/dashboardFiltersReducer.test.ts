import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    dashboardFiltersActions as actions,
    dashboardFiltersReducer as reducer,
    emptyDashboardFilters,
    initialDashboardFiltersState,
    type DashboardFiltersState,
} from './dashboardFiltersReducer';
import { toSavedFilterOverride } from './savedFilterOverrides';

type Category = 'dimensions' | 'metrics';

const rule = (
    id: string,
    values: unknown[],
    extra: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id,
    label: undefined,
    target: { fieldId: `orders_${id}`, tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values,
    ...extra,
});

const filtersWith = (
    category: Category,
    rules: DashboardFilterRule[],
): DashboardFilters => ({ ...emptyDashboardFilters, [category]: rules });

const saved = rule('status', ['completed'], { tileTargets: {} });

const stateWith = (
    category: Category,
    overrides: Partial<DashboardFiltersState> = {},
): DashboardFiltersState => ({
    ...initialDashboardFiltersState,
    dashboardFilters: filtersWith(category, [saved]),
    originalDashboardFilters: filtersWith(category, [saved]),
    temporaryFilters: filtersWith(category, [saved]),
    ...overrides,
});

describe('dashboardFiltersReducer', () => {
    it('returns the initial state and ignores unknown actions', () => {
        const state = reducer(undefined, { type: '@@init' });
        expect(state).toBe(initialDashboardFiltersState);
        expect(reducer(state, { type: 'unknown' })).toBe(state);
    });

    describe('setters', () => {
        const filters = filtersWith('dimensions', [saved]);

        it.each([
            ['setDashboardFilters', 'dashboardFilters'],
            ['setTemporaryFilters', 'temporaryFilters'],
            ['setOriginalDashboardFilters', 'originalDashboardFilters'],
        ] as const)('%s sets %s', (action, key) => {
            const next = reducer(
                initialDashboardFiltersState,
                actions[action](filters),
            );
            expect(next[key]).toBe(filters);
            expect(reducer(next, actions[action](filters))).toBe(next);
        });

        it('setHaveFiltersChanged sets the flag and no-ops on the same value', () => {
            const next = reducer(
                initialDashboardFiltersState,
                actions.setHaveFiltersChanged(true),
            );
            expect(next.haveFiltersChanged).toBe(true);
            expect(reducer(next, actions.setHaveFiltersChanged(true))).toBe(
                next,
            );
        });
    });

    describe('addFilter', () => {
        it.each<[Category, boolean]>([
            ['dimensions', false],
            ['dimensions', true],
            ['metrics', false],
            ['metrics', true],
        ])('appends a %s filter (temporary: %s)', (category, isTemporary) => {
            const added = rule('region', ['EU']);
            const state = stateWith(category);
            const next = reducer(
                state,
                actions.addFilter({ filter: added, isTemporary, category }),
            );
            const target = isTemporary
                ? 'temporaryFilters'
                : 'dashboardFilters';
            const other = isTemporary ? 'dashboardFilters' : 'temporaryFilters';
            expect(next[target][category]).toEqual([saved, added]);
            expect(next[other]).toBe(state[other]);
            expect(next.haveFiltersChanged).toBe(true);
        });
    });

    describe('updateFilter', () => {
        const changed = { ...saved, values: ['returned'] };
        const reverted = { ...saved };
        const existingOverride = toSavedFilterOverride(saved);

        type Case = {
            name: string;
            isTemporary: boolean;
            isInEditMode: boolean;
            isFilterSaved: boolean;
            filter: DashboardFilterRule;
            startWithOverride: boolean;
            expectOverride: 'added' | 'removed' | 'unchanged';
        };
        const cases: Case[] = [
            {
                name: 'view mode change of a saved filter adds an override',
                isTemporary: false,
                isInEditMode: false,
                isFilterSaved: true,
                filter: changed,
                startWithOverride: false,
                expectOverride: 'added',
            },
            {
                name: 'view mode change of an unsaved filter adds nothing',
                isTemporary: false,
                isInEditMode: false,
                isFilterSaved: false,
                filter: changed,
                startWithOverride: false,
                expectOverride: 'unchanged',
            },
            {
                name: 'view mode revert to the original removes the override',
                isTemporary: false,
                isInEditMode: false,
                isFilterSaved: true,
                filter: reverted,
                startWithOverride: true,
                expectOverride: 'removed',
            },
            {
                name: 'edit mode change removes the override',
                isTemporary: false,
                isInEditMode: true,
                isFilterSaved: true,
                filter: changed,
                startWithOverride: true,
                expectOverride: 'removed',
            },
            {
                name: 'temporary change in view mode leaves overrides alone',
                isTemporary: true,
                isInEditMode: false,
                isFilterSaved: true,
                filter: changed,
                startWithOverride: true,
                expectOverride: 'unchanged',
            },
            {
                name: 'temporary change in edit mode leaves overrides alone',
                isTemporary: true,
                isInEditMode: true,
                isFilterSaved: true,
                filter: changed,
                startWithOverride: true,
                expectOverride: 'unchanged',
            },
        ];

        describe.each<Category>(['dimensions', 'metrics'])('%s', (category) => {
            it.each(cases)('$name', (testCase) => {
                const savedFilterOverrides = {
                    ...initialDashboardFiltersState.savedFilterOverrides,
                    [category]: testCase.startWithOverride
                        ? [existingOverride]
                        : [],
                };
                const state = stateWith(category, { savedFilterOverrides });
                const next = reducer(
                    state,
                    actions.updateFilter({
                        filter: testCase.filter,
                        index: 0,
                        isTemporary: testCase.isTemporary,
                        isInEditMode: testCase.isInEditMode,
                        isFilterSaved: testCase.isFilterSaved,
                        category,
                    }),
                );

                const target = testCase.isTemporary
                    ? 'temporaryFilters'
                    : 'dashboardFilters';
                expect(next[target][category]).toEqual([testCase.filter]);
                // quirk: a revert to the original still leaves the flag on
                expect(next.haveFiltersChanged).toBe(true);

                const overrides = next.savedFilterOverrides[category];
                switch (testCase.expectOverride) {
                    case 'added':
                        expect(overrides).toStrictEqual([
                            toSavedFilterOverride(testCase.filter),
                        ]);
                        break;
                    case 'removed':
                        expect(overrides).toStrictEqual([]);
                        break;
                    case 'unchanged':
                        expect(next.savedFilterOverrides).toBe(
                            state.savedFilterOverrides,
                        );
                        break;
                    default:
                        throw new Error('unknown expectation');
                }
            });
        });

        it('does not add an override when the value did not change', () => {
            const state = stateWith('dimensions', {
                originalDashboardFilters: filtersWith('dimensions', []),
            });
            const next = reducer(
                state,
                actions.updateFilter({
                    filter: { ...saved },
                    index: 0,
                    isTemporary: false,
                    isInEditMode: false,
                    isFilterSaved: true,
                    category: 'dimensions',
                }),
            );
            expect(next.savedFilterOverrides).toBe(state.savedFilterOverrides);
        });
    });

    describe('removeFilter', () => {
        it.each<Category>(['dimensions', 'metrics'])(
            'removes a saved %s filter and its URL override',
            (category) => {
                const state = stateWith(category, {
                    savedFilterOverrides: {
                        ...initialDashboardFiltersState.savedFilterOverrides,
                        [category]: [toSavedFilterOverride(saved)],
                    },
                });
                const next = reducer(
                    state,
                    actions.removeFilter({
                        index: 0,
                        isTemporary: false,
                        category,
                    }),
                );
                expect(next.dashboardFilters[category]).toEqual([]);
                expect(next.savedFilterOverrides[category]).toEqual([]);
                expect(next.haveFiltersChanged).toBe(true);
            },
        );

        it('keeps the URL override when removing a temporary filter', () => {
            const state = stateWith('dimensions', {
                savedFilterOverrides: {
                    ...initialDashboardFiltersState.savedFilterOverrides,
                    dimensions: [toSavedFilterOverride(saved)],
                },
            });
            const next = reducer(
                state,
                actions.removeFilter({
                    index: 0,
                    isTemporary: true,
                    category: 'dimensions',
                }),
            );
            expect(next.temporaryFilters.dimensions).toEqual([]);
            expect(next.dashboardFilters).toBe(state.dashboardFilters);
            expect(next.savedFilterOverrides).toBe(state.savedFilterOverrides);
        });

        it('does not throw for an out-of-range index', () => {
            const state = stateWith('dimensions');
            const next = reducer(
                state,
                actions.removeFilter({
                    index: 5,
                    isTemporary: false,
                    category: 'dimensions',
                }),
            );
            expect(next.dashboardFilters.dimensions).toEqual([saved]);
            expect(next.savedFilterOverrides).toBe(state.savedFilterOverrides);
        });
    });

    it('resetFilters restores filters, clears temporary filters and overrides', () => {
        const filters = filtersWith('dimensions', [saved]);
        const state = stateWith('dimensions', {
            haveFiltersChanged: true,
            savedFilterOverrides: {
                dimensions: [toSavedFilterOverride(saved)],
                metrics: [toSavedFilterOverride(saved)],
                tableCalculations: [toSavedFilterOverride(saved)],
            },
        });
        const next = reducer(state, actions.resetFilters(filters));
        expect(next.dashboardFilters).toBe(filters);
        expect(next.temporaryFilters).toBe(emptyDashboardFilters);
        expect(next.savedFilterOverrides.dimensions).toEqual([]);
        expect(next.savedFilterOverrides.metrics).toEqual([]);
        expect(next.savedFilterOverrides.tableCalculations).toHaveLength(1);
        // quirk: reset does not clear the changed flag
        expect(next.haveFiltersChanged).toBe(true);
    });

    describe('reconcileSavedFilterOverrideIds', () => {
        it('re-homes a field-matched override onto the saved filter id', () => {
            const state = stateWith('dimensions', {
                savedFilterOverrides: {
                    ...initialDashboardFiltersState.savedFilterOverrides,
                    dimensions: [
                        toSavedFilterOverride({ ...saved, id: 'stale-id' }),
                    ],
                },
            });
            const next = reducer(
                state,
                actions.reconcileSavedFilterOverrideIds(
                    filtersWith('dimensions', [saved]),
                ),
            );
            expect(next.savedFilterOverrides.dimensions[0].id).toBe('status');
        });

        it('returns the same state when ids are already current', () => {
            const state = stateWith('dimensions', {
                savedFilterOverrides: {
                    ...initialDashboardFiltersState.savedFilterOverrides,
                    dimensions: [toSavedFilterOverride(saved)],
                },
            });
            expect(
                reducer(
                    state,
                    actions.reconcileSavedFilterOverrideIds(
                        filtersWith('dimensions', [saved]),
                    ),
                ),
            ).toBe(state);
        });
    });

    describe('applySavedFilterOverrides', () => {
        it('applies dimension overrides and leaves metrics untouched without metric overrides', () => {
            const metric = rule('revenue', [100]);
            const state: DashboardFiltersState = {
                ...initialDashboardFiltersState,
                dashboardFilters: {
                    dimensions: [saved],
                    metrics: [metric],
                    tableCalculations: [],
                },
            };
            const override = { ...saved, values: ['returned'] };
            const next = reducer(
                state,
                actions.applySavedFilterOverrides(
                    filtersWith('dimensions', [override]),
                ),
            );
            expect(next.dashboardFilters.dimensions[0].values).toEqual([
                'returned',
            ]);
            expect(next.dashboardFilters.metrics).toBe(
                state.dashboardFilters.metrics,
            );
        });

        it('applies metric overrides when present', () => {
            const metric = rule('revenue', [100]);
            const state: DashboardFiltersState = {
                ...initialDashboardFiltersState,
                dashboardFilters: {
                    dimensions: [],
                    metrics: [metric],
                    tableCalculations: [],
                },
            };
            const next = reducer(
                state,
                actions.applySavedFilterOverrides(
                    filtersWith('metrics', [{ ...metric, values: [500] }]),
                ),
            );
            expect(next.dashboardFilters.metrics[0].values).toEqual([500]);
        });
    });
});
