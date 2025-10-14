import {
    assertUnreachable,
    ChartType,
    convertFieldRefToFieldId,
    deepEqual,
    getFieldRef,
    getItemId,
    isSqlTableCalculation,
    isTimeZone,
    lightdashVariablePattern,
    maybeReplaceFieldsInChartVersion,
    removeEmptyProperties,
    removeFieldFromFilterGroup,
    toggleArrayValue,
    updateFieldIdInFilters,
    type AdditionalMetric,
    type ChartConfig,
    type CreateSavedChartVersion,
    type CustomDimension,
    type CustomFormat,
    type FieldId,
    type Metric,
    type MetricQuery,
    type ReplaceCustomFields,
    type SavedChart,
    type TableCalculation,
} from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { produce } from 'immer';
import cloneDeep from 'lodash/cloneDeep';
import {
    useCallback,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    type FC,
} from 'react';
import { useNavigate } from 'react-router';
import {
    calcColumnOrder,
    explorerActions,
    selectIsValidQuery,
    selectTableName,
    selectUnsavedChartVersion,
    useExplorerDispatch,
    useExplorerInitialization,
    useExplorerSelector,
} from '../../features/explorer/store';
import ExplorerContext from './context';
import { defaultState } from './defaultState';
import {
    ActionType,
    type Action,
    type ConfigCacheMap,
    type ExplorerContextType,
    type ExplorerReduceState,
} from './types';
import { cleanConfig, getValidChartConfig } from './utils';

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

