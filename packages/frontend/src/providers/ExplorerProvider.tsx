import {
    ChartConfig,
    ChartType,
    CreateSavedChartVersion,
    FieldId,
    isBigNumberConfig,
    isCartesianChartConfig,
    Metric,
    MetricQuery,
    SortField,
    TableCalculation,
    toggleArrayValue,
} from 'common';
import React, {
    createContext,
    FC,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useReducer,
} from 'react';
import { useQueryResults } from '../hooks/useQueryResults';

export enum ActionType {
    RESET,
    SET_TABLE_NAME,
    TOGGLE_DIMENSION,
    TOGGLE_METRIC,
    TOGGLE_SORT_FIELD,
    SET_SORT_FIELDS,
    SET_ROW_LIMIT,
    SET_FILTERS,
    SET_COLUMN_ORDER,
    ADD_TABLE_CALCULATION,
    UPDATE_TABLE_CALCULATION,
    DELETE_TABLE_CALCULATION,
    SET_FETCH_RESULTS_FALSE,
    SET_ADDITIONAL_METRICS,
    SET_PIVOT_FIELDS,
    SET_CHART_TYPE,
    SET_CHART_CONFIG,
}

type Action =
    | { type: ActionType.RESET }
    | { type: ActionType.SET_FETCH_RESULTS_FALSE }
    | { type: ActionType.SET_TABLE_NAME; payload: string }
    | {
          type:
              | ActionType.TOGGLE_DIMENSION
              | ActionType.TOGGLE_METRIC
              | ActionType.TOGGLE_SORT_FIELD;
          payload: FieldId;
      }
    | {
          type: ActionType.SET_SORT_FIELDS;
          payload: SortField[];
      }
    | {
          type: ActionType.SET_ROW_LIMIT;
          payload: number;
      }
    | {
          type: ActionType.SET_FILTERS;
          payload: MetricQuery['filters'];
      }
    | {
          type: ActionType.ADD_TABLE_CALCULATION;
          payload: TableCalculation;
      }
    | {
          type: ActionType.UPDATE_TABLE_CALCULATION;
          payload: { oldName: string; tableCalculation: TableCalculation };
      }
    | {
          type: ActionType.DELETE_TABLE_CALCULATION;
          payload: string;
      }
    | {
          type: ActionType.SET_COLUMN_ORDER;
          payload: string[];
      }
    | {
          type: ActionType.SET_ADDITIONAL_METRICS;
          payload: Metric[];
      }
    | {
          type: ActionType.SET_PIVOT_FIELDS;
          payload: FieldId[];
      }
    | {
          type: ActionType.SET_CHART_TYPE;
          payload: ChartType;
      }
    | {
          type: ActionType.SET_CHART_CONFIG;
          payload: ChartConfig['config'] | undefined;
      };

export interface ExplorerReduceState {
    shouldFetchResults: boolean;
    chartName: string | undefined;
    savedChartVersion: CreateSavedChartVersion;
}

export interface ExplorerState extends ExplorerReduceState {
    activeFields: Set<FieldId>;
    isValidQuery: boolean;
}

interface ExplorerContext {
    state: ExplorerState;
    queryResults: ReturnType<typeof useQueryResults>;
    actions: {
        reset: () => void;
        setTableName: (tableName: string) => void;
        toggleActiveField: (fieldId: FieldId, isDimension: boolean) => void;
        toggleSortField: (fieldId: FieldId) => void;
        setSortFields: (sortFields: SortField[]) => void;
        setRowLimit: (limit: number) => void;
        setFilters: (
            filters: MetricQuery['filters'],
            syncPristineState: boolean,
        ) => void;
        setColumnOrder: (order: string[]) => void;
        addTableCalculation: (tableCalculation: TableCalculation) => void;
        updateTableCalculation: (
            oldName: string,
            tableCalculation: TableCalculation,
        ) => void;
        deleteTableCalculation: (name: string) => void;
        setPivotFields: (fields: FieldId[] | undefined) => void;
        setChartType: (chartType: ChartType) => void;
        setChartConfig: (
            chartConfig: ChartConfig['config'] | undefined,
        ) => void;
    };
}

const Context = createContext<ExplorerContext | undefined>(undefined);

