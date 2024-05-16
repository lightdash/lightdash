import {
    assertUnreachable,
    ChartType,
    convertFieldRefToFieldId,
    deepEqual,
    fieldId as getFieldId,
    getCustomDimensionId,
    getFieldRef,
    getItemId,
    lightdashVariablePattern,
    removeEmptyProperties,
    removeFieldFromFilterGroup,
    toggleArrayValue,
    updateFieldIdInFilters,
    type AdditionalMetric,
    type BigNumberConfig,
    type CartesianChartConfig,
    type ChartConfig,
    type CreateSavedChartVersion,
    type CustomDimension,
    type CustomVisConfig,
    type Dimension,
    type FieldId,
    type MetricQuery,
    type MetricType,
    type PieChartConfig,
    type SavedChart,
    type SortField,
    type TableCalculation,
    type TableCalculationMetadata,
    type TableChartConfig,
    type TimeZone,
} from '@lightdash/common';
import produce from 'immer';
import cloneDeep from 'lodash/cloneDeep';
import {
    useCallback,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    type FC,
} from 'react';
import { useHistory } from 'react-router-dom';
import { createContext, useContextSelector } from 'use-context-selector';
import { EMPTY_CARTESIAN_CHART_CONFIG } from '../hooks/cartesianChartConfig/useCartesianChartConfig';
import useDefaultSortField from '../hooks/useDefaultSortField';
import {
    type useChartVersionResultsMutation,
    type useQueryResults,
} from '../hooks/useQueryResults';

export enum ExplorerSection {
    FILTERS = 'FILTERS',
    VISUALIZATION = 'VISUALIZATION',
    CUSTOMVISUALIZATION = 'CUSTOMVISUALIZATION',
    RESULTS = 'RESULTS',
    SQL = 'SQL',
}

interface SwapSortFieldsPayload {
    sourceIndex: number;
    destinationIndex: number;
}

export enum ActionType {
    RESET,
    SET_TABLE_NAME,
    REMOVE_FIELD,
    TOGGLE_DIMENSION,
    TOGGLE_METRIC,
    TOGGLE_SORT_FIELD,
    SET_SORT_FIELDS,
    ADD_SORT_FIELD,
    REMOVE_SORT_FIELD,
    MOVE_SORT_FIELDS,
    SET_ROW_LIMIT,
    SET_TIME_ZONE,
    SET_FILTERS,
    SET_COLUMN_ORDER,
    ADD_TABLE_CALCULATION,
    UPDATE_TABLE_CALCULATION,
    DELETE_TABLE_CALCULATION,
    SET_FETCH_RESULTS_FALSE,
    SET_PREVIOUSLY_FETCHED_STATE,
    ADD_ADDITIONAL_METRIC,
    EDIT_ADDITIONAL_METRIC,
    REMOVE_ADDITIONAL_METRIC,
    TOGGLE_ADDITIONAL_METRIC_MODAL,
    SET_PIVOT_FIELDS,
    SET_CHART_TYPE,
    SET_CHART_CONFIG,
    TOGGLE_EXPANDED_SECTION,
    ADD_CUSTOM_DIMENSION,
    EDIT_CUSTOM_DIMENSION,
    REMOVE_CUSTOM_DIMENSION,
    TOGGLE_CUSTOM_DIMENSION_MODAL,
}

type Action =
    | { type: ActionType.RESET; payload: ExplorerReduceState }
    | { type: ActionType.SET_FETCH_RESULTS_FALSE }
    | {
          type: ActionType.SET_PREVIOUSLY_FETCHED_STATE;
          payload: MetricQuery;
      }
    | { type: ActionType.SET_TABLE_NAME; payload: string }
    | { type: ActionType.TOGGLE_EXPANDED_SECTION; payload: ExplorerSection }
    | {
          type:
              | ActionType.REMOVE_FIELD
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
          type: ActionType.ADD_SORT_FIELD;
          payload: SortField;
      }
    | {
          type: ActionType.REMOVE_SORT_FIELD;
          payload: FieldId;
      }
    | {
          type: ActionType.MOVE_SORT_FIELDS;
          payload: SwapSortFieldsPayload;
      }
    | {
          type: ActionType.SET_ROW_LIMIT;
          payload: number;
      }
    | {
          type: ActionType.SET_TIME_ZONE;
          payload: TimeZone;
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
          type: ActionType.ADD_ADDITIONAL_METRIC;
          payload: AdditionalMetric;
      }
    | {
          type: ActionType.EDIT_ADDITIONAL_METRIC;
          payload: {
              additionalMetric: AdditionalMetric;
              previousAdditionalMetricName: string;
          };
      }
    | {
          type: ActionType.REMOVE_ADDITIONAL_METRIC;
          payload: FieldId;
      }
    | {
          type: ActionType.TOGGLE_ADDITIONAL_METRIC_MODAL;
          payload?: Omit<
              ExplorerReduceState['modals']['additionalMetric'],
              'isOpen'
          >;
      }
    | {
          type: ActionType.SET_PIVOT_FIELDS;
          payload: FieldId[];
      }
    | {
          type: ActionType.SET_CHART_TYPE;
          payload: {
              chartType: ChartType;
              cachedConfigs: Partial<ConfigCacheMap>;
          };
      }
    | {
          type: ActionType.SET_CHART_CONFIG;
          payload: {
              chartConfig: ChartConfig;
              cachedConfigs: Partial<ConfigCacheMap>;
          };
      }
    | {
          type: ActionType.ADD_CUSTOM_DIMENSION;
          payload: CustomDimension;
      }
    | {
          type: ActionType.EDIT_CUSTOM_DIMENSION;
          payload: {
              customDimension: CustomDimension;
              previousCustomDimensionName: string;
          };
      }
    | {
          type: ActionType.REMOVE_CUSTOM_DIMENSION;
          payload: FieldId;
      }
    | {
          type: ActionType.TOGGLE_CUSTOM_DIMENSION_MODAL;
          payload?: Omit<
              ExplorerReduceState['modals']['customDimension'],
              'isOpen'
          >;
      };