// Export for test
// eslint-disable-next-line react-refresh/only-export-components
export function reducer(
    state: ExplorerReduceState,
    action: Action,
): ExplorerReduceState {
    switch (action.type) {
        case ActionType.RESET: {
            return action.payload;
        }
        case ActionType.SET_TABLE_NAME: {
            return produce(state, (draft) => {
                draft.unsavedChartVersion.tableName = action.payload;
                draft.unsavedChartVersion.metricQuery.exploreName =
                    action.payload;
            });
        }
        case ActionType.SET_FILTERS: {
            return produce(state, (draft) => {
                draft.unsavedChartVersion.metricQuery.filters = action.payload;
            });
        }
        case ActionType.SET_PREVIOUSLY_FETCHED_STATE: {
            return produce(state, (draft) => {
                draft.previouslyFetchedState = action.payload;
            });
        }
        case ActionType.TOGGLE_EXPANDED_SECTION: {
            return produce(state, (draft) => {
                draft.expandedSections = toggleArrayValue(
                    draft.expandedSections,
                    action.payload,
                );
            });
        }
        case ActionType.SET_ROW_LIMIT: {
            return produce(state, (draft) => {
                draft.unsavedChartVersion.metricQuery.limit = action.payload;
            });
        }
        case ActionType.SET_TIME_ZONE: {
            return produce(state, (draft) => {
                draft.unsavedChartVersion.metricQuery.timezone = action.payload;
            });
        }
        case ActionType.ADD_ADDITIONAL_METRIC: {
            return produce(state, (draft) => {
                const isMetricAlreadyInList = (
                    draft.unsavedChartVersion.metricQuery.additionalMetrics ||
                    []
                ).find(
                    (metric) => getItemId(metric) === getItemId(action.payload),
                );
                if (!isMetricAlreadyInList) {
                    draft.unsavedChartVersion.metricQuery.additionalMetrics = [
                        ...(draft.unsavedChartVersion.metricQuery
                            .additionalMetrics || []),
                        action.payload,
                    ];
                }
            });
        }

        case ActionType.ADD_CUSTOM_DIMENSION: {
            return produce(state, (draft) => {
                const newCustomDimension = action.payload;
                draft.unsavedChartVersion.metricQuery.customDimensions = [
                    ...(draft.unsavedChartVersion.metricQuery
                        .customDimensions || []),
                    newCustomDimension,
                ];
            });
        }

        case ActionType.EDIT_CUSTOM_DIMENSION: {
            return produce(state, (draft) => {
                const { previousCustomDimensionId, customDimension } =
                    action.payload;

                draft.unsavedChartVersion.metricQuery.customDimensions =
                    draft.unsavedChartVersion.metricQuery.customDimensions?.map(
                        (cd) =>
                            cd.id === previousCustomDimensionId
                                ? customDimension
                                : cd,
                    );
            });
        }

        case ActionType.REMOVE_CUSTOM_DIMENSION: {
            return produce(state, (draft) => {
                const dimensionIdToRemove = action.payload;
                draft.unsavedChartVersion.metricQuery.customDimensions = (
                    draft.unsavedChartVersion.metricQuery.customDimensions || []
                ).filter(
                    (customDimension) =>
                        getItemId(customDimension) !== dimensionIdToRemove,
                );
                // NOTE: dimensions, sorts, and columnOrder are managed in Redux
                // The Context action will dispatch to Redux separately
            });
        }

        case ActionType.TOGGLE_CUSTOM_DIMENSION_MODAL: {
            return produce(state, (draft) => {
                draft.modals.customDimension = {
                    isOpen: !draft.modals.customDimension.isOpen,
                    ...(action.payload && { ...action.payload }),
                };
            });
        }

        case ActionType.TOGGLE_FORMAT_MODAL: {
            return produce(state, (draft) => {
                draft.modals.format = {
                    isOpen: !draft.modals.format.isOpen,
                    ...(action.payload && { ...action.payload }),
                };
            });
        }

        case ActionType.UPDATE_METRIC_FORMAT: {
            return produce(state, (draft) => {
                const { metric, formatOptions } = action.payload;
                const metricId = getItemId(metric);
                if (!draft.unsavedChartVersion.metricQuery.metricOverrides) {
                    draft.unsavedChartVersion.metricQuery.metricOverrides = {};
                }
                draft.unsavedChartVersion.metricQuery.metricOverrides[
                    metricId
                ] = { formatOptions };
            });
        }

        case ActionType.EDIT_ADDITIONAL_METRIC: {
            return produce(state, (draft) => {
                const { additionalMetric, previousAdditionalMetricName } =
                    action.payload;
                const additionalMetricFieldId = getItemId(additionalMetric);

                draft.unsavedChartVersion.metricQuery.metrics =
                    draft.unsavedChartVersion.metricQuery.metrics.map(
                        (metric) =>
                            metric === previousAdditionalMetricName
                                ? additionalMetricFieldId
                                : metric,
                    );

                draft.unsavedChartVersion.metricQuery.additionalMetrics =
                    draft.unsavedChartVersion.metricQuery.additionalMetrics?.map(
                        (metric) =>
                            metric.uuid === additionalMetric.uuid
                                ? additionalMetric
                                : metric,
                    );

                draft.unsavedChartVersion.metricQuery.sorts =
                    draft.unsavedChartVersion.metricQuery.sorts.map(
                        (sortField) =>
                            sortField.fieldId === previousAdditionalMetricName
                                ? {
                                      ...sortField,
                                      fieldId: additionalMetricFieldId,
                                  }
                                : sortField,
                    );

                const newFilters = {
                    ...draft.unsavedChartVersion.metricQuery.filters,
                };
                if (newFilters.metrics) {
                    updateFieldIdInFilters(
                        newFilters.metrics,
                        previousAdditionalMetricName,
                        additionalMetricFieldId,
                    );
                }
                draft.unsavedChartVersion.metricQuery.filters = newFilters;

                draft.unsavedChartVersion.metricQuery.tableCalculations =
                    draft.unsavedChartVersion.metricQuery.tableCalculations.map(
                        (tableCalculation) => {
                            if (!isSqlTableCalculation(tableCalculation)) {
                                return tableCalculation;
                            }

                            const newSql = tableCalculation.sql.replace(
                                lightdashVariablePattern,
                                (_, fieldRef) => {
                                    const fieldId =
                                        convertFieldRefToFieldId(fieldRef);
                                    if (
                                        fieldId === previousAdditionalMetricName
                                    ) {
                                        return `\${${getFieldRef(
                                            additionalMetric,
                                        )}}`;
                                    }
                                    return `\${${fieldRef}}`;
                                },
                            );
                            return {
                                ...tableCalculation,
                                sql: newSql,
                            };
                        },
                    );

                draft.unsavedChartVersion.tableConfig.columnOrder =
                    draft.unsavedChartVersion.tableConfig.columnOrder.map(
                        (fieldId) =>
                            fieldId === previousAdditionalMetricName
                                ? additionalMetricFieldId
                                : fieldId,
                    );
            });
        }

        case ActionType.REMOVE_ADDITIONAL_METRIC: {
            return produce(state, (draft) => {
                const metricIdToRemove = action.payload;

                draft.unsavedChartVersion.metricQuery.additionalMetrics = (
                    draft.unsavedChartVersion.metricQuery.additionalMetrics ||
                    []
                ).filter((metric) => getItemId(metric) !== metricIdToRemove);

                draft.unsavedChartVersion.metricQuery.metrics =
                    draft.unsavedChartVersion.metricQuery.metrics.filter(
                        (metric) => metric !== metricIdToRemove,
                    );

                draft.unsavedChartVersion.metricQuery.sorts =
                    draft.unsavedChartVersion.metricQuery.sorts.filter(
                        (sort) => sort.fieldId !== metricIdToRemove,
                    );

                const newFilters = {
                    ...draft.unsavedChartVersion.metricQuery.filters,
                };
                if (newFilters.metrics) {
                    newFilters.metrics = removeFieldFromFilterGroup(
                        newFilters.metrics,
                        metricIdToRemove,
                    );

                    if (newFilters.metrics) {
                        const isAndGroupEmpty =
                            !('and' in newFilters.metrics) ||
                            !newFilters.metrics.and ||
                            newFilters.metrics.and.length === 0;
                        const isOrGroupEmpty =
                            !('or' in newFilters.metrics) ||
                            !newFilters.metrics.or ||
                            newFilters.metrics.or.length === 0;
                        if (isAndGroupEmpty && isOrGroupEmpty) {
                            delete newFilters.metrics;
                        }
                    }
                }
                draft.unsavedChartVersion.metricQuery.filters = newFilters;

                draft.unsavedChartVersion.tableConfig.columnOrder =
                    draft.unsavedChartVersion.tableConfig.columnOrder.filter(
                        (fieldId) => fieldId !== metricIdToRemove,
                    );
            });
        }
        case ActionType.TOGGLE_ADDITIONAL_METRIC_MODAL: {
            return produce(state, (draft) => {
                draft.modals.additionalMetric = {
                    isOpen: !draft.modals.additionalMetric.isOpen,
                    ...(action.payload && { ...action.payload }),
                };
            });
        }
        case ActionType.TOGGLE_WRITE_BACK_MODAL: {
            return produce(state, (draft) => {
                draft.modals.writeBack = {
                    isOpen: !draft.modals.writeBack.isOpen,
                    ...(action.payload && { ...action.payload }),
                };
            });
        }
        case ActionType.SET_COLUMN_ORDER: {
            return produce(state, (draft) => {
                // When user explicitly sets column order (e.g., drag-and-drop), respect it exactly
                // Match Redux behavior - don't run through calcColumnOrder
                draft.unsavedChartVersion.tableConfig.columnOrder =
                    action.payload;
            });
        }
        case ActionType.ADD_TABLE_CALCULATION: {
            return produce(state, (draft) => {
                draft.unsavedChartVersion.metricQuery.tableCalculations.push(
                    action.payload,
                );
                // The sync effect will copy it back to Context if needed
            });
        }
        case ActionType.UPDATE_TABLE_CALCULATION: {
            return produce(state, (draft) => {
                const { oldName, tableCalculation: newTableCalculation } =
                    action.payload;
                const newName = newTableCalculation.name;

                if (!draft.metadata) {
                    draft.metadata = {};
                }
                draft.metadata.tableCalculations = getTableCalculationsMetadata(
                    draft, // Pass draft here, assuming getTableCalculationsMetadata can handle it or doesn't mutate
                    oldName,
                    newName,
                );

                draft.unsavedChartVersion.metricQuery.tableCalculations =
                    draft.unsavedChartVersion.metricQuery.tableCalculations.map(
                        (tc) =>
                            tc.name === oldName ? newTableCalculation : tc,
                    );

                draft.unsavedChartVersion.metricQuery.sorts =
                    draft.unsavedChartVersion.metricQuery.sorts.map((field) =>
                        field.fieldId === oldName
                            ? { ...field, fieldId: newName }
                            : field,
                    );

                draft.unsavedChartVersion.chartConfig =
                    updateChartConfigWithTableCalc(
                        draft.unsavedChartVersion.chartConfig,
                        oldName,
                        newName,
                    );

                draft.unsavedChartVersion.tableConfig.columnOrder =
                    draft.unsavedChartVersion.tableConfig.columnOrder.map(
                        (column) => (column === oldName ? newName : column),
                    );
            });
        }
        case ActionType.DELETE_TABLE_CALCULATION: {
            return produce(state, (draft) => {
                const nameToRemove = action.payload;
                if (draft.metadata && draft.metadata.tableCalculations) {
                    draft.metadata.tableCalculations =
                        draft.metadata.tableCalculations.filter(
                            (tc) => tc.name !== nameToRemove,
                        );
                }

                draft.unsavedChartVersion.metricQuery.tableCalculations =
                    draft.unsavedChartVersion.metricQuery.tableCalculations.filter(
                        (tc) => tc.name !== nameToRemove,
                    );

                draft.unsavedChartVersion.metricQuery.sorts =
                    draft.unsavedChartVersion.metricQuery.sorts.filter(
                        (sort) => sort.fieldId !== nameToRemove,
                    );

                const dimensionIds =
                    draft.unsavedChartVersion.metricQuery.dimensions;
                const metricIds = draft.unsavedChartVersion.metricQuery.metrics;
                const calcIds =
                    draft.unsavedChartVersion.metricQuery.tableCalculations.map(
                        ({ name }) => name,
                    );

                draft.unsavedChartVersion.tableConfig.columnOrder =
                    calcColumnOrder(
                        draft.unsavedChartVersion.tableConfig.columnOrder,
                        [...dimensionIds, ...metricIds, ...calcIds],
                    );
            });
        }
        case ActionType.SET_PIVOT_FIELDS: {
            return produce(state, (draft) => {
                if (action.payload.length > 0) {
                    draft.unsavedChartVersion.pivotConfig = {
                        columns: action.payload,
                    };
                } else {
                    draft.unsavedChartVersion.pivotConfig = undefined;
                }
            });
        }
        case ActionType.SET_CHART_TYPE: {
            return produce(state, (draft) => {
                draft.unsavedChartVersion.chartConfig = getValidChartConfig(
                    action.payload.chartType,
                    draft.unsavedChartVersion.chartConfig,
                    action.payload.cachedConfigs,
                );
            });
        }
        case ActionType.SET_CHART_CONFIG: {
            return produce(state, (draft) => {
                draft.unsavedChartVersion.chartConfig = getValidChartConfig(
                    action.payload.chartConfig.type,
                    action.payload.chartConfig,
                    action.payload.cachedConfigs,
                );
            });
        }
        case ActionType.REPLACE_FIELDS: {
            const { hasChanges, chartVersion } =
                maybeReplaceFieldsInChartVersion({
                    fieldsToReplace: action.payload.fieldsToReplace,
                    chartVersion: state.unsavedChartVersion,
                });
            if (hasChanges) {
                return produce(state, (draft) => {
                    draft.unsavedChartVersion = chartVersion;
                });
            }
            return state;
        }
        case ActionType.SET_PARAMETER_REFERENCES: {
            return produce(state, (draft) => {
                draft.parameterReferences = action.payload;
            });
        }
        default: {
            return assertUnreachable(
                action,
                'Unexpected action in explore reducer',
            );
        }
    }
}