const defaultState: ExplorerReduceState = {
    shouldFetchResults: false,
    chartName: '',
    savedChartVersion: {
        tableName: '',
        metricQuery: {
            dimensions: [],
            metrics: [],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
        },
        pivotConfig: {
            columns: [],
        },
        tableConfig: {
            columnOrder: [],
        },
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: { layout: {}, eChartsConfig: {} },
        },
    },
};

const getValidChartConfig = (
    type: ChartType,
    config: ChartConfig['config'],
): ChartConfig => {
    switch (type) {
        case ChartType.CARTESIAN: {
            return {
                type,
                config: isCartesianChartConfig(config)
                    ? config
                    : { layout: {}, eChartsConfig: {} },
            };
        }
        case ChartType.BIG_NUMBER: {
            return {
                type,
                config: isBigNumberConfig(config) ? config : {},
            };
        }
        case ChartType.TABLE: {
            return {
                type,
                config: undefined,
            };
        }
    }
};

const calcColumnOrder = (
    columnOrder: FieldId[],
    fieldIds: FieldId[],
): FieldId[] => {
    const cleanColumnOrder = columnOrder.filter((column) =>
        fieldIds.includes(column),
    );
    const missingColumns = fieldIds.filter(
        (fieldId) => !cleanColumnOrder.includes(fieldId),
    );
    return [...cleanColumnOrder, ...missingColumns];
};

