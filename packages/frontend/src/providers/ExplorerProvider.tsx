import {
    AdditionalMetric,
    ChartConfig,
    ChartType,
    FieldId,
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
    SET_STATE,
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
    RESET_SHOULD_FETCH_RESULTS,
    SET_ADDITIONAL_METRICS,
    SET_PIVOT_FIELDS,
    SET_CHART_TYPE,
    SET_CHART_CONFIG,
}

type Action =
    | { type: ActionType.RESET }
    | { type: ActionType.RESET_SHOULD_FETCH_RESULTS }
    | {
          type: ActionType.SET_STATE;
          payload: Omit<
              Required<ExplorerReduceState>,
              'chartType' | 'chartConfig' | 'pivotFields'
          >;
      }
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

interface ExplorerReduceState {
    shouldFetchResults: boolean;
    chartName: string | undefined;
    tableName: string | undefined;
    selectedTableCalculations: FieldId[];
    pivotFields: FieldId[];
    dimensions: FieldId[];
    metrics: FieldId[];
    filters: MetricQuery['filters'];
    sorts: SortField[];
    columnOrder: string[];
    limit: number;
    tableCalculations: TableCalculation[];
    additionalMetrics: AdditionalMetric[] | undefined;
    chartType: ChartType;
    chartConfig: ChartConfig['config'] | undefined;
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
        setState: (
            state: Omit<
                Required<ExplorerReduceState>,
                'chartType' | 'chartConfig' | 'pivotFields'
            >,
        ) => void;
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

const Context = createContext<ExplorerContext>(undefined as any);

const defaultState: ExplorerReduceState = {
    shouldFetchResults: false,
    chartName: '',
    tableName: undefined,
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    columnOrder: [],
    limit: 500,
    tableCalculations: [],
    selectedTableCalculations: [],
    additionalMetrics: [],
    pivotFields: [],
    chartType: ChartType.CARTESIAN,
    chartConfig: undefined,
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
        case ActionType.SET_STATE: {
            return {
                ...state,
                ...action.payload,
                columnOrder: calcColumnOrder(action.payload.columnOrder, [
                    ...action.payload.dimensions,
                    ...action.payload.metrics,
                    ...action.payload.selectedTableCalculations,
                ]),
            };
        }
        case ActionType.SET_TABLE_NAME: {
            return { ...state, tableName: action.payload };
        }
        case ActionType.RESET_SHOULD_FETCH_RESULTS: {
            return { ...state, shouldFetchResults: false };
        }
        case ActionType.TOGGLE_DIMENSION: {
            const dimensions = toggleArrayValue(
                state.dimensions,
                action.payload,
            );
            return {
                ...state,
                dimensions,
                sorts: state.sorts.filter((s) => s.fieldId !== action.payload),
                columnOrder: calcColumnOrder(state.columnOrder, [
                    ...dimensions,
                    ...state.metrics,
                    ...state.selectedTableCalculations,
                ]),
            };
        }
        case ActionType.TOGGLE_METRIC: {
            const metrics = toggleArrayValue(state.metrics, action.payload);
            return {
                ...state,
                metrics,
                sorts: state.sorts.filter((s) => s.fieldId !== action.payload),
                columnOrder: calcColumnOrder(state.columnOrder, [
                    ...state.dimensions,
                    ...metrics,
                    ...state.selectedTableCalculations,
                ]),
            };
        }
        case ActionType.TOGGLE_SORT_FIELD: {
            const sortFieldId = action.payload;
            const activeFields = new Set([
                ...state.dimensions,
                ...state.metrics,
            ]);
            if (!activeFields.has(sortFieldId)) {
                return state;
            }
            const sortField = state.sorts.find(
                (sf) => sf.fieldId === sortFieldId,
            );
            return {
                ...state,
                sorts: !sortField
                    ? [
                          ...state.sorts,
                          {
                              fieldId: sortFieldId,
                              descending: false,
                          },
                      ]
                    : state.sorts.reduce<SortField[]>((acc, sf) => {
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
            } as ExplorerReduceState;
        }
        case ActionType.SET_SORT_FIELDS: {
            const activeFields = new Set([
                ...state.dimensions,
                ...state.metrics,
            ]);
            return {
                ...state,
                sorts: action.payload.filter((sf) =>
                    activeFields.has(sf.fieldId),
                ),
            };
        }
        case ActionType.SET_ROW_LIMIT: {
            return {
                ...state,
                limit: action.payload,
            };
        }
        case ActionType.SET_FILTERS: {
            return {
                ...state,
                filters: action.payload,
            };
        }
        case ActionType.SET_ADDITIONAL_METRICS: {
            return {
                ...state,
                additionalMetrics: action.payload,
            };
        }
        case ActionType.SET_COLUMN_ORDER: {
            return {
                ...state,
                columnOrder: calcColumnOrder(action.payload, [
                    ...state.dimensions,
                    ...state.metrics,
                    ...state.selectedTableCalculations,
                ]),
            };
        }
        case ActionType.ADD_TABLE_CALCULATION: {
            const selectedTableCalculations = toggleArrayValue(
                state.selectedTableCalculations,
                action.payload.name,
            );
            return {
                ...state,
                selectedTableCalculations,
                tableCalculations: [...state.tableCalculations, action.payload],
                columnOrder: calcColumnOrder(state.columnOrder, [
                    ...state.dimensions,
                    ...state.metrics,
                    ...selectedTableCalculations,
                ]),
            };
        }
        case ActionType.UPDATE_TABLE_CALCULATION: {
            return {
                ...state,
                tableCalculations: state.tableCalculations.map(
                    (tableCalculation) =>
                        tableCalculation.name === action.payload.oldName
                            ? action.payload.tableCalculation
                            : tableCalculation,
                ),
                selectedTableCalculations: state.selectedTableCalculations.map(
                    (name) =>
                        name === action.payload.oldName
                            ? action.payload.tableCalculation.name
                            : name,
                ),
                columnOrder: state.columnOrder.map((column) =>
                    column === action.payload.oldName
                        ? action.payload.tableCalculation.name
                        : column,
                ),
            };
        }
        case ActionType.DELETE_TABLE_CALCULATION: {
            const selectedTableCalculations =
                state.selectedTableCalculations.filter(
                    (name) => name !== action.payload,
                );
            return {
                ...state,
                selectedTableCalculations,
                tableCalculations: state.tableCalculations.filter(
                    (tableCalculation) =>
                        tableCalculation.name !== action.payload,
                ),
                columnOrder: calcColumnOrder(state.columnOrder, [
                    ...state.dimensions,
                    ...state.metrics,
                    ...selectedTableCalculations,
                ]),
            };
        }
        case ActionType.SET_PIVOT_FIELDS: {
            return {
                ...state,
                pivotFields: action.payload,
            };
        }
        case ActionType.SET_CHART_TYPE: {
            return {
                ...state,
                chartType: action.payload,
            };
        }
        case ActionType.SET_CHART_CONFIG: {
            return {
                ...state,
                chartConfig: action.payload,
            };
        }
        default: {
            throw new Error(`Unhandled action type`);
        }
    }
}

export const ExplorerProvider: FC = ({ children }) => {
    const [reducerState, dispatch] = useReducer(reducer, defaultState);

    const [activeFields, isValidQuery] = useMemo<
        [Set<FieldId>, boolean]
    >(() => {
        const fields = new Set([
            ...reducerState.dimensions,
            ...reducerState.metrics,
            ...reducerState.selectedTableCalculations,
        ]);
        return [fields, fields.size > 0];
    }, [reducerState]);

    const reset = useCallback(() => {
        dispatch({
            type: ActionType.RESET,
        });
    }, []);

    const setState = useCallback(
        (
            state: Omit<
                Required<ExplorerReduceState>,
                'chartType' | 'chartConfig' | 'pivotFields'
            >,
        ) => {
            dispatch({
                type: ActionType.SET_STATE,
                payload: state,
                options: {
                    shouldFetchResults: true,
                },
            });
        },
        [],
    );

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
                reducerState.tableCalculations.findIndex(
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
                reducerState.tableCalculations.findIndex(
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
                type: ActionType.RESET_SHOULD_FETCH_RESULTS,
            });
        }
    }, [mutate, state]);

    const value: ExplorerContext = {
        state,
        queryResults,
        actions: useMemo(
            () => ({
                reset,
                setState,
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
                setState,
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