export interface ExplorerReduceState {
    shouldFetchResults: boolean;
    expandedSections: ExplorerSection[];
    metadata?: {
        // Temporary state that tracks changes to `table calculations` - keeps track of new name and previous name to ensure these get updated correctly when making changes to the layout & config of a chart
        tableCalculations?: TableCalculationMetadata[];
    };
    unsavedChartVersion: CreateSavedChartVersion;
    previouslyFetchedState?: MetricQuery;
    modals: {
        additionalMetric: {
            isOpen: boolean;
            isEditing?: boolean;
            item?: Dimension | AdditionalMetric;
            type?: MetricType;
        };
        customDimension: {
            isOpen: boolean;
            isEditing?: boolean;
            table?: string;
            item?: Dimension | CustomDimension;
        };
    };
}

export interface ExplorerState extends ExplorerReduceState {
    activeFields: Set<FieldId>;
    isValidQuery: boolean;
    hasUnsavedChanges: boolean;
    isEditMode: boolean;
    savedChart: SavedChart | undefined;
}

export interface ExplorerContext {
    state: ExplorerState;
    queryResults: ReturnType<
        typeof useQueryResults | typeof useChartVersionResultsMutation
    >;
    actions: {
        clearExplore: () => void;
        clearQuery: () => void;
        reset: () => void;
        setTableName: (tableName: string) => void;
        removeActiveField: (fieldId: FieldId) => void;
        toggleActiveField: (fieldId: FieldId, isDimension: boolean) => void;
        toggleSortField: (fieldId: FieldId) => void;
        setSortFields: (sortFields: SortField[]) => void;
        addSortField: (
            fieldId: FieldId,
            options?: { descending: boolean },
        ) => void;
        removeSortField: (fieldId: FieldId) => void;
        moveSortFields: (sourceIndex: number, destinationIndex: number) => void;
        setRowLimit: (limit: number) => void;
        setTimeZone: (timezone: TimeZone) => void;
        setFilters: (
            filters: MetricQuery['filters'],
            syncPristineState: boolean,
        ) => void;
        addAdditionalMetric: (metric: AdditionalMetric) => void;
        editAdditionalMetric: (
            metric: AdditionalMetric,
            previousMetricName: string,
        ) => void;
        removeAdditionalMetric: (key: FieldId) => void;
        toggleAdditionalMetricModal: (
            additionalMetricModalData?: Omit<
                ExplorerReduceState['modals']['additionalMetric'],
                'isOpen'
            >,
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
        setChartConfig: (chartConfig: ChartConfig) => void;
        fetchResults: () => void;
        toggleExpandedSection: (section: ExplorerSection) => void;
        addCustomDimension: (customDimension: CustomDimension) => void;
        editCustomDimension: (
            customDimension: CustomDimension,
            previousCustomDimensionName: string,
        ) => void;
        removeCustomDimension: (key: FieldId) => void;
        toggleCustomDimensionModal: (
            additionalMetricModalData?: Omit<
                ExplorerReduceState['modals']['customDimension'],
                'isOpen'
            >,
        ) => void;
    };
}

const Context = createContext<ExplorerContext | undefined>(undefined);

const defaultState: ExplorerReduceState = {
    shouldFetchResults: false,
    previouslyFetchedState: undefined,
    expandedSections: [ExplorerSection.RESULTS],
    unsavedChartVersion: {
        tableName: '',
        metricQuery: {
            exploreName: '',
            dimensions: [],
            metrics: [],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            timezone: undefined,
        },
        pivotConfig: undefined,
        tableConfig: {
            columnOrder: [],
        },
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: EMPTY_CARTESIAN_CHART_CONFIG,
        },
    },
    modals: {
        additionalMetric: {
            isOpen: false,
        },
        customDimension: {
            isOpen: false,
        },
    },
};

export const getValidChartConfig = (
    chartType: ChartType,
    chartConfig: ChartConfig | undefined,
    cachedConfigs?: Partial<ConfigCacheMap>,
): ChartConfig => {
    switch (chartType) {
        case ChartType.CARTESIAN: {
            const cachedConfig = cachedConfigs?.[chartType];

            return {
                type: chartType,
                config:
                    chartConfig && chartConfig.type === ChartType.CARTESIAN
                        ? chartConfig.config
                        : cachedConfig
                        ? cachedConfig
                        : EMPTY_CARTESIAN_CHART_CONFIG,
            };
        }
        case ChartType.BIG_NUMBER: {
            const cachedConfig = cachedConfigs?.[chartType];

            return {
                type: chartType,
                config:
                    chartConfig && chartConfig.type === ChartType.BIG_NUMBER
                        ? chartConfig.config
                        : cachedConfig
                        ? cachedConfig
                        : {},
            };
        }
        case ChartType.TABLE: {
            const cachedConfig = cachedConfigs?.[chartType];

            return {
                type: chartType,
                config:
                    chartConfig && chartConfig.type === ChartType.TABLE
                        ? chartConfig.config
                        : cachedConfig
                        ? cachedConfig
                        : {},
            };
        }
        case ChartType.PIE: {
            const cachedConfig = cachedConfigs?.[chartType];

            return {
                type: chartType,
                config:
                    chartConfig && chartConfig.type === ChartType.PIE
                        ? chartConfig.config
                        : cachedConfig
                        ? cachedConfig
                        : {},
            };
        }
        case ChartType.CUSTOM: {
            const cachedConfig = cachedConfigs?.[chartType];

            return {
                type: chartType,
                config:
                    chartConfig && chartConfig.type === ChartType.CUSTOM
                        ? chartConfig.config
                        : cachedConfig
                        ? cachedConfig
                        : {},
            };
        }
        default:
            return assertUnreachable(
                chartType,
                `Invalid chart type ${chartType}`,
            );
    }
};

