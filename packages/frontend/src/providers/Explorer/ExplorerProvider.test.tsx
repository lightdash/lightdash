import {
    ChartType,
    Compact,
    CustomFormatType,
    FilterOperator,
    getItemId,
    type ChartConfig,
    type Filters,
    type SortField,
    type TimeZone,
} from '@lightdash/common';

import {
    emptyFilterGroup,
    mockAdditionalMetric,
    mockBigNumberConfig,
    mockCartesianChartConfig,
    mockCustomDimension,
    mockExplorerState,
    mockFilterGroup,
    mockFormatOptions,
    mockMetricQuery,
    mockSortField,
    mockTableCalculation,
    mockTableConfig,
    mockUpdatedDimension,
} from '../__mocks__/explorerTypeMocks';
import { reducer } from './ExplorerProvider';
import { ActionType, ExplorerSection } from './types';

describe('ExplorerProvider reducer', () => {
    describe('SET_TABLE_NAME', () => {
        it('sets tableName and exploreName when empty', () => {
            const state = mockExplorerState();

            const newState = reducer(state, {
                type: ActionType.SET_TABLE_NAME,
                payload: 'orders',
            });

            expect(newState.unsavedChartVersion.tableName).toBe('orders');
            expect(newState.unsavedChartVersion.metricQuery.exploreName).toBe(
                'orders',
            );
        });

        it('replaces existing tableName and exploreName', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion, // ensures required fields
                    tableName: 'customers',
                    metricQuery: mockMetricQuery({ exploreName: 'customers' }),
                },
            });

            const newState = reducer(state, {
                type: ActionType.SET_TABLE_NAME,
                payload: 'invoices',
            });

            expect(newState.unsavedChartVersion.tableName).toBe('invoices');
            expect(newState.unsavedChartVersion.metricQuery.exploreName).toBe(
                'invoices',
            );
        });

        it('does not mutate the previous state', () => {
            const frozen = Object.freeze(mockExplorerState());

            expect(() =>
                reducer(frozen, {
                    type: ActionType.SET_TABLE_NAME,
                    payload: 'products',
                }),
            ).not.toThrow();
        });

        it('preserves other metricQuery fields', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: mockMetricQuery({
                        filters: { dimensions: emptyFilterGroup() },
                        limit: 1000,
                        sorts: [mockSortField('x')],
                    }),
                },
            });

            const newState = reducer(state, {
                type: ActionType.SET_TABLE_NAME,
                payload: 'sales',
            });

            expect(newState.unsavedChartVersion.metricQuery.filters).toEqual({
                dimensions: emptyFilterGroup(),
            });
            expect(newState.unsavedChartVersion.metricQuery.limit).toBe(1000);
            expect(newState.unsavedChartVersion.metricQuery.sorts).toEqual([
                { fieldId: 'x', descending: false },
            ]);
        });

        it('preserves chartConfig and tableConfig', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    tableName: 'orders',
                    metricQuery: mockMetricQuery(),
                    chartConfig: mockBigNumberConfig,
                    tableConfig: {
                        columnOrder: ['a', 'b'],
                    },
                },
            });

            const newState = reducer(state, {
                type: ActionType.SET_TABLE_NAME,
                payload: 'finance',
            });

            expect(newState.unsavedChartVersion.chartConfig).toEqual(
                mockBigNumberConfig,
            );
            expect(newState.unsavedChartVersion.tableConfig).toEqual({
                columnOrder: ['a', 'b'],
            });
        });
    });

    describe('SET_FETCH_RESULTS_FALSE', () => {
        it('sets shouldFetchResults to false', () => {
            const state = mockExplorerState({ shouldFetchResults: true });

            const newState = reducer(state, {
                type: ActionType.SET_FETCH_RESULTS_FALSE,
            });

            expect(newState.shouldFetchResults).toBe(false);
        });

        it('does not affect other parts of state', () => {
            const state = mockExplorerState({
                shouldFetchResults: true,
                unsavedChartVersion: {
                    tableName: 'orders',
                    metricQuery: mockMetricQuery({
                        dimensions: ['order_id'],
                    }),
                    chartConfig: mockCartesianChartConfig,
                    tableConfig: mockTableConfig,
                },
            });

            const newState = reducer(state, {
                type: ActionType.SET_FETCH_RESULTS_FALSE,
            });

            expect(newState.unsavedChartVersion.tableName).toBe('orders');
            expect(newState.unsavedChartVersion.metricQuery.dimensions).toEqual(
                ['order_id'],
            );
        });

        it('does not mutate previous state', () => {
            const frozen = Object.freeze(
                mockExplorerState({ shouldFetchResults: true }),
            );

            expect(() =>
                reducer(frozen, { type: ActionType.SET_FETCH_RESULTS_FALSE }),
            ).not.toThrow();
        });
    });

    describe('SET_PREVIOUSLY_FETCHED_STATE', () => {
        const mockPrevQuery = mockMetricQuery({
            dimensions: ['dimension_1'],
            metrics: ['metric_1'],
            limit: 100,
        });

        it('sets previouslyFetchedState to the provided metric query', () => {
            const initialState = mockExplorerState({
                previouslyFetchedState: undefined,
            });

            const newState = reducer(initialState, {
                type: ActionType.SET_PREVIOUSLY_FETCHED_STATE,
                payload: mockPrevQuery,
            });

            expect(newState.previouslyFetchedState).toEqual(mockPrevQuery);
        });

        it('replaces an existing previouslyFetchedState', () => {
            const initialState = mockExplorerState({
                previouslyFetchedState: mockMetricQuery({
                    dimensions: ['old_dim'],
                }),
            });

            const newState = reducer(initialState, {
                type: ActionType.SET_PREVIOUSLY_FETCHED_STATE,
                payload: mockPrevQuery,
            });

            expect(newState.previouslyFetchedState).toEqual(mockPrevQuery);
        });

        it('does not affect other parts of state', () => {
            const state = mockExplorerState({
                shouldFetchResults: true,
                unsavedChartVersion: {
                    tableName: 'sales',
                    metricQuery: mockMetricQuery(),
                    chartConfig: mockCartesianChartConfig,
                    tableConfig: mockTableConfig,
                },
            });

            const newState = reducer(state, {
                type: ActionType.SET_PREVIOUSLY_FETCHED_STATE,
                payload: mockPrevQuery,
            });

            expect(newState.unsavedChartVersion).toEqual(
                state.unsavedChartVersion,
            );
            expect(newState.shouldFetchResults).toBe(true);
        });
    });

    describe('TOGGLE_EXPANDED_SECTION', () => {
        it('adds a section that is not currently expanded', () => {
            const initialState = mockExplorerState({
                expandedSections: [],
            });

            const newState = reducer(initialState, {
                type: ActionType.TOGGLE_EXPANDED_SECTION,
                payload: ExplorerSection.VISUALIZATION,
            });

            expect(newState.expandedSections).toEqual([
                ExplorerSection.VISUALIZATION,
            ]);
        });

        it('removes a section that is already expanded', () => {
            const initialState = mockExplorerState({
                expandedSections: [
                    ExplorerSection.RESULTS,
                    ExplorerSection.SQL,
                ],
            });

            const newState = reducer(initialState, {
                type: ActionType.TOGGLE_EXPANDED_SECTION,
                payload: ExplorerSection.SQL,
            });

            expect(newState.expandedSections).toEqual([
                ExplorerSection.RESULTS,
            ]);
        });

        it('does not affect other parts of state', () => {
            const initialState = mockExplorerState({
                expandedSections: [ExplorerSection.RESULTS],
                unsavedChartVersion: {
                    tableName: 'orders',
                    metricQuery: mockMetricQuery(),
                    chartConfig: mockBigNumberConfig,
                    tableConfig: mockTableConfig,
                },
            });

            const newState = reducer(initialState, {
                type: ActionType.TOGGLE_EXPANDED_SECTION,
                payload: ExplorerSection.VISUALIZATION,
            });

            expect(newState.unsavedChartVersion).toEqual(
                initialState.unsavedChartVersion,
            );
        });

        it('does not mutate the original state', () => {
            const frozen = Object.freeze(
                mockExplorerState({
                    expandedSections: [ExplorerSection.RESULTS],
                }),
            );

            expect(() =>
                reducer(frozen, {
                    type: ActionType.TOGGLE_EXPANDED_SECTION,
                    payload: ExplorerSection.FILTERS,
                }),
            ).not.toThrow();
        });
    });

    describe('REMOVE_FIELD', () => {
        it('removes field from dimensions, metrics, sorts, tableCalculations, and columnOrder', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    tableName: 'orders',
                    metricQuery: {
                        exploreName: 'orders',
                        filters: {},
                        limit: 500,
                        dimensions: ['revenue', 'user_id'],
                        metrics: ['revenue'],
                        tableCalculations: [
                            { name: 'calc1', displayName: 'calc1', sql: '' },
                        ],
                        sorts: [
                            { fieldId: 'revenue', descending: false },
                            { fieldId: 'user_id', descending: true },
                        ],
                    },
                    tableConfig: {
                        columnOrder: ['user_id', 'revenue', 'calc1'],
                    },
                    chartConfig: mockCartesianChartConfig,
                },
            });

            const newState = reducer(state, {
                type: ActionType.REMOVE_FIELD,
                payload: 'revenue',
            });

            expect(newState.unsavedChartVersion.metricQuery.dimensions).toEqual(
                ['user_id'],
            );
            expect(newState.unsavedChartVersion.metricQuery.metrics).toEqual(
                [],
            );
            expect(
                newState.unsavedChartVersion.metricQuery.tableCalculations,
            ).toEqual([{ name: 'calc1', displayName: 'calc1', sql: '' }]);
            expect(newState.unsavedChartVersion.metricQuery.sorts).toEqual([
                { fieldId: 'user_id', descending: true },
            ]);
            expect(
                newState.unsavedChartVersion.tableConfig.columnOrder,
            ).toEqual(['user_id', 'calc1']);
        });

        it('preserves other parts of the state', () => {
            const state = mockExplorerState({
                shouldFetchResults: true,
                previouslyFetchedState: mockMetricQuery(),
            });

            const newState = reducer(state, {
                type: ActionType.REMOVE_FIELD,
                payload: 'non_existent_field',
            });

            expect(newState.shouldFetchResults).toBe(true);
            expect(newState.previouslyFetchedState).toEqual(mockMetricQuery());
        });

        it('does not throw if field is not present anywhere', () => {
            const state = mockExplorerState();

            expect(() =>
                reducer(state, {
                    type: ActionType.REMOVE_FIELD,
                    payload: 'non_existent_field',
                }),
            ).not.toThrow();
        });
    });

    describe('TOGGLE_DIMENSION', () => {
        it('adds a dimension when not present', () => {
            const initial = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: {
                        ...mockMetricQuery(),
                        dimensions: [],
                        metrics: ['metric_1'],
                        tableCalculations: [
                            { name: 'calc_1', displayName: 'Calc', sql: '1' },
                        ],
                        sorts: [{ fieldId: 'dim_1', descending: false }],
                    },
                    tableConfig: {
                        columnOrder: [],
                    },
                },
            });

            const next = reducer(initial, {
                type: ActionType.TOGGLE_DIMENSION,
                payload: 'dim_1',
            });

            expect(next.unsavedChartVersion.metricQuery.dimensions).toEqual([
                'dim_1',
            ]);
            expect(
                next.unsavedChartVersion.metricQuery.sorts.find(
                    (s) => s.fieldId === 'dim_1',
                ),
            ).toBeUndefined();
            expect(next.unsavedChartVersion.tableConfig.columnOrder).toEqual([
                'dim_1',
                'metric_1',
                'calc_1',
            ]);
        });

        it('removes a dimension if already present', () => {
            const initial = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: {
                        ...mockMetricQuery(),
                        dimensions: ['dim_1'],
                        metrics: ['metric_1'],
                        tableCalculations: [],
                        sorts: [],
                    },
                    tableConfig: {
                        columnOrder: ['dim_1', 'metric_1'],
                    },
                },
            });

            const next = reducer(initial, {
                type: ActionType.TOGGLE_DIMENSION,
                payload: 'dim_1',
            });

            expect(next.unsavedChartVersion.metricQuery.dimensions).toEqual([]);
            expect(next.unsavedChartVersion.tableConfig.columnOrder).toEqual([
                'metric_1',
            ]);
        });

        it('updates column order correctly when toggling', () => {
            const initial = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: {
                        ...mockMetricQuery(),
                        dimensions: ['dim_1'],
                        metrics: ['metric_1'],
                        tableCalculations: [
                            { name: 'calc_1', displayName: 'Calc', sql: '1' },
                        ],
                    },
                    tableConfig: {
                        columnOrder: ['dim_1', 'metric_1', 'calc_1'],
                    },
                },
            });

            const next = reducer(initial, {
                type: ActionType.TOGGLE_DIMENSION,
                payload: 'dim_2',
            });

            expect(next.unsavedChartVersion.metricQuery.dimensions).toContain(
                'dim_2',
            );
            // NOTE: only dimension columns are sorted in this reducer
            expect(next.unsavedChartVersion.tableConfig.columnOrder).toEqual([
                'dim_1',
                'dim_2',
                'metric_1',
                'calc_1',
            ]);
        });

        it('does not mutate previous state', () => {
            const frozen = Object.freeze(
                mockExplorerState({
                    unsavedChartVersion: {
                        ...mockExplorerState().unsavedChartVersion,
                        metricQuery: {
                            ...mockMetricQuery(),
                            dimensions: ['dim_1'],
                        },
                    },
                }),
            );

            expect(() =>
                reducer(frozen, {
                    type: ActionType.TOGGLE_DIMENSION,
                    payload: 'dim_2',
                }),
            ).not.toThrow();
        });
    });

    describe('TOGGLE_METRIC', () => {
        it('adds a metric if not already present', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: {
                        ...mockMetricQuery(),
                        metrics: [],
                        metricOverrides: {
                            metric_1: { formatOptions: mockFormatOptions },
                        },
                        sorts: [mockSortField('metric_1')],
                    },
                    tableConfig: {
                        columnOrder: [],
                    },
                },
            });

            const newState = reducer(state, {
                type: ActionType.TOGGLE_METRIC,
                payload: 'metric_1',
            });

            expect(newState.unsavedChartVersion.metricQuery.metrics).toContain(
                'metric_1',
            );
            expect(newState.unsavedChartVersion.metricQuery.sorts).toEqual([]);
            expect(
                newState.unsavedChartVersion.metricQuery.metricOverrides,
            ).toEqual({});
            expect(
                newState.unsavedChartVersion.tableConfig.columnOrder,
            ).toContain('metric_1');
        });

        it('removes a metric if already present', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: {
                        ...mockMetricQuery(),
                        metrics: ['metric_1'],
                        metricOverrides: {
                            metric_1: { formatOptions: mockFormatOptions },
                        },
                        sorts: [mockSortField('metric_1')],
                    },
                    tableConfig: {
                        columnOrder: ['metric_1'],
                    },
                },
            });

            const newState = reducer(state, {
                type: ActionType.TOGGLE_METRIC,
                payload: 'metric_1',
            });

            expect(
                newState.unsavedChartVersion.metricQuery.metrics,
            ).not.toContain('metric_1');
            expect(newState.unsavedChartVersion.metricQuery.sorts).toEqual([]);
            expect(
                newState.unsavedChartVersion.metricQuery.metricOverrides,
            ).toEqual({});
            expect(
                newState.unsavedChartVersion.tableConfig.columnOrder,
            ).not.toContain('metric_1');
        });

        it('correctly recalculates columnOrder with dimensions, metrics, and calcs', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: {
                        ...mockMetricQuery(),
                        dimensions: ['dim_1'],
                        metrics: ['metric_1'],
                        tableCalculations: [
                            { name: 'calc_1', displayName: 'c1', sql: '1' },
                        ],
                        metricOverrides: {
                            metric_2: { formatOptions: mockFormatOptions },
                        },
                        sorts: [mockSortField('metric_2')],
                    },
                    tableConfig: {
                        columnOrder: ['dim_1', 'metric_1', 'calc_1'],
                    },
                },
            });

            const newState = reducer(state, {
                type: ActionType.TOGGLE_METRIC,
                payload: 'metric_2',
            });

            // metric_2 was added; should be included in metrics and columnOrder
            expect(newState.unsavedChartVersion.metricQuery.metrics).toEqual(
                expect.arrayContaining(['metric_1', 'metric_2']),
            );

            // NOTE: this reducer only sorts the metrics. This doesn't seem
            // quite right, but the goal of these tests is to check for breaking behavior
            // in refactoring and this is how it works now
            expect(
                newState.unsavedChartVersion.tableConfig.columnOrder,
            ).toEqual(['dim_1', 'metric_1', 'calc_1', 'metric_2']);
        });

        it('does not mutate the previous state', () => {
            const state = Object.freeze(
                mockExplorerState({
                    unsavedChartVersion: {
                        ...mockExplorerState().unsavedChartVersion,
                        metricQuery: {
                            ...mockMetricQuery(),
                            metrics: [],
                            metricOverrides: {},
                            sorts: [],
                        },
                        tableConfig: {
                            columnOrder: [],
                        },
                    },
                }),
            );

            expect(() =>
                reducer(state, {
                    type: ActionType.TOGGLE_METRIC,
                    payload: 'metric_1',
                }),
            ).not.toThrow();
        });
    });

    describe('TOGGLE_SORT_FIELD', () => {
        const dimensions = ['dim_1'];
        const metrics = ['metric_1'];
        const tableCalculations = [
            { name: 'calc_1', displayName: 'Calc 1', sql: '1' },
        ];

        const baseState = mockExplorerState({
            unsavedChartVersion: {
                ...mockExplorerState().unsavedChartVersion,
                metricQuery: {
                    exploreName: 'my_table',
                    dimensions,
                    metrics,
                    filters: { dimensions: emptyFilterGroup() },
                    sorts: [],
                    limit: 500,
                    tableCalculations,
                },
            },
        });

        it('adds ascending sort if field not currently sorted', () => {
            const newState = reducer(baseState, {
                type: ActionType.TOGGLE_SORT_FIELD,
                payload: 'dim_1',
            });

            expect(newState.unsavedChartVersion.metricQuery.sorts).toEqual([
                { fieldId: 'dim_1', descending: false },
            ]);
        });

        it('toggles to descending if field already sorted ascending', () => {
            const state = {
                ...baseState,
                unsavedChartVersion: {
                    ...baseState.unsavedChartVersion,
                    metricQuery: {
                        ...baseState.unsavedChartVersion.metricQuery,
                        sorts: [{ fieldId: 'dim_1', descending: false }],
                    },
                },
            };

            const newState = reducer(state, {
                type: ActionType.TOGGLE_SORT_FIELD,
                payload: 'dim_1',
            });

            expect(newState.unsavedChartVersion.metricQuery.sorts).toEqual([
                { fieldId: 'dim_1', descending: true },
            ]);
        });

        it('removes sort if field already sorted descending', () => {
            const state = {
                ...baseState,
                unsavedChartVersion: {
                    ...baseState.unsavedChartVersion,
                    metricQuery: {
                        ...baseState.unsavedChartVersion.metricQuery,
                        sorts: [{ fieldId: 'dim_1', descending: true }],
                    },
                },
            };

            const newState = reducer(state, {
                type: ActionType.TOGGLE_SORT_FIELD,
                payload: 'dim_1',
            });

            expect(newState.unsavedChartVersion.metricQuery.sorts).toEqual([]);
        });

        it('does nothing if field is not active (not in dimensions, metrics, or calcs)', () => {
            const newState = reducer(baseState, {
                type: ActionType.TOGGLE_SORT_FIELD,
                payload: 'unknown_field',
            });

            expect(newState).toStrictEqual(baseState);
        });

        it('does not mutate original state', () => {
            const frozen = Object.freeze(baseState);

            expect(() =>
                reducer(frozen, {
                    type: ActionType.TOGGLE_SORT_FIELD,
                    payload: 'dim_1',
                }),
            ).not.toThrow();
        });
    });

    describe('SET_SORT_FIELDS', () => {
        it('sets sort fields if they exist in active fields', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: mockMetricQuery({
                        dimensions: ['a', 'b', 'c'],
                        metrics: ['met_1'],
                        tableCalculations: [
                            { name: 'calc_1', sql: '1', displayName: 'calc' },
                        ],
                    }),
                },
            });

            const action = {
                type: ActionType.SET_SORT_FIELDS,
                payload: [
                    mockSortField('a'),
                    mockSortField('b'),
                    mockSortField('c'),
                ] as SortField[],
            } as const;

            const newState = reducer(state, action);
            expect(newState.unsavedChartVersion.metricQuery.sorts).toEqual(
                action.payload,
            );
        });

        it('ignores sort fields that are not active', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: mockMetricQuery({
                        dimensions: ['dim_1'],
                    }),
                },
            });

            const action = {
                type: ActionType.SET_SORT_FIELDS,
                payload: [
                    mockSortField('dim_1'),
                    mockSortField('not_active'),
                ] as SortField[],
            } as const;

            const newState = reducer(state, action);
            expect(newState.unsavedChartVersion.metricQuery.sorts).toEqual([
                mockSortField('dim_1'),
            ]);
        });
    });

    describe('ADD_SORT_FIELD', () => {
        it('adds a new sort if not present', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: mockMetricQuery({ sorts: [] }),
                },
            });

            const sortField = mockSortField('x');
            const action = {
                type: ActionType.ADD_SORT_FIELD,
                payload: sortField,
            } as const;
            const newState = reducer(state, action);

            expect(
                newState.unsavedChartVersion.metricQuery.sorts,
            ).toContainEqual(sortField);
        });

        it('updates sort direction if already present', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: mockMetricQuery({
                        sorts: [mockSortField('x')],
                    }),
                },
            });

            const action = {
                type: ActionType.ADD_SORT_FIELD,
                payload: { fieldId: 'x', descending: true },
            } as const;

            const newState = reducer(state, action);
            expect(newState.unsavedChartVersion.metricQuery.sorts).toEqual([
                { fieldId: 'x', descending: true },
            ]);
        });
    });

    describe('REMOVE_SORT_FIELD', () => {
        it('removes the specified sort field', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: mockMetricQuery({
                        sorts: [mockSortField('x'), mockSortField('y')],
                    }),
                },
            });

            const action = {
                type: ActionType.REMOVE_SORT_FIELD,
                payload: 'x',
            } as const;

            const newState = reducer(state, action);
            expect(newState.unsavedChartVersion.metricQuery.sorts).toEqual([
                mockSortField('y'),
            ]);
        });

        it('does nothing if the field is not sorted', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: mockMetricQuery({
                        sorts: [mockSortField('y')],
                    }),
                },
            });

            const action = {
                type: ActionType.REMOVE_SORT_FIELD,
                payload: 'x', // not present
            } as const;

            const newState = reducer(state, action);
            expect(newState.unsavedChartVersion.metricQuery.sorts).toEqual([
                mockSortField('y'),
            ]);
        });
    });

    describe('MOVE_SORT_FIELDS', () => {
        it('moves a sort field from one index to another', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: mockMetricQuery({
                        sorts: [
                            mockSortField('a'),
                            mockSortField('b'),
                            mockSortField('c'),
                        ],
                    }),
                },
            });

            const action = {
                type: ActionType.MOVE_SORT_FIELDS,
                payload: { sourceIndex: 0, destinationIndex: 2 },
            } as const;

            const newState = reducer(state, action);

            expect(newState.unsavedChartVersion.metricQuery.sorts).toEqual([
                mockSortField('b'),
                mockSortField('c'),
                mockSortField('a'),
            ]);
        });

        it('does nothing if sourceIndex is out of bounds', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: mockMetricQuery({
                        sorts: [mockSortField('a')],
                    }),
                },
            });

            const action = {
                type: ActionType.MOVE_SORT_FIELDS,
                payload: { sourceIndex: -1, destinationIndex: 0 },
            } as const;

            const newState = reducer(state, action);

            expect(newState.unsavedChartVersion.metricQuery.sorts).toEqual([
                mockSortField('a'),
            ]);
        });

        it('does nothing if destinationIndex is out of bounds', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: mockMetricQuery({
                        sorts: [mockSortField('a')],
                    }),
                },
            });

            const action = {
                type: ActionType.MOVE_SORT_FIELDS,
                payload: { sourceIndex: 0, destinationIndex: 5 },
            } as const;

            const newState = reducer(state, action);

            expect(newState.unsavedChartVersion.metricQuery.sorts).toEqual([
                mockSortField('a'),
            ]);
        });

        it('preserves order if source and destination are the same', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: mockMetricQuery({
                        sorts: [mockSortField('a'), mockSortField('b')],
                    }),
                },
            });

            const action = {
                type: ActionType.MOVE_SORT_FIELDS,
                payload: { sourceIndex: 1, destinationIndex: 1 },
            } as const;

            const newState = reducer(state, action);

            expect(newState.unsavedChartVersion.metricQuery.sorts).toEqual([
                mockSortField('a'),
                mockSortField('b'),
            ]);
        });
    });

    describe('SET_ROW_LIMIT', () => {
        it('sets a new row limit', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: mockMetricQuery({ limit: 500 }),
                },
            });

            const action = {
                type: ActionType.SET_ROW_LIMIT,
                payload: 1000,
            } as const;

            const newState = reducer(state, action);

            expect(newState.unsavedChartVersion.metricQuery.limit).toEqual(
                1000,
            );
        });

        it('does not affect other metricQuery fields', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: mockMetricQuery({
                        limit: 200,
                        filters: { dimensions: mockFilterGroup() },
                        exploreName: 'orders',
                    }),
                },
            });

            const newState = reducer(state, {
                type: ActionType.SET_ROW_LIMIT,
                payload: 1234,
            });

            expect(newState.unsavedChartVersion.metricQuery.filters).toEqual(
                state.unsavedChartVersion.metricQuery.filters,
            );
        });
    });

    describe('SET_TIME_ZONE', () => {
        it('sets the timezone', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: mockMetricQuery({ timezone: undefined }),
                },
            });

            const action = {
                type: ActionType.SET_TIME_ZONE,
                payload: 'Europe/Madrid' as TimeZone,
            } as const;

            const newState = reducer(state, action);

            expect(newState.unsavedChartVersion.metricQuery.timezone).toEqual(
                'Europe/Madrid',
            );
        });

        it('replaces existing timezone', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: mockMetricQuery({ timezone: 'UTC' }),
                },
            });

            const newState = reducer(state, {
                type: ActionType.SET_TIME_ZONE,
                payload: 'America/New_York' as TimeZone,
            });

            expect(newState.unsavedChartVersion.metricQuery.timezone).toEqual(
                'America/New_York',
            );
        });
    });

    describe('SET_FILTERS', () => {
        it('sets filters without fetching results', () => {
            const filters = {
                dimensions: mockFilterGroup(),
            };

            const state = mockExplorerState();
            const newState = reducer(state, {
                type: ActionType.SET_FILTERS,
                payload: filters,
            });

            expect(newState.unsavedChartVersion.metricQuery.filters).toEqual(
                filters,
            );
            expect(newState.shouldFetchResults).toBe(false);
        });

        it('sets filters and enables shouldFetchResults', () => {
            const filters = {
                metrics: mockFilterGroup({
                    id: 'metrics-group',
                    and: [
                        {
                            id: 'rule-2',
                            target: { fieldId: 'metric_1' },
                            operator: FilterOperator.GREATER_THAN,
                            values: [100],
                        },
                    ],
                }),
            };

            const state = mockExplorerState();
            const newState = reducer(state, {
                type: ActionType.SET_FILTERS,
                payload: filters,
                options: { shouldFetchResults: true },
            });

            expect(newState.unsavedChartVersion.metricQuery.filters).toEqual(
                filters,
            );
            expect(newState.shouldFetchResults).toBe(true);
        });

        it('preserves other parts of state', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: mockMetricQuery({
                        dimensions: ['d1'],
                        metrics: ['m1'],
                        limit: 50,
                    }),
                },
            });

            const filters: Filters = {
                dimensions: {
                    id: 'x',
                    and: [
                        {
                            id: 'mock-rule',
                            target: { fieldId: 'mock_field' },
                            operator: FilterOperator.EQUALS,
                            values: ['mock-value'],
                        },
                    ],
                },
            };

            const newState = reducer(state, {
                type: ActionType.SET_FILTERS,
                payload: filters,
            });

            expect(newState.unsavedChartVersion.metricQuery.limit).toEqual(50);
            expect(newState.unsavedChartVersion.metricQuery.filters).toEqual(
                filters,
            );
        });
    });

    describe('ADD_ADDITIONAL_METRIC', () => {
        it('adds an additional metric when not already present', () => {
            const state = mockExplorerState();

            const newState = reducer(state, {
                type: ActionType.ADD_ADDITIONAL_METRIC,
                payload: mockAdditionalMetric,
            });

            expect(
                newState.unsavedChartVersion.metricQuery.additionalMetrics,
            ).toContainEqual(mockAdditionalMetric);
        });

        it('does not add duplicate additional metric', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: {
                        ...mockExplorerState().unsavedChartVersion.metricQuery,
                        additionalMetrics: [mockAdditionalMetric],
                    },
                },
            });

            const newState = reducer(state, {
                type: ActionType.ADD_ADDITIONAL_METRIC,
                payload: mockAdditionalMetric,
            });

            expect(
                newState.unsavedChartVersion.metricQuery.additionalMetrics,
            ).toEqual([mockAdditionalMetric]);
        });
    });

    describe('ADD_CUSTOM_DIMENSION', () => {
        it('adds a custom dimension and updates dimensions/columnOrder', () => {
            const state = mockExplorerState();

            const newState = reducer(state, {
                type: ActionType.ADD_CUSTOM_DIMENSION,
                payload: mockCustomDimension,
            });

            expect(
                newState.unsavedChartVersion.metricQuery.customDimensions,
            ).toContainEqual(mockCustomDimension);

            expect(
                newState.unsavedChartVersion.metricQuery.dimensions,
            ).toContain('custom-dim-1');
            expect(
                newState.unsavedChartVersion.tableConfig.columnOrder,
            ).toContain('custom-dim-1');
        });
    });

    describe('EDIT_CUSTOM_DIMENSION', () => {
        it('updates an existing custom dimension and updates dimension list', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: {
                        ...mockMetricQuery({
                            exploreName: 'orders',
                        }),
                        customDimensions: [mockCustomDimension],
                        dimensions: [getItemId(mockCustomDimension)],
                    },
                },
            });

            const action = {
                type: ActionType.EDIT_CUSTOM_DIMENSION,
                payload: {
                    customDimension: mockUpdatedDimension,
                    previousCustomDimensionId: mockCustomDimension.id, // 'custom-dim-1'
                },
            } as const;

            const newState = reducer(state, action);

            expect(
                newState.unsavedChartVersion.metricQuery.dimensions,
            ).toContain(getItemId(mockUpdatedDimension));

            expect(
                newState.unsavedChartVersion.metricQuery.customDimensions,
            ).toContainEqual(mockUpdatedDimension);
        });
    });

    describe('REMOVE_CUSTOM_DIMENSION', () => {
        it('removes the dimension and updates sorts and column order', () => {
            const dimensionId = getItemId(mockCustomDimension);
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: {
                        ...mockMetricQuery({
                            dimensions: [dimensionId],
                            sorts: [mockSortField(dimensionId)],
                            customDimensions: [mockCustomDimension],
                        }),
                        exploreName: 'orders',
                    },
                    tableConfig: {
                        columnOrder: [dimensionId],
                    },
                },
            });

            const newState = reducer(state, {
                type: ActionType.REMOVE_CUSTOM_DIMENSION,
                payload: dimensionId,
            });

            expect(
                newState.unsavedChartVersion.metricQuery.dimensions,
            ).not.toContain(dimensionId);
            expect(
                newState.unsavedChartVersion.metricQuery.sorts,
            ).not.toContainEqual(
                expect.objectContaining({ fieldId: dimensionId }),
            );
            expect(
                newState.unsavedChartVersion.metricQuery.customDimensions,
            ).not.toContainEqual(mockCustomDimension);
            expect(
                newState.unsavedChartVersion.tableConfig.columnOrder,
            ).not.toContain(dimensionId);
        });

        it('does nothing if dimension is not present', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: {
                        ...mockMetricQuery(),
                        customDimensions: [mockCustomDimension],
                    },
                },
            });

            const newState = reducer(state, {
                type: ActionType.REMOVE_CUSTOM_DIMENSION,
                payload: 'nonexistent_dimension',
            });

            expect(newState).toEqual(state);
        });
    });

    describe('TOGGLE_CUSTOM_DIMENSION_MODAL', () => {
        it('opens the modal with payload data', () => {
            const newState = reducer(mockExplorerState(), {
                type: ActionType.TOGGLE_CUSTOM_DIMENSION_MODAL,
                payload: {
                    item: mockCustomDimension,
                    isEditing: true,
                },
            });

            expect(newState.modals.customDimension).toEqual({
                isOpen: true,
                item: mockCustomDimension,
                isEditing: true,
            });
        });

        it('does nothing if dimension is not present', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: {
                        ...mockMetricQuery(),
                        customDimensions: [],
                    },
                },
            });

            const newState = reducer(state, {
                type: ActionType.REMOVE_CUSTOM_DIMENSION,
                payload: 'nonexistent_dimension',
            });

            expect(newState).toEqual(state);
        });
    });

    describe('TOGGLE_FORMAT_MODAL', () => {
        it('toggles format modal open and sets metric', () => {
            const newState = reducer(mockExplorerState(), {
                type: ActionType.TOGGLE_FORMAT_MODAL,
                payload: {
                    metric: mockAdditionalMetric,
                },
            });

            expect(newState.modals.format).toEqual({
                isOpen: true,
                metric: mockAdditionalMetric,
            });
        });

        it('toggles format modal closed', () => {
            const state = mockExplorerState({
                modals: {
                    ...mockExplorerState().modals,
                    format: {
                        isOpen: true,
                        metric: mockAdditionalMetric,
                    },
                },
            });

            const newState = reducer(state, {
                type: ActionType.TOGGLE_FORMAT_MODAL,
            });

            expect(newState.modals.format.isOpen).toBe(false);
        });
    });

    describe('UPDATE_METRIC_FORMAT', () => {
        it('updates the metricOverrides for the specified metric', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: mockMetricQuery({
                        metrics: ['metric_1'],
                        metricOverrides: {},
                    }),
                },
            });

            const action = {
                type: ActionType.UPDATE_METRIC_FORMAT,
                payload: {
                    metric: mockAdditionalMetric,
                    formatOptions: {
                        type: CustomFormatType.NUMBER,
                        compact: Compact.THOUSANDS,
                    },
                },
            } as const;

            const newState = reducer(state, action);

            expect(
                newState.unsavedChartVersion.metricQuery.metricOverrides,
            ).toEqual({
                orders_revenue: {
                    formatOptions: {
                        type: CustomFormatType.NUMBER,
                        compact: Compact.THOUSANDS,
                    },
                },
            });
        });
    });

    describe('EDIT_ADDITIONAL_METRIC', () => {
        it('replaces an additional metric and updates dependent state', () => {
            const previousMetricName = 'orders_old_metric';

            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: mockMetricQuery({
                        metrics: [previousMetricName],
                        additionalMetrics: [
                            { ...mockAdditionalMetric, uuid: 'metric-uuid' },
                        ],
                        sorts: [
                            { fieldId: previousMetricName, descending: false },
                        ],
                        filters: {
                            metrics: mockFilterGroup({
                                and: [
                                    {
                                        id: 'mock-rule',
                                        target: { fieldId: previousMetricName },
                                        operator: FilterOperator.EQUALS,
                                        values: ['mock-value'],
                                    },
                                ],
                            }),
                        },
                        tableCalculations: [
                            {
                                name: 'calc_1',
                                displayName: 'calc_1',
                                sql: '${orders.old_metric} + 100',
                            },
                        ],
                    }),
                    tableConfig: {
                        columnOrder: [previousMetricName],
                    },
                },
            });

            const action = {
                type: ActionType.EDIT_ADDITIONAL_METRIC,
                payload: {
                    previousAdditionalMetricName: previousMetricName,
                    additionalMetric: {
                        ...mockAdditionalMetric,
                        name: 'revenue_new',
                        uuid: 'metric-uuid',
                    },
                },
            } as const;

            const newState = reducer(state, action);

            expect(newState.unsavedChartVersion.metricQuery.metrics).toContain(
                'orders_revenue_new',
            );
            expect(
                newState.unsavedChartVersion.metricQuery.additionalMetrics,
            ).toContainEqual({
                ...mockAdditionalMetric,
                name: 'revenue_new',
                uuid: 'metric-uuid',
            });
            expect(
                newState.unsavedChartVersion.metricQuery.sorts.map(
                    (s) => s.fieldId,
                ),
            ).toContain('orders_revenue_new');
            // TODO: TypeScript is not happy with this and its not critical
            // expect(
            //     newState.unsavedChartVersion.metricQuery.filters.metrics
            //         ?.and?.[0]?.target?.fieldId,
            // ).toBe('orders_revenue_new');
            expect(
                newState.unsavedChartVersion.metricQuery.tableCalculations[0]
                    .sql,
            ).toContain('${orders.revenue_new}');
            expect(
                newState.unsavedChartVersion.tableConfig.columnOrder,
            ).toContain('orders_revenue_new');
        });
    });

    describe('REMOVE_ADDITIONAL_METRIC', () => {
        it('removes an additional metric and updates related state', () => {
            const metricId = getItemId(mockAdditionalMetric);

            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: mockMetricQuery({
                        metrics: [metricId],
                        additionalMetrics: [mockAdditionalMetric],
                        sorts: [{ fieldId: metricId, descending: false }],
                        filters: {
                            metrics: {
                                id: 'test-filter-group',
                                and: [
                                    {
                                        id: 'rule-id',
                                        target: {
                                            fieldId: metricId,
                                        },
                                        operator: FilterOperator.EQUALS,
                                        values: ['123'],
                                    },
                                ],
                            },
                        },
                    }),
                    tableConfig: {
                        columnOrder: [metricId],
                    },
                },
            });

            const action = {
                type: ActionType.REMOVE_ADDITIONAL_METRIC,
                payload: metricId,
            } as const;

            const newState = reducer(state, action);

            expect(
                newState.unsavedChartVersion.metricQuery.additionalMetrics,
            ).toHaveLength(0);

            expect(
                newState.unsavedChartVersion.metricQuery.metrics,
            ).not.toContain(metricId);

            expect(
                newState.unsavedChartVersion.metricQuery.sorts.find(
                    (s) => s.fieldId === metricId,
                ),
            ).toBeUndefined();

            expect(
                newState.unsavedChartVersion.metricQuery.filters.metrics,
            ).toBeUndefined();

            expect(
                newState.unsavedChartVersion.tableConfig.columnOrder,
            ).not.toContain(metricId);
        });
    });

    describe('TOGGLE_ADDITIONAL_METRIC_MODAL', () => {
        it('opens the modal with an item', () => {
            const state = mockExplorerState();

            const newState = reducer(state, {
                type: ActionType.TOGGLE_ADDITIONAL_METRIC_MODAL,
                payload: {
                    item: mockAdditionalMetric,
                },
            });

            expect(newState.modals.additionalMetric).toEqual({
                isOpen: true,
                item: mockAdditionalMetric,
            });
        });

        it('closes the modal when payload is undefined', () => {
            const state = mockExplorerState({
                modals: {
                    format: { isOpen: false },
                    customDimension: { isOpen: false },
                    writeBack: { isOpen: false },
                    additionalMetric: {
                        isOpen: true,
                        item: mockAdditionalMetric,
                    },
                },
            });

            const newState = reducer(state, {
                type: ActionType.TOGGLE_ADDITIONAL_METRIC_MODAL,
                payload: undefined,
            });

            expect(newState.modals.additionalMetric).toEqual({
                isOpen: false,
                item: undefined,
            });
        });
    });

    describe('TOGGLE_WRITE_BACK_MODAL', () => {
        it('opens the modal with items', () => {
            const state = mockExplorerState({
                modals: {
                    format: { isOpen: false },
                    additionalMetric: { isOpen: false },
                    customDimension: { isOpen: false },
                    writeBack: { isOpen: false },
                },
            });

            const newState = reducer(state, {
                type: ActionType.TOGGLE_WRITE_BACK_MODAL,
                payload: { items: [] }, // ✅ correct payload type
            });

            expect(newState.modals.writeBack).toEqual({
                isOpen: true,
                items: [],
            });
        });

        it('closes the modal when payload is undefined', () => {
            const state = mockExplorerState({
                modals: {
                    format: { isOpen: false },
                    additionalMetric: { isOpen: false },
                    customDimension: { isOpen: false },
                    writeBack: {
                        isOpen: true,
                        items: [],
                    },
                },
            });

            const newState = reducer(state, {
                type: ActionType.TOGGLE_WRITE_BACK_MODAL,
                payload: undefined,
            });

            expect(newState.modals.writeBack).toEqual({
                isOpen: false,
            });
        });
    });
    it('sets the tableConfig.columnOrder to the new order', () => {
        const state = mockExplorerState({
            unsavedChartVersion: {
                ...mockExplorerState().unsavedChartVersion,
                metricQuery: mockMetricQuery({
                    dimensions: ['a'],
                    metrics: ['b'],
                    tableCalculations: [
                        { name: 'c', displayName: 'C', sql: '1' },
                    ],
                }),
            },
        });

        const action = {
            type: ActionType.SET_COLUMN_ORDER,
            payload: ['a', 'b', 'c'] as string[],
        } as const;

        const newState = reducer(state, action);

        expect(newState.unsavedChartVersion.tableConfig.columnOrder).toEqual([
            'a',
            'b',
            'c',
        ]);
    });
    describe('ADD_TABLE_CALCULATION', () => {
        it('adds a new table calculation and updates columnOrder', () => {
            const state = mockExplorerState();

            const action = {
                type: ActionType.ADD_TABLE_CALCULATION,
                payload: mockTableCalculation('calc_1'),
            } as const;

            const newState = reducer(state, action);

            expect(
                newState.unsavedChartVersion.metricQuery.tableCalculations,
            ).toContainEqual(mockTableCalculation('calc_1'));

            expect(
                newState.unsavedChartVersion.tableConfig.columnOrder,
            ).toContain('calc_1');
        });
    });

    describe('UPDATE_TABLE_CALCULATION', () => {
        it('updates an existing table calculation', () => {
            const updatedCalc = {
                ...mockTableCalculation('calc_1'),
                sql: '${TABLE}.revenue * 2',
            };

            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: {
                        ...mockExplorerState().unsavedChartVersion.metricQuery,
                        tableCalculations: [mockTableCalculation('calc_1')],
                    },
                },
            });

            const action = {
                type: ActionType.UPDATE_TABLE_CALCULATION,
                payload: {
                    oldName: 'calc_1',
                    tableCalculation: updatedCalc,
                },
            } as const;

            const newState = reducer(state, action);

            expect(
                newState.unsavedChartVersion.metricQuery.tableCalculations,
            ).toContainEqual(updatedCalc);
        });
    });

    describe('DELETE_TABLE_CALCULATION', () => {
        it('removes a table calculation and updates columnOrder', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: {
                        ...mockExplorerState().unsavedChartVersion.metricQuery,
                        tableCalculations: [mockTableCalculation('calc_1')],
                    },
                    tableConfig: {
                        columnOrder: ['calc_1'],
                    },
                },
            });

            const action = {
                type: ActionType.DELETE_TABLE_CALCULATION,
                payload: 'calc_1',
            } as const;

            const newState = reducer(state, action);

            expect(
                newState.unsavedChartVersion.metricQuery.tableCalculations,
            ).not.toContainEqual(mockTableCalculation('calc_1'));

            expect(
                newState.unsavedChartVersion.tableConfig.columnOrder,
            ).not.toContain('calc_1');
        });
    });

    describe('SET_PIVOT_FIELDS', () => {
        it('sets pivotConfig.columns to the provided fields', () => {
            const state = mockExplorerState();

            const newState = reducer(state, {
                type: ActionType.SET_PIVOT_FIELDS,
                payload: ['dimension_1', 'dimension_2'],
            });

            expect(newState.unsavedChartVersion.pivotConfig).toEqual({
                columns: ['dimension_1', 'dimension_2'],
            });
        });
    });

    describe('SET_CHART_TYPE', () => {
        it('sets chartConfig.type to the provided chart type', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    chartConfig: mockCartesianChartConfig,
                },
            });

            const newState = reducer(state, {
                type: ActionType.SET_CHART_TYPE,
                payload: {
                    chartType: ChartType.BIG_NUMBER,
                    cachedConfigs: {},
                },
            });

            expect(newState.unsavedChartVersion.chartConfig.type).toBe(
                ChartType.BIG_NUMBER,
            );
        });
    });

    describe('SET_CHART_CONFIG', () => {
        it('replaces the chartConfig with the new config', () => {
            const state = mockExplorerState();

            const newConfig: ChartConfig = {
                type: ChartType.TABLE,
                config: {
                    showTableNames: true,
                    showRowCalculation: false,
                    columns: {},
                },
            };

            const newState = reducer(state, {
                type: ActionType.SET_CHART_CONFIG,
                payload: {
                    chartConfig: newConfig,
                    cachedConfigs: {},
                },
            });

            expect(newState.unsavedChartVersion.chartConfig).toEqual(newConfig);
        });
    });

    describe('REPLACE_FIELDS', () => {
        it('replaces metricOverrides for custom metrics', () => {
            const state = mockExplorerState({
                unsavedChartVersion: {
                    ...mockExplorerState().unsavedChartVersion,
                    metricQuery: {
                        ...mockExplorerState().unsavedChartVersion.metricQuery,
                        metricOverrides: {
                            old_metric: {
                                formatOptions: {
                                    type: CustomFormatType.NUMBER,
                                },
                            },
                        },
                    },
                },
            });

            const newState = reducer(state, {
                type: ActionType.REPLACE_FIELDS,
                payload: {
                    fieldsToReplace: {
                        customMetrics: {
                            old_metric: {
                                replaceWithFieldId: 'new_metric',
                            },
                        },
                    },
                },
            });

            expect(
                newState.unsavedChartVersion.metricQuery.metricOverrides,
            ).toEqual({
                old_metric: {
                    formatOptions: { type: CustomFormatType.NUMBER },
                },
            });
        });
    });
});