function reducer(
    state: ExplorerReduceState,
    action: Action & { options?: { shouldFetchResults: boolean } },
): ExplorerReduceState {
    state = {
        ...state,
        shouldFetchResults:
            action.options?.shouldFetchResults || state.shouldFetchResults,
    };
    switch (action.type) {
        case ActionType.RESET: {
            return defaultState;
        }
        case ActionType.SET_TABLE_NAME: {
            return {
                ...state,
                savedChartVersion: {
                    ...state.savedChartVersion,
                    tableName: action.payload,
                },
            };
        }
        case ActionType.SET_FETCH_RESULTS_FALSE: {
            return { ...state, shouldFetchResults: false };
        }
        case ActionType.TOGGLE_DIMENSION: {
            const dimensions = toggleArrayValue(
                state.savedChartVersion.metricQuery.dimensions,
                action.payload,
            );
            return {
                ...state,
                savedChartVersion: {
                    ...state.savedChartVersion,
                    metricQuery: {
                        ...state.savedChartVersion.metricQuery,
                        dimensions,
                        sorts: state.savedChartVersion.metricQuery.sorts.filter(
                            (s) => s.fieldId !== action.payload,
                        ),
                    },
                    tableConfig: {
                        ...state.savedChartVersion.tableConfig,
                        columnOrder: calcColumnOrder(
                            state.savedChartVersion.tableConfig.columnOrder,
                            [
                                ...dimensions,
                                ...state.savedChartVersion.metricQuery.metrics,
                                ...state.savedChartVersion.metricQuery.tableCalculations.map(
                                    ({ name }) => name,
                                ),
                            ],
                        ),
                    },
                },
            };
        }
        case ActionType.TOGGLE_METRIC: {
            const metrics = toggleArrayValue(
                state.savedChartVersion.metricQuery.metrics,
                action.payload,
            );
            return {
                ...state,
                savedChartVersion: {
                    ...state.savedChartVersion,
                    metricQuery: {
                        ...state.savedChartVersion.metricQuery,
                        metrics,
                        sorts: state.savedChartVersion.metricQuery.sorts.filter(
                            (s) => s.fieldId !== action.payload,
                        ),
                    },
                    tableConfig: {
                        ...state.savedChartVersion.tableConfig,
                        columnOrder: calcColumnOrder(
                            state.savedChartVersion.tableConfig.columnOrder,
                            [
                                ...state.savedChartVersion.metricQuery
                                    .dimensions,
                                ...metrics,
                                ...state.savedChartVersion.metricQuery.tableCalculations.map(
                                    ({ name }) => name,
                                ),
                            ],
                        ),
                    },
                },
            };
        }
        case ActionType.TOGGLE_SORT_FIELD: {
            const sortFieldId = action.payload;
            const activeFields = new Set([
                ...state.savedChartVersion.metricQuery.dimensions,
                ...state.savedChartVersion.metricQuery.metrics,
            ]);
            if (!activeFields.has(sortFieldId)) {
                return state;
            }
            const sortField = state.savedChartVersion.metricQuery.sorts.find(
                (sf) => sf.fieldId === sortFieldId,
            );
            return {
                ...state,
                savedChartVersion: {
                    ...state.savedChartVersion,
                    metricQuery: {
                        ...state.savedChartVersion.metricQuery,
                        sorts: !sortField
                            ? [
                                  ...state.savedChartVersion.metricQuery.sorts,
                                  {
                                      fieldId: sortFieldId,
                                      descending: false,
                                  },
                              ]
                            : state.savedChartVersion.metricQuery.sorts.reduce<
                                  SortField[]
                              >((acc, sf) => {
                                  if (sf.fieldId !== sortFieldId) {
                                      return [...acc, sf];
                                  }

                                  if (sf.descending) {
                                      return acc;
                                  }
                                  return [
                                      ...acc,
                                      {
                                          ...sf,
                                          descending: true,
                                      },
                                  ];
                              }, []),
                    },
                },
            };
        }
        case ActionType.SET_SORT_FIELDS: {
            const activeFields = new Set([
                ...state.savedChartVersion.metricQuery.dimensions,
                ...state.savedChartVersion.metricQuery.metrics,
            ]);
            return {
                ...state,
                savedChartVersion: {
                    ...state.savedChartVersion,
                    metricQuery: {
                        ...state.savedChartVersion.metricQuery,
                        sorts: action.payload.filter((sf) =>
                            activeFields.has(sf.fieldId),
                        ),
                    },
                },
            };
        }
        case ActionType.SET_ROW_LIMIT: {
            return {
                ...state,
                savedChartVersion: {
                    ...state.savedChartVersion,
                    metricQuery: {
                        ...state.savedChartVersion.metricQuery,
                        limit: action.payload,
                    },
                },
            };
        }
        case ActionType.SET_FILTERS: {
            return {
                ...state,
                savedChartVersion: {
                    ...state.savedChartVersion,
                    metricQuery: {
                        ...state.savedChartVersion.metricQuery,
                        filters: action.payload,
                    },
                },
            };
        }
        case ActionType.SET_ADDITIONAL_METRICS: {
            return {
                ...state,
                savedChartVersion: {
                    ...state.savedChartVersion,
                    metricQuery: {
                        ...state.savedChartVersion.metricQuery,
                        additionalMetrics: action.payload,
                    },
                },
            };
        }
        case ActionType.SET_COLUMN_ORDER: {
            return {
                ...state,
                savedChartVersion: {
                    ...state.savedChartVersion,
                    tableConfig: {
                        ...state.savedChartVersion.tableConfig,
                        columnOrder: calcColumnOrder(action.payload, [
                            ...state.savedChartVersion.metricQuery.dimensions,
                            ...state.savedChartVersion.metricQuery.metrics,
                            ...state.savedChartVersion.metricQuery.tableCalculations.map(
                                ({ name }) => name,
                            ),
                        ]),
                    },
                },
            };
        }
        case ActionType.ADD_TABLE_CALCULATION: {
            const newTableCalculations = [
                ...state.savedChartVersion.metricQuery.tableCalculations,
                action.payload,
            ];
            return {
                ...state,
                savedChartVersion: {
                    ...state.savedChartVersion,
                    metricQuery: {
                        ...state.savedChartVersion.metricQuery,
                        tableCalculations: newTableCalculations,
                    },
                    tableConfig: {
                        ...state.savedChartVersion.tableConfig,
                        columnOrder: calcColumnOrder(
                            state.savedChartVersion.tableConfig.columnOrder,
                            [
                                ...state.savedChartVersion.metricQuery
                                    .dimensions,
                                ...state.savedChartVersion.metricQuery.metrics,
                                ...newTableCalculations.map(({ name }) => name),
                            ],
                        ),
                    },
                },
            };
        }
        case ActionType.UPDATE_TABLE_CALCULATION: {
            return {
                ...state,
                savedChartVersion: {
                    ...state.savedChartVersion,
                    metricQuery: {
                        ...state.savedChartVersion.metricQuery,
                        tableCalculations:
                            state.savedChartVersion.metricQuery.tableCalculations.map(
                                (tableCalculation) =>
                                    tableCalculation.name ===
                                    action.payload.oldName
                                        ? action.payload.tableCalculation
                                        : tableCalculation,
                            ),
                    },
                    tableConfig: {
                        ...state.savedChartVersion.tableConfig,
                        columnOrder:
                            state.savedChartVersion.tableConfig.columnOrder.map(
                                (column) =>
                                    column === action.payload.oldName
                                        ? action.payload.tableCalculation.name
                                        : column,
                            ),
                    },
                },
            };
        }
        case ActionType.DELETE_TABLE_CALCULATION: {
            const newTableCalculations =
                state.savedChartVersion.metricQuery.tableCalculations.filter(
                    (tableCalculation) =>
                        tableCalculation.name !== action.payload,
                );
            return {
                ...state,
                savedChartVersion: {
                    ...state.savedChartVersion,
                    metricQuery: {
                        ...state.savedChartVersion.metricQuery,
                        tableCalculations: newTableCalculations,
                    },
                    tableConfig: {
                        ...state.savedChartVersion.tableConfig,
                        columnOrder: calcColumnOrder(
                            state.savedChartVersion.tableConfig.columnOrder,
                            [
                                ...state.savedChartVersion.metricQuery
                                    .dimensions,
                                ...state.savedChartVersion.metricQuery.metrics,
                                ...newTableCalculations.map(({ name }) => name),
                            ],
                        ),
                    },
                },
            };
        }
        case ActionType.SET_PIVOT_FIELDS: {
            return {
                ...state,
                savedChartVersion: {
                    ...state.savedChartVersion,
                    pivotConfig: {
                        columns: action.payload,
                    },
                },
            };
        }
        case ActionType.SET_CHART_TYPE: {
            return {
                ...state,
                savedChartVersion: {
                    ...state.savedChartVersion,
                    chartConfig: getValidChartConfig(
                        action.payload,
                        state.savedChartVersion.chartConfig.config,
                    ),
                },
            };
        }
        case ActionType.SET_CHART_CONFIG: {
            return {
                ...state,
                savedChartVersion: {
                    ...state.savedChartVersion,
                    chartConfig: getValidChartConfig(
                        state.savedChartVersion.chartConfig.type,
                        action.payload,
                    ),
                },
            };
        }
        default: {
            throw new Error(`Unhandled action type`);
        }
    }
}