const calcColumnOrder = (
    columnOrder: FieldId[],
    fieldIds: FieldId[],
    dimensions?: FieldId[],
): FieldId[] => {
    const cleanColumnOrder = columnOrder.filter((column) =>
        fieldIds.includes(column),
    );
    const missingColumns = fieldIds.filter(
        (fieldId) => !cleanColumnOrder.includes(fieldId),
    );

    if (dimensions !== undefined) {
        const positionDimensionColumn = Math.max(
            ...dimensions.map((d) => cleanColumnOrder.indexOf(d)),
        );
        cleanColumnOrder.splice(
            positionDimensionColumn + 1,
            0,
            ...missingColumns,
        );
        return cleanColumnOrder;
    } else {
        return [...cleanColumnOrder, ...missingColumns];
    }
};

const updateChartConfigWithTableCalc = (
    prevChartConfig: ChartConfig,
    oldTableCalculationName: string,
    newTableCalculationName: string,
) => {
    const newConfig = cloneDeep(prevChartConfig);

    if (newConfig.type !== ChartType.CARTESIAN || !newConfig.config) {
        return newConfig;
    }

    if (newConfig.config.layout.xField === oldTableCalculationName) {
        newConfig.config.layout.xField = newTableCalculationName;
    }

    if (newConfig.config.layout.yField) {
        const index = newConfig.config.layout.yField.indexOf(
            oldTableCalculationName,
        );

        if (index > -1)
            newConfig.config.layout.yField[index] = newTableCalculationName;
    }

    return newConfig;
};