const ExplorerProvider: FC<
    React.PropsWithChildren<{
        isEditMode?: boolean;
        initialState?: ExplorerReduceState;
        savedChart?: SavedChart;
        defaultLimit?: number;
        projectUuid?: string;
    }>
> = ({
    isEditMode = false,
    initialState,
    savedChart,
    defaultLimit,
    children,
    projectUuid: _propProjectUuid,
}) => {
    const defaultStateWithConfig = useMemo(
        () => ({
            ...defaultState,
            unsavedChartVersion: {
                ...defaultState.unsavedChartVersion,
                metricQuery: {
                    ...defaultState.unsavedChartVersion.metricQuery,
                    ...(defaultLimit !== undefined && { limit: defaultLimit }),
                },
            },
        }),
        [defaultLimit],
    );

    const [reducerState, dispatch] = useReducer(
        reducer,
        initialState || defaultStateWithConfig,
    );
    const { unsavedChartVersion } = reducerState;

    const unsavedChartVersionFromRedux = useExplorerSelector(
        selectUnsavedChartVersion,
    );
    const isValidQuery = useExplorerSelector(selectIsValidQuery);

    // Use refs to track previous values for deep equality check
    const prevChartConfigRef = useRef(unsavedChartVersion.chartConfig);
    const prevPivotConfigRef = useRef(unsavedChartVersion.pivotConfig);

    const mergedUnsavedChartVersion = useMemo(() => {
        // Check if chartConfig or pivotConfig actually changed (deep equality)
        const chartConfigChanged = !deepEqual(
            prevChartConfigRef.current,
            unsavedChartVersion.chartConfig,
        );
        const pivotConfigChanged =
            prevPivotConfigRef.current === undefined
                ? unsavedChartVersion.pivotConfig !== undefined
                : unsavedChartVersion.pivotConfig === undefined
                ? true
                : !deepEqual(
                      prevPivotConfigRef.current,
                      unsavedChartVersion.pivotConfig,
                  );

        // Update refs if changed
        if (chartConfigChanged) {
            prevChartConfigRef.current = unsavedChartVersion.chartConfig;
        }
        if (pivotConfigChanged) {
            prevPivotConfigRef.current = unsavedChartVersion.pivotConfig;
        }

        return {
            ...unsavedChartVersionFromRedux,
            // Use the ref values to keep stable references when content hasn't changed
            chartConfig: prevChartConfigRef.current,
            pivotConfig: prevPivotConfigRef.current,
        };
    }, [
        unsavedChartVersionFromRedux,
        unsavedChartVersion.chartConfig,
        unsavedChartVersion.pivotConfig,
    ]);

    // Create initial state with isEditMode
    const initialStateWithEditMode = useMemo(
        () => ({
            ...(initialState || defaultStateWithConfig),
            isEditMode,
        }),
        [initialState, defaultStateWithConfig, isEditMode],
    );

    useExplorerInitialization(initialStateWithEditMode);

    const reduxDispatch = useExplorerDispatch();

    // TODO: REDUX-MIGRATION - Remove these sync effects once all components use Redux directly
    // START TRANSITIONAL SYNC CODE

    // When savedChart changes (e.g., after saving a new chart), update Context state
    // This ensures pivotConfig and chartConfig are synced when transitioning to saved mode
    useEffect(() => {
        if (savedChart?.pivotConfig !== undefined) {
            const fields = savedChart.pivotConfig.columns;
            dispatch({
                type: ActionType.SET_PIVOT_FIELDS,
                payload: fields,
            });
        }
        if (savedChart?.chartConfig) {
            dispatch({
                type: ActionType.SET_CHART_CONFIG,
                payload: {
                    chartConfig: savedChart.chartConfig,
                    cachedConfigs: {},
                },
            });
        }
    }, [savedChart?.pivotConfig, savedChart?.chartConfig]);

    // Keep Redux isEditMode in sync with prop changes
    useEffect(() => {
        reduxDispatch(explorerActions.setIsEditMode(isEditMode));
    }, [isEditMode, reduxDispatch]);

    // Keep Redux dimensions in sync with Context dimensions
    useEffect(() => {
        reduxDispatch(
            explorerActions.setDimensions(
                unsavedChartVersion.metricQuery.dimensions,
            ),
        );
    }, [unsavedChartVersion.metricQuery.dimensions, reduxDispatch]);

    // Keep Redux metrics in sync with Context metrics
    useEffect(() => {
        reduxDispatch(
            explorerActions.setMetrics(unsavedChartVersion.metricQuery.metrics),
        );
    }, [unsavedChartVersion.metricQuery.metrics, reduxDispatch]);

    // Keep Redux query limit in sync with Context limit
    useEffect(() => {
        reduxDispatch(
            explorerActions.setRowLimit(unsavedChartVersion.metricQuery.limit),
        );
    }, [unsavedChartVersion.metricQuery.limit, reduxDispatch]);

    // Keep Redux custom dimensions in sync with Context custom dimensions
    useEffect(() => {
        reduxDispatch(
            explorerActions.setCustomDimensions(
                unsavedChartVersion.metricQuery.customDimensions,
            ),
        );
    }, [unsavedChartVersion.metricQuery.customDimensions, reduxDispatch]);

    // Keep Redux additional metrics in sync with Context additional metrics
    useEffect(() => {
        reduxDispatch(
            explorerActions.setAdditionalMetrics(
                unsavedChartVersion.metricQuery.additionalMetrics,
            ),
        );
    }, [unsavedChartVersion.metricQuery.additionalMetrics, reduxDispatch]);

    // Keep Redux table calculations in sync with Context table calculations
    useEffect(() => {
        reduxDispatch(
            explorerActions.setTableCalculations(
                unsavedChartVersion.metricQuery.tableCalculations,
            ),
        );
    }, [unsavedChartVersion.metricQuery.tableCalculations, reduxDispatch]);

    // END TRANSITIONAL SYNC CODE

    const cachedChartConfig = useRef<Partial<ConfigCacheMap>>({});

    const resetCachedChartConfig = () => {
        cachedChartConfig.current = {};
    };

    const reset = useCallback(() => {
        resetCachedChartConfig();

        dispatch({
            type: ActionType.RESET,
            payload: initialState || defaultStateWithConfig,
        });
        // Reset Redux state as well
        reduxDispatch(
            explorerActions.reset(initialState || defaultStateWithConfig),
        );
    }, [defaultStateWithConfig, initialState, reduxDispatch]);

    const setTableName = useCallback(
        (tableName: string) => {
            dispatch({
                type: ActionType.SET_TABLE_NAME,
                payload: tableName,
            });
            // TODO: REDUX-MIGRATION - Remove Context dispatch once all components use Redux
            reduxDispatch(explorerActions.setTableName(tableName));
        },
        [dispatch, reduxDispatch],
    );

    const setRowLimit = useCallback((limit: number) => {
        dispatch({
            type: ActionType.SET_ROW_LIMIT,
            payload: limit,
        });
    }, []);

    const setTimeZone = useCallback((timezone: string | null) => {
        if (timezone && isTimeZone(timezone)) {
            dispatch({
                type: ActionType.SET_TIME_ZONE,
                payload: timezone,
            });
        }
    }, []);

    const setFilters = useCallback(
        (filters: MetricQuery['filters']) => {
            dispatch({
                type: ActionType.SET_FILTERS,
                payload: filters,
            });
            // TODO: Migration - currently double dispatch. Once all components use Redux directly, this context action can be removed
            reduxDispatch(explorerActions.setFilters(filters));
        },
        [reduxDispatch],
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
            // Dispatch directly to Redux (which auto-selects the metric)
            reduxDispatch(
                explorerActions.addAdditionalMetric(additionalMetric),
            );
        },
        [reduxDispatch],
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

    const toggleWriteBackModal = useCallback(
        (args?: { items?: CustomDimension[] | AdditionalMetric[] }) => {
            dispatch({
                type: ActionType.TOGGLE_WRITE_BACK_MODAL,
                payload: args,
            });
        },
        [],
    );

    const setColumnOrder = useCallback(
        (order: string[]) => {
            dispatch({
                type: ActionType.SET_COLUMN_ORDER,
                payload: order,
            });
            // Sync to Redux for components that have been migrated
            reduxDispatch(explorerActions.setColumnOrder(order));
        },
        [reduxDispatch],
    );

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
            });
            // Sync to Redux for components that have been migrated
            reduxDispatch(
                explorerActions.addTableCalculation(tableCalculation),
            );
        },
        [unsavedChartVersion, reduxDispatch],
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
            });
            // Sync to Redux for components that have been migrated
            reduxDispatch(
                explorerActions.updateTableCalculation({
                    oldName,
                    tableCalculation,
                }),
            );
        },
        [unsavedChartVersion, reduxDispatch],
    );
    const deleteTableCalculation = useCallback(
        (name: string) => {
            dispatch({
                type: ActionType.DELETE_TABLE_CALCULATION,
                payload: name,
            });
            // Sync to Redux for components that have been migrated
            reduxDispatch(explorerActions.deleteTableCalculation(name));
        },
        [reduxDispatch],
    );

    const addCustomDimension = useCallback(
        (customDimension: CustomDimension) => {
            dispatch({
                type: ActionType.ADD_CUSTOM_DIMENSION,
                payload: customDimension,
            });
            // Sync to Redux for components that have been migrated
            reduxDispatch(explorerActions.addCustomDimension(customDimension));
        },
        [reduxDispatch],
    );

    const editCustomDimension = useCallback(
        (
            customDimension: CustomDimension,
            previousCustomDimensionId: string,
        ) => {
            dispatch({
                type: ActionType.EDIT_CUSTOM_DIMENSION,
                payload: { customDimension, previousCustomDimensionId },
            });
            // Sync to Redux for components that have been migrated
            reduxDispatch(
                explorerActions.updateCustomDimension({
                    oldId: previousCustomDimensionId,
                    customDimension,
                }),
            );
        },
        [reduxDispatch],
    );

    const removeCustomDimension = useCallback(
        (key: FieldId) => {
            dispatch({
                type: ActionType.REMOVE_CUSTOM_DIMENSION,
                payload: key,
            });
            // Also dispatch to Redux to update dimensions/sorts/columnOrder
            reduxDispatch(explorerActions.removeCustomDimension(key));
        },
        [reduxDispatch],
    );

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

    const toggleFormatModal = useCallback((args?: { metric: Metric }) => {
        dispatch({
            type: ActionType.TOGGLE_FORMAT_MODAL,
            payload: args,
        });
    }, []);

    const updateMetricFormat = useCallback(
        (args: { metric: Metric; formatOptions: CustomFormat | undefined }) => {
            dispatch({
                type: ActionType.UPDATE_METRIC_FORMAT,
                payload: args,
            });
            reduxDispatch(explorerActions.updateMetricFormat(args));
        },
        [reduxDispatch],
    );

    const replaceFields = useCallback(
        (fieldsToReplace: ReplaceCustomFields[string]) => {
            dispatch({
                type: ActionType.REPLACE_FIELDS,
                payload: {
                    fieldsToReplace,
                },
            });
        },
        [],
    );

    const state = useMemo(
        () => ({
            // Don't use Redux state directly here to avoid re-renders
            ...reducerState,
            isEditMode,
            savedChart,
            mergedUnsavedChartVersion,
        }),
        [isEditMode, reducerState, savedChart, mergedUnsavedChartVersion],
    );

    const queryClient = useQueryClient();

    const clearExplore = useCallback(async () => {
        resetCachedChartConfig();
        // cancel query creation
        void queryClient.cancelQueries({
            queryKey: ['create-query'],
            exact: false,
        });
        dispatch({
            type: ActionType.RESET,
            payload: defaultStateWithConfig,
        });
        // Reset Redux store for filters and other migrated state
        reduxDispatch(explorerActions.reset(defaultStateWithConfig));
        // Reset query execution state in Redux
        reduxDispatch(explorerActions.resetQueryExecution());
    }, [queryClient, defaultStateWithConfig, reduxDispatch]);

    const navigate = useNavigate();
    // Read tableName from Redux to avoid recreating callback when Context changes
    const tableNameFromRedux = useExplorerSelector(selectTableName);
    const clearQuery = useCallback(async () => {
        const clearedState = {
            ...defaultStateWithConfig,
            unsavedChartVersion: {
                ...defaultStateWithConfig.unsavedChartVersion,
                tableName: tableNameFromRedux,
            },
        };
        dispatch({
            type: ActionType.RESET,
            payload: clearedState,
        });
        // Reset Redux store to match cleared Context state
        reduxDispatch(explorerActions.reset(clearedState));
        // clear state in url params
        void navigate(
            {
                search: '',
            },
            { replace: true },
        );
    }, [defaultStateWithConfig, navigate, tableNameFromRedux, reduxDispatch]);

    const openVisualizationConfig = useCallback(() => {
        reduxDispatch(explorerActions.openVisualizationConfig());
    }, [reduxDispatch]);

    const closeVisualizationConfig = useCallback(() => {
        reduxDispatch(explorerActions.closeVisualizationConfig());
    }, [reduxDispatch]);

    const setParameterReferences = useCallback(
        (parameterReferences: string[] | null) => {
            dispatch({
                type: ActionType.SET_PARAMETER_REFERENCES,
                payload: parameterReferences,
            });
            // Sync to Redux for components that have been migrated
            reduxDispatch(
                explorerActions.setParameterReferences(parameterReferences),
            );
        },
        [reduxDispatch],
    );

    const isUnsavedChartChanged = useCallback(
        (chartVersion: CreateSavedChartVersion) => {
            if (savedChart) {
                return !deepEqual(
                    removeEmptyProperties({
                        tableName: savedChart.tableName,
                        chartConfig: cleanConfig(savedChart.chartConfig),
                        metricQuery: savedChart.metricQuery,
                        tableConfig: savedChart.tableConfig,
                        pivotConfig: savedChart.pivotConfig,
                        parameters: savedChart.parameters,
                    }),
                    removeEmptyProperties({
                        tableName: chartVersion.tableName,
                        chartConfig: cleanConfig(chartVersion.chartConfig),
                        metricQuery: chartVersion.metricQuery,
                        tableConfig: chartVersion.tableConfig,
                        pivotConfig: chartVersion.pivotConfig,
                        parameters: chartVersion.parameters,
                    }),
                );
            }
            // If there's no saved chart, return true if the query is valid (allows saving new charts)
            return isValidQuery;
        },
        [savedChart, isValidQuery],
    );

    const actions = useMemo(
        () => ({
            clearExplore,
            clearQuery,
            reset,
            setTableName,
            setFilters,
            setRowLimit,
            setTimeZone,
            setColumnOrder,
            addAdditionalMetric,
            editAdditionalMetric,
            removeAdditionalMetric,
            toggleAdditionalMetricModal,
            toggleWriteBackModal,
            addTableCalculation,
            deleteTableCalculation,
            updateTableCalculation,
            setPivotFields,
            setChartType,
            setChartConfig,
            addCustomDimension,
            editCustomDimension,
            removeCustomDimension,
            toggleCustomDimensionModal,
            toggleFormatModal,
            updateMetricFormat,
            replaceFields,
            openVisualizationConfig,
            closeVisualizationConfig,
            setParameterReferences,
            isUnsavedChartChanged,
        }),
        [
            clearExplore,
            clearQuery,
            reset,
            setTableName,
            setRowLimit,
            setTimeZone,
            setFilters,
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
            addCustomDimension,
            editCustomDimension,
            removeCustomDimension,
            toggleCustomDimensionModal,
            toggleFormatModal,
            updateMetricFormat,
            toggleWriteBackModal,
            replaceFields,
            openVisualizationConfig,
            closeVisualizationConfig,
            setParameterReferences,
            isUnsavedChartChanged,
        ],
    );

    const value: ExplorerContextType = useMemo(
        () => ({
            state,
            actions,
        }),
        [actions, state],
    );
    return (
        <ExplorerContext.Provider value={value}>
            {children}
        </ExplorerContext.Provider>
    );
};

export default ExplorerProvider;