export const ExplorerProvider: FC<{
    initialState?: ExplorerReduceState;
}> = ({ initialState, children }) => {
    const [reducerState, dispatch] = useReducer(
        reducer,
        initialState || defaultState,
    );

    const [activeFields, isValidQuery] = useMemo<
        [Set<FieldId>, boolean]
    >(() => {
        const fields = new Set([
            ...reducerState.savedChartVersion.metricQuery.dimensions,
            ...reducerState.savedChartVersion.metricQuery.metrics,
            ...reducerState.savedChartVersion.metricQuery.tableCalculations.map(
                ({ name }) => name,
            ),
        ]);
        return [fields, fields.size > 0];
    }, [reducerState]);

    const reset = useCallback(() => {
        dispatch({
            type: ActionType.RESET,
        });
    }, []);

    const setTableName = useCallback((tableName: string) => {
        dispatch({
            type: ActionType.SET_TABLE_NAME,
            payload: tableName,
        });
    }, []);
    const toggleActiveField = useCallback(
        (fieldId: FieldId, isDimension: boolean) => {
            dispatch({
                type: isDimension
                    ? ActionType.TOGGLE_DIMENSION
                    : ActionType.TOGGLE_METRIC,
                payload: fieldId,
            });
        },
        [],
    );
    const toggleSortField = useCallback((fieldId: FieldId) => {
        dispatch({
            type: ActionType.TOGGLE_SORT_FIELD,
            payload: fieldId,
            options: {
                shouldFetchResults: true,
            },
        });
    }, []);

    const setSortFields = useCallback((sortFields: SortField[]) => {
        dispatch({
            type: ActionType.SET_SORT_FIELDS,
            payload: sortFields,
            options: {
                shouldFetchResults: true,
            },
        });
    }, []);

    const setRowLimit = useCallback((limit: number) => {
        dispatch({
            type: ActionType.SET_ROW_LIMIT,
            payload: limit,
            options: {
                shouldFetchResults: true,
            },
        });
    }, []);

    const setFilters = useCallback(
        (filters: MetricQuery['filters'], shouldFetchResults: boolean) => {
            dispatch({
                type: ActionType.SET_FILTERS,
                payload: filters,
                options: {
                    shouldFetchResults,
                },
            });
        },
        [],
    );

    const setPivotFields = useCallback((fields: FieldId[] = []) => {
        dispatch({
            type: ActionType.SET_PIVOT_FIELDS,
            payload: fields,
        });
    }, []);

    const setChartType = useCallback((chartType: ChartType) => {
        dispatch({
            type: ActionType.SET_CHART_TYPE,
            payload: chartType,
        });
    }, []);

    const setChartConfig = useCallback(
        (chartConfig: ChartConfig['config'] | undefined) => {
            dispatch({
                type: ActionType.SET_CHART_CONFIG,
                payload: chartConfig,
            });
        },
        [],
    );

    const setColumnOrder = useCallback((order: string[]) => {
        dispatch({
            type: ActionType.SET_COLUMN_ORDER,
            payload: order,
        });
    }, []);

    const addTableCalculation = useCallback(
        (tableCalculation: TableCalculation) => {
            if (
                reducerState.savedChartVersion.metricQuery.tableCalculations.findIndex(
                    ({ name }) => name === tableCalculation.name,
                ) > -1
            ) {
                throw new Error(
                    `Table calculation ID "${tableCalculation.name}" already exists.`,
                );
            }
            dispatch({
                type: ActionType.ADD_TABLE_CALCULATION,
                payload: tableCalculation,
            });
        },
        [reducerState],
    );
    const updateTableCalculation = useCallback(
        (oldName: string, tableCalculation: TableCalculation) => {
            if (
                oldName !== tableCalculation.name &&
                reducerState.savedChartVersion.metricQuery.tableCalculations.findIndex(
                    ({ name }) => name === tableCalculation.name,
                ) > -1
            ) {
                throw new Error(
                    `Id: "${tableCalculation.name}" already exists.`,
                );
            }
            dispatch({
                type: ActionType.UPDATE_TABLE_CALCULATION,
                payload: { oldName, tableCalculation },
            });
        },
        [reducerState],
    );
    const deleteTableCalculation = useCallback((name: string) => {
        dispatch({
            type: ActionType.DELETE_TABLE_CALCULATION,
            payload: name,
        });
    }, []);

    const state = useMemo(
        () => ({ ...reducerState, activeFields, isValidQuery }),
        [reducerState, activeFields, isValidQuery],
    );
    const queryResults = useQueryResults(state);

    // Fetch query results after state update
    const { mutate } = queryResults;
    useEffect(() => {
        if (state.shouldFetchResults) {
            mutate();
            dispatch({
                type: ActionType.SET_FETCH_RESULTS_FALSE,
            });
        }
    }, [mutate, state]);

    const value: ExplorerContext = {
        state,
        queryResults,
        actions: useMemo(
            () => ({
                reset,
                setTableName,
                toggleActiveField,
                toggleSortField,
                setSortFields,
                setFilters,
                setRowLimit,
                setColumnOrder,
                addTableCalculation,
                deleteTableCalculation,
                updateTableCalculation,
                setPivotFields,
                setChartType,
                setChartConfig,
            }),
            [
                reset,
                setTableName,
                toggleActiveField,
                toggleSortField,
                setSortFields,
                setFilters,
                setRowLimit,
                setColumnOrder,
                addTableCalculation,
                deleteTableCalculation,
                updateTableCalculation,
                setPivotFields,
                setChartType,
                setChartConfig,
            ],
        ),
    };
    return <Context.Provider value={value}>{children}</Context.Provider>;
};

export function useExplorer(): ExplorerContext {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error('useExplorer must be used within a ExplorerProvider');
    }
    return context;
}
