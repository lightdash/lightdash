import {
    ChartType,
    Compact,
    CustomFormatType,
    FilterOperator,
    getItemId,
    isSqlTableCalculation,
    type ChartConfig,
    type Filters,
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

    describe.skip('SET_FILTERS', () => {
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
        });

        it('sets filters', () => {
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
            });

            expect(newState.unsavedChartVersion.metricQuery.filters).toEqual(
                filters,
            );
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
                            {
                                fieldId: previousMetricName,
                                descending: false,
                            },
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
            const tableCalc =
                newState.unsavedChartVersion.metricQuery.tableCalculations[0];
            expect(
                isSqlTableCalculation(tableCalc) ? tableCalc.sql : '',
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
                        sorts: [
                            {
                                fieldId: metricId,
                                descending: false,
                            },
                        ],
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
                    itemDetail: { isOpen: false },
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
                    itemDetail: { isOpen: false },
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
                    itemDetail: { isOpen: false },
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