const getTableCalculationsMetadata = (
    state: ExplorerReduceState,
    oldTableCalculationName: string,
    newTableCalculationName: string,
) => {
    const tcMetadataIndex =
        state.metadata?.tableCalculations?.findIndex((tc) => {
            return tc.name === oldTableCalculationName;
        }) ?? -1;

    if (tcMetadataIndex >= 0) {
        return [
            ...(state.metadata?.tableCalculations?.slice(0, tcMetadataIndex) ??
                []),
            { name: newTableCalculationName, oldName: oldTableCalculationName },
            ...(state.metadata?.tableCalculations?.slice(tcMetadataIndex + 1) ??
                []),
        ];
    }

    return [
        ...(state.metadata?.tableCalculations ?? []),
        { name: newTableCalculationName, oldName: oldTableCalculationName },
    ];
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
            return action.payload;
        }
        case ActionType.SET_TABLE_NAME: {
            return {
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    tableName: action.payload,
                },
            };
        }
        case ActionType.SET_FETCH_RESULTS_FALSE: {
            return { ...state, shouldFetchResults: false };
        }
        case ActionType.SET_PREVIOUSLY_FETCHED_STATE: {
            return {
                ...state,
                previouslyFetchedState: action.payload,
            };
        }
        case ActionType.TOGGLE_EXPANDED_SECTION: {
            return {
                ...state,
                expandedSections: toggleArrayValue(
                    state.expandedSections,
                    action.payload,
                ),
            };
        }
        case ActionType.REMOVE_FIELD: {
            const dimensions =
                state.unsavedChartVersion.metricQuery.dimensions.filter(
                    (fieldId) => fieldId !== action.payload,
                );
            const metrics =
                state.unsavedChartVersion.metricQuery.metrics.filter(
                    (fieldId) => fieldId !== action.payload,
                );
            return {
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        dimensions,
                        metrics,
                        sorts: state.unsavedChartVersion.metricQuery.sorts.filter(
                            (s) => s.fieldId !== action.payload,
                        ),
                    },
                    tableConfig: {
                        ...state.unsavedChartVersion.tableConfig,
                        columnOrder:
                            state.unsavedChartVersion.tableConfig.columnOrder.filter(
                                (fieldId) => fieldId !== action.payload,
                            ),
                    },
                },
            };
        }
        case ActionType.TOGGLE_DIMENSION: {
            const dimensions = toggleArrayValue(
                state.unsavedChartVersion.metricQuery.dimensions,
                action.payload,
            );
            return {
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        dimensions,
                        sorts: state.unsavedChartVersion.metricQuery.sorts.filter(
                            (s) => s.fieldId !== action.payload,
                        ),
                    },
                    tableConfig: {
                        ...state.unsavedChartVersion.tableConfig,
                        columnOrder: calcColumnOrder(
                            state.unsavedChartVersion.tableConfig.columnOrder,
                            [
                                ...dimensions,
                                ...state.unsavedChartVersion.metricQuery
                                    .metrics,
                                ...state.unsavedChartVersion.metricQuery.tableCalculations.map(
                                    ({ name }) => name,
                                ),
                            ],
                            dimensions,
                        ),
                    },
                },
            };
        }
        case ActionType.TOGGLE_METRIC: {
            const metrics = toggleArrayValue(
                state.unsavedChartVersion.metricQuery.metrics,
                action.payload,
            );
            return {
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        metrics,
                        sorts: state.unsavedChartVersion.metricQuery.sorts.filter(
                            (s) => s.fieldId !== action.payload,
                        ),
                    },
                    tableConfig: {
                        ...state.unsavedChartVersion.tableConfig,
                        columnOrder: calcColumnOrder(
                            state.unsavedChartVersion.tableConfig.columnOrder,
                            [
                                ...state.unsavedChartVersion.metricQuery
                                    .dimensions,
                                ...metrics,
                                ...state.unsavedChartVersion.metricQuery.tableCalculations.map(
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
                ...state.unsavedChartVersion.metricQuery.dimensions,
                ...state.unsavedChartVersion.metricQuery.metrics,
                ...state.unsavedChartVersion.metricQuery.tableCalculations.map(
                    (tc) => tc.name,
                ),
            ]);
            if (!activeFields.has(sortFieldId)) {
                return state;
            }
            const sortField = state.unsavedChartVersion.metricQuery.sorts.find(
                (sf) => sf.fieldId === sortFieldId,
            );
            return {
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        sorts: !sortField
                            ? [
                                  ...state.unsavedChartVersion.metricQuery
                                      .sorts,
                                  {
                                      fieldId: sortFieldId,
                                      descending: false,
                                  },
                              ]
                            : state.unsavedChartVersion.metricQuery.sorts.reduce<
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
                ...state.unsavedChartVersion.metricQuery.dimensions,
                ...state.unsavedChartVersion.metricQuery.metrics,
                ...state.unsavedChartVersion.metricQuery.tableCalculations.map(
                    (tc) => tc.name,
                ),
            ]);
            return {
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        sorts: action.payload.filter((sf) =>
                            activeFields.has(sf.fieldId),
                        ),
                    },
                },
            };
        }
        case ActionType.ADD_SORT_FIELD: {
            return produce(state, (newState) => {
                const sort =
                    newState.unsavedChartVersion.metricQuery.sorts.find(
                        (sf) => sf.fieldId === action.payload.fieldId,
                    );

                if (sort) {
                    sort.descending = action.payload.descending;
                } else {
                    newState.unsavedChartVersion.metricQuery.sorts.push(
                        action.payload,
                    );
                }
            });
        }
        case ActionType.REMOVE_SORT_FIELD: {
            return produce(state, (newState) => {
                newState.unsavedChartVersion.metricQuery.sorts =
                    newState.unsavedChartVersion.metricQuery.sorts.filter(
                        (sf) => sf.fieldId !== action.payload,
                    );
            });
        }
        case ActionType.MOVE_SORT_FIELDS: {
            return produce(state, (newState) => {
                const sorts = newState.unsavedChartVersion.metricQuery.sorts;
                const { sourceIndex, destinationIndex } = action.payload;

                const [removed] = sorts.splice(sourceIndex, 1);
                sorts.splice(destinationIndex, 0, removed);
            });
        }
        case ActionType.SET_ROW_LIMIT: {
            return {
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        limit: action.payload,
                    },
                },
            };
        }
        case ActionType.SET_TIME_ZONE: {
            return {
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        timezone: action.payload,
                    },
                },
            };
        }
        case ActionType.SET_FILTERS: {
            return {
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        filters: action.payload,
                    },
                },
            };
        }
        case ActionType.ADD_ADDITIONAL_METRIC: {
            const isMetricAlreadyInList = (
                state.unsavedChartVersion.metricQuery.additionalMetrics || []
            ).find(
                (metric) => getFieldId(metric) === getFieldId(action.payload),
            );
            return {
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        additionalMetrics: isMetricAlreadyInList
                            ? state.unsavedChartVersion.metricQuery
                                  .additionalMetrics
                            : [
                                  ...(state.unsavedChartVersion.metricQuery
                                      .additionalMetrics || []),
                                  action.payload,
                              ],
                    },
                },
            };
        }

        case ActionType.ADD_CUSTOM_DIMENSION: {
            const newCustomDimension = action.payload;
            const allCustomDimensions = [
                ...(state.unsavedChartVersion.metricQuery.customDimensions ||
                    []),
                newCustomDimension,
            ];

            const dimensions = [
                ...state.unsavedChartVersion.metricQuery.dimensions,
                getCustomDimensionId(newCustomDimension),
            ];
            return {
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        dimensions,
                        customDimensions: allCustomDimensions,
                    },
                    tableConfig: {
                        ...state.unsavedChartVersion.tableConfig,
                        columnOrder: calcColumnOrder(
                            state.unsavedChartVersion.tableConfig.columnOrder,
                            [
                                ...dimensions,
                                ...state.unsavedChartVersion.metricQuery
                                    .metrics,
                                ...state.unsavedChartVersion.metricQuery.tableCalculations.map(
                                    ({ name }) => name,
                                ),
                            ],
                        ),
                    },
                },
            };
        }

        case ActionType.EDIT_CUSTOM_DIMENSION: {
            //The id of the custom dimension changes on edit if the name was updated, so we need to update the dimension array
            const dimensions = [
                ...state.unsavedChartVersion.metricQuery.dimensions.filter(
                    (dimension) =>
                        dimension !==
                        action.payload.previousCustomDimensionName,
                ),
                getItemId(action.payload.customDimension),
            ];
            return {
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        dimensions,
                        customDimensions:
                            state.unsavedChartVersion.metricQuery.customDimensions?.map(
                                (customDimension) =>
                                    customDimension.name ===
                                    action.payload.previousCustomDimensionName
                                        ? action.payload.customDimension
                                        : customDimension,
                            ),
                    },
                },
            };
        }

        case ActionType.REMOVE_CUSTOM_DIMENSION: {
            return {
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        customDimensions: (
                            state.unsavedChartVersion.metricQuery
                                .customDimensions || []
                        ).filter(
                            (customDimension) =>
                                getCustomDimensionId(customDimension) !==
                                action.payload,
                        ),
                        dimensions:
                            state.unsavedChartVersion.metricQuery.dimensions.filter(
                                (dimension) => dimension !== action.payload,
                            ),
                        sorts: state.unsavedChartVersion.metricQuery.sorts.filter(
                            (sort) => sort.fieldId !== action.payload,
                        ),
                    },
                    tableConfig: {
                        ...state.unsavedChartVersion.tableConfig,
                        columnOrder:
                            state.unsavedChartVersion.tableConfig.columnOrder.filter(
                                (fieldId) => fieldId !== action.payload,
                            ),
                    },
                },
            };
        }

        case ActionType.TOGGLE_CUSTOM_DIMENSION_MODAL: {
            return {
                ...state,
                modals: {
                    ...state.modals,
                    customDimension: {
                        isOpen: !state.modals.customDimension.isOpen,
                        ...(action.payload && { ...action.payload }),
                    },
                },
            };
        }

        case ActionType.EDIT_ADDITIONAL_METRIC: {
            const additionalMetricFieldId = getFieldId(
                action.payload.additionalMetric,
            );
            return {
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        metrics:
                            state.unsavedChartVersion.metricQuery.metrics.map(
                                (metric) =>
                                    metric ===
                                    action.payload.previousAdditionalMetricName
                                        ? additionalMetricFieldId
                                        : metric,
                            ),
                        additionalMetrics:
                            state.unsavedChartVersion.metricQuery.additionalMetrics?.map(
                                (metric) =>
                                    metric.uuid ===
                                    action.payload.additionalMetric.uuid
                                        ? action.payload.additionalMetric
                                        : metric,
                            ),
                        sorts: state.unsavedChartVersion.metricQuery.sorts.map(
                            (sortField) =>
                                sortField.fieldId ===
                                action.payload.previousAdditionalMetricName
                                    ? {
                                          ...sortField,
                                          fieldId: additionalMetricFieldId,
                                      }
                                    : sortField,
                        ),
                        filters: Object.entries(
                            state.unsavedChartVersion.metricQuery.filters,
                        ).reduce((acc, [key, value]) => {
                            let valueDeepCopy = cloneDeep(value);
                            if (key === 'metrics') {
                                updateFieldIdInFilters(
                                    valueDeepCopy,
                                    action.payload.previousAdditionalMetricName,
                                    additionalMetricFieldId,
                                );
                            }
                            return {
                                ...acc,
                                [key]: valueDeepCopy,
                            };
                        }, {}),
                        tableCalculations:
                            state.unsavedChartVersion.metricQuery.tableCalculations.map(
                                (tableCalculation) => {
                                    let tableCalculationDeepCopy =
                                        cloneDeep(tableCalculation);

                                    tableCalculationDeepCopy.sql =
                                        tableCalculationDeepCopy.sql.replace(
                                            lightdashVariablePattern,
                                            (_, fieldRef) => {
                                                const fieldId =
                                                    convertFieldRefToFieldId(
                                                        fieldRef,
                                                    );

                                                if (
                                                    fieldId ===
                                                    action.payload
                                                        .previousAdditionalMetricName
                                                ) {
                                                    return `\${${getFieldRef(
                                                        action.payload
                                                            .additionalMetric,
                                                    )}}`;
                                                }
                                                return `\${${fieldRef}}`;
                                            },
                                        );

                                    return tableCalculationDeepCopy;
                                },
                            ),
                    },
                    tableConfig: {
                        ...state.unsavedChartVersion.tableConfig,
                        columnOrder:
                            state.unsavedChartVersion.tableConfig.columnOrder.map(
                                (fieldId) =>
                                    fieldId ===
                                    action.payload.previousAdditionalMetricName
                                        ? additionalMetricFieldId
                                        : fieldId,
                            ),
                    },
                },
            };
        }

        case ActionType.REMOVE_ADDITIONAL_METRIC: {
            return {
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        additionalMetrics: (
                            state.unsavedChartVersion.metricQuery
                                .additionalMetrics || []
                        ).filter(
                            (metric) => getFieldId(metric) !== action.payload,
                        ),
                        metrics:
                            state.unsavedChartVersion.metricQuery.metrics.filter(
                                (metric) => metric !== action.payload,
                            ),
                        sorts: state.unsavedChartVersion.metricQuery.sorts.filter(
                            (sort) => sort.fieldId !== action.payload,
                        ),
                        filters: Object.entries(
                            state.unsavedChartVersion.metricQuery.filters,
                        ).reduce((acc, [key, value]) => {
                            let valueDeepCopy = cloneDeep(value);
                            if (key === 'metrics') {
                                return {
                                    ...acc,
                                    [key]: removeFieldFromFilterGroup(
                                        valueDeepCopy,
                                        action.payload,
                                    ),
                                };
                            }

                            return {
                                ...acc,
                                [key]: valueDeepCopy,
                            };
                        }, {}),
                    },
                    tableConfig: {
                        ...state.unsavedChartVersion.tableConfig,
                        columnOrder:
                            state.unsavedChartVersion.tableConfig.columnOrder.filter(
                                (fieldId) => fieldId !== action.payload,
                            ),
                    },
                },
            };
        }
        case ActionType.TOGGLE_ADDITIONAL_METRIC_MODAL: {
            return {
                ...state,
                modals: {
                    ...state.modals,
                    additionalMetric: {
                        isOpen: !state.modals.additionalMetric.isOpen,
                        ...(action.payload && { ...action.payload }),
                    },
                },
            };
        }
        case ActionType.SET_COLUMN_ORDER: {
            return {
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    tableConfig: {
                        ...state.unsavedChartVersion.tableConfig,
                        columnOrder: calcColumnOrder(action.payload, [
                            ...state.unsavedChartVersion.metricQuery.dimensions,

                            ...state.unsavedChartVersion.metricQuery.metrics,
                            ...state.unsavedChartVersion.metricQuery.tableCalculations.map(
                                ({ name }) => name,
                            ),
                        ]),
                    },
                },
            };
        }
        case ActionType.ADD_TABLE_CALCULATION: {
            const newTableCalculations = [
                ...state.unsavedChartVersion.metricQuery.tableCalculations,
                action.payload,
            ];
            return {
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        tableCalculations: newTableCalculations,
                    },
                    tableConfig: {
                        ...state.unsavedChartVersion.tableConfig,
                        columnOrder: calcColumnOrder(
                            state.unsavedChartVersion.tableConfig.columnOrder,
                            [
                                ...state.unsavedChartVersion.metricQuery
                                    .dimensions,

                                ...state.unsavedChartVersion.metricQuery
                                    .metrics,
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
                metadata: {
                    ...state.metadata,
                    tableCalculations: getTableCalculationsMetadata(
                        state,
                        action.payload.oldName,
                        action.payload.tableCalculation.name,
                    ),
                },
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        tableCalculations:
                            state.unsavedChartVersion.metricQuery.tableCalculations.map(
                                (tableCalculation) =>
                                    tableCalculation.name ===
                                    action.payload.oldName
                                        ? action.payload.tableCalculation
                                        : tableCalculation,
                            ),
                        sorts: state.unsavedChartVersion.metricQuery.sorts.map(
                            (field) =>
                                field.fieldId === action.payload.oldName
                                    ? {
                                          ...field,
                                          fieldId:
                                              action.payload.tableCalculation
                                                  .name,
                                      }
                                    : field,
                        ),
                    },
                    chartConfig: updateChartConfigWithTableCalc(
                        state.unsavedChartVersion.chartConfig,
                        action.payload.oldName,
                        action.payload.tableCalculation.name,
                    ),
                    tableConfig: {
                        ...state.unsavedChartVersion.tableConfig,
                        columnOrder:
                            state.unsavedChartVersion.tableConfig.columnOrder.map(
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
                state.unsavedChartVersion.metricQuery.tableCalculations.filter(
                    (tableCalculation) =>
                        tableCalculation.name !== action.payload,
                );
            return {
                ...state,
                metadata: {
                    ...state.metadata,
                    tableCalculations:
                        state.metadata?.tableCalculations?.filter(
                            (tc) => tc.name !== action.payload,
                        ),
                },
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        tableCalculations: newTableCalculations,
                        sorts: state.unsavedChartVersion.metricQuery.sorts.filter(
                            (sort) => sort.fieldId !== action.payload,
                        ),
                    },
                    tableConfig: {
                        ...state.unsavedChartVersion.tableConfig,
                        columnOrder: calcColumnOrder(
                            state.unsavedChartVersion.tableConfig.columnOrder,
                            [
                                ...state.unsavedChartVersion.metricQuery
                                    .dimensions,

                                ...state.unsavedChartVersion.metricQuery
                                    .metrics,
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
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    pivotConfig:
                        action.payload.length > 0
                            ? {
                                  columns: action.payload,
                              }
                            : undefined,
                },
            };
        }
        case ActionType.SET_CHART_TYPE: {
            return {
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    chartConfig: getValidChartConfig(
                        action.payload.chartType,
                        state.unsavedChartVersion.chartConfig,
                        action.payload.cachedConfigs,
                    ),
                },
            };
        }
        case ActionType.SET_CHART_CONFIG: {
            return {
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    chartConfig: getValidChartConfig(
                        action.payload.chartConfig.type,
                        action.payload.chartConfig,
                        action.payload.cachedConfigs,
                    ),
                },
            };
        }
        default: {
            return assertUnreachable(
                action,
                'Unexpected action in explore reducer',
            );
        }
    }
}

type ConfigCacheMap = {
    [ChartType.PIE]: PieChartConfig['config'];
    [ChartType.BIG_NUMBER]: BigNumberConfig['config'];
    [ChartType.TABLE]: TableChartConfig['config'];
    [ChartType.CARTESIAN]: CartesianChartConfig['config'];
    [ChartType.CUSTOM]: CustomVisConfig['config'];
};

export const ExplorerProvider: FC<
    React.PropsWithChildren<{
        isEditMode?: boolean;
        initialState?: ExplorerReduceState;
        savedChart?: SavedChart;
        queryResults: ReturnType<
            typeof useQueryResults | typeof useChartVersionResultsMutation
        >;
    }>
> = ({
    isEditMode = false,
    initialState,
    savedChart,
    children,
    queryResults,
}) => {
    const [reducerState, dispatch] = useReducer(
        reducer,
        initialState || defaultState,
    );
    const { unsavedChartVersion } = reducerState;

    const [activeFields, isValidQuery] = useMemo<
        [Set<FieldId>, boolean]
    >(() => {
        const fields = new Set([
            ...unsavedChartVersion.metricQuery.dimensions,
            ...unsavedChartVersion.metricQuery.metrics,
            ...unsavedChartVersion.metricQuery.tableCalculations.map(
                ({ name }) => name,
            ),
        ]);
        return [fields, fields.size > 0];
    }, [unsavedChartVersion]);

    const cachedChartConfig = useRef<Partial<ConfigCacheMap>>({});

    const resetCachedChartConfig = () => {
        cachedChartConfig.current = {};
    };

    const reset = useCallback(() => {
        resetCachedChartConfig();

        dispatch({
            type: ActionType.RESET,
            payload: initialState || defaultState,
        });
    }, [initialState]);

    const setTableName = useCallback((tableName: string) => {
        dispatch({
            type: ActionType.SET_TABLE_NAME,
            payload: tableName,
        });
    }, []);

    const toggleExpandedSection = useCallback((payload: ExplorerSection) => {
        dispatch({
            type: ActionType.TOGGLE_EXPANDED_SECTION,
            payload,
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

    const removeActiveField = useCallback((fieldId: FieldId) => {
        dispatch({
            type: ActionType.REMOVE_FIELD,
            payload: fieldId,
        });
    }, []);

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

    const removeSortField = useCallback((fieldId: FieldId) => {
        dispatch({
            type: ActionType.REMOVE_SORT_FIELD,
            payload: fieldId,
            options: {
                shouldFetchResults: true,
            },
        });
    }, []);

    const moveSortFields = useCallback(
        (sourceIndex: number, destinationIndex: number) => {
            dispatch({
                type: ActionType.MOVE_SORT_FIELDS,
                payload: { sourceIndex, destinationIndex },
                options: {
                    shouldFetchResults: true,
                },
            });
        },
        [],
    );

    const addSortField = useCallback(
        (
            fieldId: FieldId,
            options: { descending: boolean } = { descending: false },
        ) => {
            dispatch({
                type: ActionType.ADD_SORT_FIELD,
                payload: { fieldId, ...options },
                options: {
                    shouldFetchResults: true,
                },
            });
        },
        [],
    );

    const setRowLimit = useCallback((limit: number) => {
        dispatch({
            type: ActionType.SET_ROW_LIMIT,
            payload: limit,
            options: {
                shouldFetchResults: true,
            },
        });
    }, []);

    const setTimeZone = useCallback((timezone: TimeZone) => {
        dispatch({
            type: ActionType.SET_TIME_ZONE,
            payload: timezone,
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
            payload: {
                chartType,
                cachedConfigs: cachedChartConfig.current,
            },
        });
    }, []);

    const setChartConfig = useCallback((chartConfig: ChartConfig) => {
        if (chartConfig) {
            cachedChartConfig.current = {
                ...cachedChartConfig.current,
                [chartConfig.type]: chartConfig.config,
            };
        }

        dispatch({
            type: ActionType.SET_CHART_CONFIG,
            payload: {
                chartConfig,
                cachedConfigs: cachedChartConfig.current,
            },
        });
    }, []);

    const addAdditionalMetric = useCallback(
        (additionalMetric: AdditionalMetric) => {
            dispatch({
                type: ActionType.ADD_ADDITIONAL_METRIC,
                payload: additionalMetric,
            });
            dispatch({
                type: ActionType.TOGGLE_METRIC,
                payload: getFieldId(additionalMetric),
            });
        },
        [],
    );

    const editAdditionalMetric = useCallback(
        (
            additionalMetric: AdditionalMetric,
            previousAdditionalMetricName: string,
        ) => {
            dispatch({
                type: ActionType.EDIT_ADDITIONAL_METRIC,
                payload: { additionalMetric, previousAdditionalMetricName },
            });
        },
        [],
    );

    const removeAdditionalMetric = useCallback((key: FieldId) => {
        dispatch({
            type: ActionType.REMOVE_ADDITIONAL_METRIC,
            payload: key,
        });
    }, []);

    const toggleAdditionalMetricModal = useCallback(
        (
            additionalMetricModalData?: Omit<
                ExplorerReduceState['modals']['additionalMetric'],
                'isOpen'
            >,
        ) => {
            dispatch({
                type: ActionType.TOGGLE_ADDITIONAL_METRIC_MODAL,
                ...(additionalMetricModalData && {
                    payload: additionalMetricModalData,
                }),
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
                unsavedChartVersion.metricQuery.tableCalculations.findIndex(
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
                options: {
                    shouldFetchResults: true,
                },
            });
        },
        [unsavedChartVersion],
    );
    const updateTableCalculation = useCallback(
        (oldName: string, tableCalculation: TableCalculation) => {
            if (
                oldName !== tableCalculation.name &&
                unsavedChartVersion.metricQuery.tableCalculations.findIndex(
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
                options: {
                    shouldFetchResults: true,
                },
            });
        },
        [unsavedChartVersion],
    );
    const deleteTableCalculation = useCallback((name: string) => {
        dispatch({
            type: ActionType.DELETE_TABLE_CALCULATION,
            payload: name,
        });
    }, []);

    const addCustomDimension = useCallback(
        (customDimension: CustomDimension) => {
            dispatch({
                type: ActionType.ADD_CUSTOM_DIMENSION,
                payload: customDimension,
                options: {
                    shouldFetchResults: true,
                },
            });

            // TODO: add dispatch toggle
        },
        [],
    );

    const editCustomDimension = useCallback(
        (
            customDimension: CustomDimension,
            previousCustomDimensionName: string,
        ) => {
            dispatch({
                type: ActionType.EDIT_CUSTOM_DIMENSION,
                payload: { customDimension, previousCustomDimensionName },
            });
            // TODO: add dispatch toggle
        },
        [],
    );

    const removeCustomDimension = useCallback((key: FieldId) => {
        dispatch({
            type: ActionType.REMOVE_CUSTOM_DIMENSION,
            payload: key,
        });
    }, []);

    const toggleCustomDimensionModal = useCallback(
        (
            customDimensionModalData?: Omit<
                ExplorerReduceState['modals']['customDimension'],
                'isOpen'
            >,
        ) => {
            dispatch({
                type: ActionType.TOGGLE_CUSTOM_DIMENSION_MODAL,
                ...(customDimensionModalData && {
                    payload: customDimensionModalData,
                }),
            });
        },
        [],
    );

    const hasUnsavedChanges = useMemo<boolean>(() => {
        if (savedChart) {
            return !deepEqual(
                removeEmptyProperties({
                    tableName: savedChart.tableName,
                    chartConfig: savedChart.chartConfig,
                    metricQuery: savedChart.metricQuery,
                    tableConfig: savedChart.tableConfig,
                    pivotConfig: savedChart.pivotConfig,
                }),
                removeEmptyProperties(unsavedChartVersion),
            );
        }
        return isValidQuery;
    }, [unsavedChartVersion, isValidQuery, savedChart]);

    const state = useMemo(
        () => ({
            ...reducerState,
            isEditMode,
            activeFields,
            isValidQuery,
            hasUnsavedChanges,
            savedChart,
        }),
        [
            isEditMode,
            reducerState,
            activeFields,
            isValidQuery,
            hasUnsavedChanges,
            savedChart,
        ],
    );

    // Fetch query results after state update
    const { mutateAsync: mutateAsyncQuery, reset: resetQueryResults } =
        queryResults;

    const mutateAsync = useCallback(async () => {
        try {
            const result = await mutateAsyncQuery(
                unsavedChartVersion.tableName,
                unsavedChartVersion.metricQuery,
            );

            dispatch({
                type: ActionType.SET_PREVIOUSLY_FETCHED_STATE,
                payload: cloneDeep(unsavedChartVersion.metricQuery),
            });

            return result;
        } catch (e) {
            console.error(e);
        }
    }, [
        mutateAsyncQuery,
        unsavedChartVersion.tableName,
        unsavedChartVersion.metricQuery,
    ]);

    useEffect(() => {
        if (!state.shouldFetchResults) return;

        async function fetchResults() {
            await mutateAsync();
            dispatch({ type: ActionType.SET_FETCH_RESULTS_FALSE });
        }

        void fetchResults();
    }, [mutateAsync, state.shouldFetchResults]);

    const clearExplore = useCallback(async () => {
        resetCachedChartConfig();

        dispatch({
            type: ActionType.RESET,
            payload: defaultState,
        });
        resetQueryResults();
    }, [resetQueryResults]);

    const history = useHistory();
    const clearQuery = useCallback(async () => {
        dispatch({
            type: ActionType.RESET,
            payload: {
                ...defaultState,
                unsavedChartVersion: {
                    ...defaultState.unsavedChartVersion,
                    tableName: unsavedChartVersion.tableName,
                },
            },
        });
        resetQueryResults();
        // clear state in url params
        history.replace({
            search: '',
        });
    }, [history, resetQueryResults, unsavedChartVersion.tableName]);

    const defaultSort = useDefaultSortField(unsavedChartVersion);

    const fetchResults = useCallback(() => {
        if (unsavedChartVersion.metricQuery.sorts.length <= 0 && defaultSort) {
            setSortFields([defaultSort]);
        } else {
            return mutateAsync();
        }
    }, [defaultSort, mutateAsync, unsavedChartVersion, setSortFields]);

    const actions = useMemo(
        () => ({
            clearExplore,
            clearQuery,
            reset,
            setTableName,
            removeActiveField,
            toggleActiveField,
            toggleSortField,
            setSortFields,
            addSortField,
            removeSortField,
            moveSortFields,
            setFilters,
            setRowLimit,
            setTimeZone,
            setColumnOrder,
            addAdditionalMetric,
            editAdditionalMetric,
            removeAdditionalMetric,
            toggleAdditionalMetricModal,
            addTableCalculation,
            deleteTableCalculation,
            updateTableCalculation,
            setPivotFields,
            setChartType,
            setChartConfig,
            fetchResults,
            toggleExpandedSection,
            addCustomDimension,
            editCustomDimension,
            removeCustomDimension,
            toggleCustomDimensionModal,
        }),
        [
            clearExplore,
            clearQuery,
            reset,
            setTableName,
            removeActiveField,
            toggleActiveField,
            toggleSortField,
            setSortFields,
            addSortField,
            removeSortField,
            moveSortFields,
            setFilters,
            setRowLimit,
            setTimeZone,
            setColumnOrder,
            addAdditionalMetric,
            editAdditionalMetric,
            removeAdditionalMetric,
            toggleAdditionalMetricModal,
            addTableCalculation,
            deleteTableCalculation,
            updateTableCalculation,
            setPivotFields,
            setChartType,
            setChartConfig,
            fetchResults,
            toggleExpandedSection,
            addCustomDimension,
            editCustomDimension,
            removeCustomDimension,
            toggleCustomDimensionModal,
        ],
    );

    const value: ExplorerContext = useMemo(
        () => ({
            state,
            queryResults,
            actions,
        }),
        [actions, queryResults, state],
    );
    return <Context.Provider value={value}>{children}</Context.Provider>;
};

export function useExplorerContext<Selected>(
    selector: (value: ExplorerContext) => Selected,
) {
    return useContextSelector(Context, (context) => {
        if (context === undefined) {
            throw new Error(
                'useExplorer must be used within a ExplorerProvider',
            );
        }
        return selector(context);
    });
}
