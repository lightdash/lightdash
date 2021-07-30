import React, {
    FC,
    useContext,
    createContext,
    useReducer,
    useMemo,
    useCallback,
} from 'react';
import { FieldId, FilterGroup, SortField } from 'common';

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
          payload: FilterGroup[];
      };

interface ExplorerReduceState {
    tableName: string | undefined;
    dimensions: FieldId[];
    metrics: FieldId[];
    filters: FilterGroup[];
    sorts: SortField[];
    limit: number;
}

interface ExplorerState extends ExplorerReduceState {
    activeFields: Set<FieldId>;
    isValidQuery: boolean;
}

interface ExplorerContext {
    state: ExplorerState;
    actions: {
        reset: () => void;
        setState: (state: Required<ExplorerReduceState>) => void;
        setTableName: (tableName: string) => void;
        toggleActiveField: (fieldId: FieldId, isDimension: boolean) => void;
        toggleSortField: (fieldId: FieldId) => void;
        setSortFields: (sortFields: SortField[]) => void;
        setRowLimit: (limit: number) => void;
        setFilters: (filters: FilterGroup[]) => void;
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
    tableName: undefined,
    dimensions: [],
    metrics: [],
    filters: [],
    sorts: [],
    limit: 500,
};

function reducer(
    state: ExplorerReduceState,
    action: Action,
): ExplorerReduceState {
    switch (action.type) {
        case ActionType.RESET: {
            return defaultState;
        }
        case ActionType.SET_STATE: {
            return action.payload;
        }
        case ActionType.SET_TABLE_NAME: {
            return { ...state, tableName: action.payload };
        }
        case ActionType.TOGGLE_DIMENSION: {
            return {
                ...state,
                dimensions: toggleArrayValue(state.dimensions, action.payload),
            };
        }
        case ActionType.TOGGLE_METRIC: {
            return {
                ...state,
                metrics: toggleArrayValue(state.metrics, action.payload),
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
        ]);
        return [fields, fields.size > 0];
    }, [reducerState]);

    const reset = useCallback(() => {
        dispatch({
            type: ActionType.RESET,
        });
    }, []);

    const setState = useCallback((state: ExplorerReduceState) => {
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

    const setFilters = useCallback((filters: FilterGroup[]) => {
        dispatch({
            type: ActionType.SET_FILTERS,
            payload: filters,
        });
    }, []);

    const value: ExplorerContext = {
        state: useMemo(
            () => ({ ...reducerState, activeFields, isValidQuery }),
            [reducerState, activeFields, isValidQuery],
        ),
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
            }),
            [
                reset,
                setFilters,
                setRowLimit,
                setSortFields,
                setState,
                setTableName,
                toggleActiveField,
                toggleSortField,
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
