import { FieldId, MetricQuery, SortField, TableCalculation } from 'common';
import React, {
    createContext,
    FC,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useReducer,
} from 'react';

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
    RESET_SORTING,
}

type Action =
    | { type: ActionType.RESET }
    | { type: ActionType.SET_STATE; payload: Required<ExplorerReduceState> }
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
          type: ActionType.RESET_SORTING;
      };

interface ExplorerReduceState {
    chartName: string | undefined;
    tableName: string | undefined;
    selectedTableCalculations: FieldId[];
    dimensions: FieldId[];
    metrics: FieldId[];
    filters: MetricQuery['filters'];
    sorts: SortField[];
    sorting: boolean;
    columnOrder: string[];
    limit: number;
    tableCalculations: TableCalculation[];
}

interface ExplorerState extends ExplorerReduceState {
    activeFields: Set<FieldId>;
    isValidQuery: boolean;
}

interface ExplorerContext {
    state: ExplorerState;
    pristineState: ExplorerState;
    actions: {
        reset: () => void;
        syncState: (defaultSortField: SortField | undefined) => void;
        setState: (state: Required<ExplorerReduceState>) => void;
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
    };
}

const toggleArrayValue = (initialArray: string[], value: string): string[] => {
    const array = [...initialArray];
    const index = array.indexOf(value);
    if (index === -1) {
        array.push(value);
    } else {
        array.splice(index, 1);
    }
    return array;
};

const Context = createContext<ExplorerContext>(undefined as any);

const defaultState: ExplorerReduceState = {
    chartName: '',
    tableName: undefined,
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    sorting: false,
    columnOrder: [],
    limit: 500,
    tableCalculations: [],
    selectedTableCalculations: [],
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

function pristineReducer(
    state: ExplorerReduceState,
    action: Action,
): ExplorerReduceState {
    switch (action.type) {
        case ActionType.RESET: {
            return defaultState;
        }
        case ActionType.SET_STATE: {
            return {
                ...action.payload,
                columnOrder: calcColumnOrder(action.payload.columnOrder, [
                    ...action.payload.dimensions,
                    ...action.payload.metrics,
                    ...action.payload.selectedTableCalculations,
                ]),
            };
        }
        default: {
            throw new Error(`Unhandled action type`);
        }
    }
}

function reducer(
    state: ExplorerReduceState,
    action: Action,
): ExplorerReduceState {
    switch (action.type) {
        case ActionType.RESET: {
            return defaultState;
        }
        case ActionType.SET_STATE: {
            return {
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
                sorting: true,
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
        case ActionType.RESET_SORTING: {
            return {
                ...state,
                sorting: false,
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
        default: {
            throw new Error(`Unhandled action type`);
        }
    }
}

export const ExplorerProvider: FC = ({ children }) => {
    const [reducerState, dispatch] = useReducer(reducer, defaultState);
    const [pristineReducerState, pristineDispatch] = useReducer(
        pristineReducer,
        defaultState,
    );

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
    const [pristineActiveFields, pristineIsValidQuery] = useMemo<
        [Set<FieldId>, boolean]
    >(() => {
        const fields = new Set([
            ...pristineReducerState.dimensions,
            ...pristineReducerState.metrics,
            ...pristineReducerState.selectedTableCalculations,
        ]);
        return [fields, fields.size > 0];
    }, [pristineReducerState]);
    const reset = useCallback(() => {
        dispatch({
            type: ActionType.RESET,
        });
        pristineDispatch({
            type: ActionType.RESET,
        });
    }, []);
    const syncState = useCallback(
        (defaultSortField: SortField | undefined) => {
            if (defaultSortField) {
                dispatch({
                    type: ActionType.SET_SORT_FIELDS,
                    payload: [defaultSortField],
                });
            }
            pristineDispatch({
                type: ActionType.SET_STATE,
                payload: {
                    ...reducerState,
                    sorts: defaultSortField
                        ? [defaultSortField]
                        : reducerState.sorts,
                },
            });
        },
        [reducerState],
    );

    // trigger back end call to sort data
    useEffect(() => {
        if (reducerState.sorting) {
            dispatch({ type: ActionType.RESET_SORTING });
            syncState(undefined);
        }
    }, [reducerState.sorts, reducerState.sorting, syncState]);

    const setState = useCallback((state: ExplorerReduceState) => {
        pristineDispatch({
            type: ActionType.SET_STATE,
            payload: state,
        });
        dispatch({
            type: ActionType.SET_STATE,
            payload: state,
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
        });
    }, []);

    const setSortFields = useCallback((sortFields: SortField[]) => {
        dispatch({
            type: ActionType.SET_SORT_FIELDS,
            payload: sortFields,
        });
    }, []);

    const setRowLimit = useCallback((limit: number) => {
        dispatch({
            type: ActionType.SET_ROW_LIMIT,
            payload: limit,
        });
    }, []);

    const setFilters = useCallback(
        (filters: MetricQuery['filters'], syncPristineState: boolean) => {
            dispatch({
                type: ActionType.SET_FILTERS,
                payload: filters,
            });
            if (syncPristineState) {
                pristineDispatch({
                    type: ActionType.SET_STATE,
                    payload: {
                        ...reducerState,
                        filters,
                    },
                });
            }
        },
        [reducerState],
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

    const value: ExplorerContext = {
        state: useMemo(
            () => ({ ...reducerState, activeFields, isValidQuery }),
            [reducerState, activeFields, isValidQuery],
        ),
        pristineState: useMemo(
            () => ({
                ...pristineReducerState,
                activeFields: pristineActiveFields,
                isValidQuery: pristineIsValidQuery,
            }),
            [pristineActiveFields, pristineIsValidQuery, pristineReducerState],
        ),
        actions: useMemo(
            () => ({
                reset,
                syncState,
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
                syncState,
                addTableCalculation,
                deleteTableCalculation,
                updateTableCalculation,
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
