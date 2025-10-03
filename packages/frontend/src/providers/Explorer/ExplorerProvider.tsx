import {
    assertUnreachable,
    ChartType,
    convertFieldRefToFieldId,
    deepEqual,
    getAvailableParametersFromTables,
    getFieldRef,
    getItemId,
    isTimeZone,
    lightdashVariablePattern,
    maybeReplaceFieldsInChartVersion,
    removeEmptyProperties,
    removeFieldFromFilterGroup,
    toggleArrayValue,
    updateFieldIdInFilters,
    type AdditionalMetric,
    type ChartConfig,
    type CustomDimension,
    type CustomFormat,
    type FieldId,
    type Metric,
    type MetricQuery,
    type ParameterDefinitions,
    type ParameterValue,
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
import { useNavigate, useParams } from 'react-router';
import {
    explorerActions,
    useExplorerDispatch,
    useExplorerInitialization,
} from '../../features/explorer/store';
import { useParameters } from '../../hooks/parameters/useParameters';
import { useExplore } from '../../hooks/useExplore';
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
        case ActionType.REMOVE_FIELD: {
            return produce(state, (draft) => {
                const fieldToRemove = action.payload;
                draft.unsavedChartVersion.metricQuery.dimensions =
                    draft.unsavedChartVersion.metricQuery.dimensions.filter(
                        (fieldId) => fieldId !== fieldToRemove,
                    );
                draft.unsavedChartVersion.metricQuery.metrics =
                    draft.unsavedChartVersion.metricQuery.metrics.filter(
                        (fieldId) => fieldId !== fieldToRemove,
                    );
                draft.unsavedChartVersion.metricQuery.sorts =
                    draft.unsavedChartVersion.metricQuery.sorts.filter(
                        (s) => s.fieldId !== fieldToRemove,
                    );
                draft.unsavedChartVersion.metricQuery.tableCalculations =
                    draft.unsavedChartVersion.metricQuery.tableCalculations.filter(
                        (tc) => tc.name !== fieldToRemove,
                    );
                draft.unsavedChartVersion.tableConfig.columnOrder =
                    draft.unsavedChartVersion.tableConfig.columnOrder.filter(
                        (fieldId) => fieldId !== fieldToRemove,
                    );
            });
        }
        case ActionType.TOGGLE_DIMENSION: {
            return produce(state, (draft) => {
                const current =
                    draft.unsavedChartVersion.metricQuery.dimensions;
                draft.unsavedChartVersion.metricQuery.dimensions =
                    toggleArrayValue(current, action.payload);
                draft.unsavedChartVersion.metricQuery.sorts =
                    draft.unsavedChartVersion.metricQuery.sorts.filter(
                        (s) => s.fieldId !== action.payload,
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
                        dimensionIds,
                    );
            });
        }

        case ActionType.TOGGLE_METRIC: {
            return produce(state, (draft) => {
                const currentMetrics =
                    draft.unsavedChartVersion.metricQuery.metrics;
                draft.unsavedChartVersion.metricQuery.metrics =
                    toggleArrayValue(currentMetrics, action.payload);

                draft.unsavedChartVersion.metricQuery.sorts =
                    draft.unsavedChartVersion.metricQuery.sorts.filter(
                        (s) => s.fieldId !== action.payload,
                    );

                draft.unsavedChartVersion.metricQuery.metricOverrides =
                    Object.fromEntries(
                        Object.entries(
                            draft.unsavedChartVersion.metricQuery
                                .metricOverrides || {},
                        ).filter(([key]) => key !== action.payload),
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
        case ActionType.SET_FILTERS: {
            return produce(state, (draft) => {
                draft.unsavedChartVersion.metricQuery.filters = action.payload;
            });
        }
        case ActionType.SET_PARAMETER: {
            return produce(state, (draft) => {
                if (!draft.unsavedChartVersion.parameters) {
                    draft.unsavedChartVersion.parameters = {};
                }
                if (action.payload.value === null) {
                    delete draft.unsavedChartVersion.parameters[
                        action.payload.key
                    ];
                } else {
                    draft.unsavedChartVersion.parameters = {
                        ...draft.unsavedChartVersion.parameters,
                        [action.payload.key]: action.payload.value,
                    };
                }
            });
        }
        case ActionType.CLEAR_ALL_PARAMETERS: {
            return produce(state, (draft) => {
                draft.unsavedChartVersion.parameters = {};
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

                const customDimensionId = getItemId(newCustomDimension);
                if (
                    !draft.unsavedChartVersion.metricQuery.dimensions.includes(
                        customDimensionId,
                    )
                ) {
                    draft.unsavedChartVersion.metricQuery.dimensions.push(
                        customDimensionId,
                    );
                }

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

        case ActionType.EDIT_CUSTOM_DIMENSION: {
            //The id of the custom dimension changes on edit if the name was updated, so we need to update the dimension array
            return produce(state, (draft) => {
                const { previousCustomDimensionId, customDimension } =
                    action.payload;
                const newCustomDimensionId = getItemId(customDimension);

                draft.unsavedChartVersion.metricQuery.dimensions =
                    draft.unsavedChartVersion.metricQuery.dimensions.filter(
                        (dimension) => dimension !== previousCustomDimensionId,
                    );
                if (
                    !draft.unsavedChartVersion.metricQuery.dimensions.includes(
                        newCustomDimensionId,
                    )
                ) {
                    draft.unsavedChartVersion.metricQuery.dimensions.push(
                        newCustomDimensionId,
                    );
                }

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
                draft.unsavedChartVersion.metricQuery.dimensions =
                    draft.unsavedChartVersion.metricQuery.dimensions.filter(
                        (dimension) => dimension !== dimensionIdToRemove,
                    );
                draft.unsavedChartVersion.metricQuery.sorts =
                    draft.unsavedChartVersion.metricQuery.sorts.filter(
                        (sort) => sort.fieldId !== dimensionIdToRemove,
                    );
                draft.unsavedChartVersion.tableConfig.columnOrder =
                    draft.unsavedChartVersion.tableConfig.columnOrder.filter(
                        (fieldId) => fieldId !== dimensionIdToRemove,
                    );
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
                draft.unsavedChartVersion.tableConfig.columnOrder =
                    calcColumnOrder(action.payload, [
                        ...draft.unsavedChartVersion.metricQuery.dimensions,
                        ...draft.unsavedChartVersion.metricQuery.metrics,
                        ...draft.unsavedChartVersion.metricQuery.tableCalculations.map(
                            ({ name }) => name,
                        ),
                    ]);
            });
        }
        case ActionType.ADD_TABLE_CALCULATION: {
            return produce(state, (draft) => {
                draft.unsavedChartVersion.metricQuery.tableCalculations.push(
                    action.payload,
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
    projectUuid: propProjectUuid,
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
    // Keep Redux isEditMode in sync with prop changes
    useEffect(() => {
        reduxDispatch(explorerActions.setIsEditMode(isEditMode));
    }, [isEditMode, reduxDispatch]);

    // Keep Redux table name in sync with Context state
    useEffect(() => {
        const contextTableName = reducerState.unsavedChartVersion.tableName;
        if (contextTableName) {
            reduxDispatch(explorerActions.setTableName(contextTableName));
        }
    }, [reducerState.unsavedChartVersion.tableName, reduxDispatch]);

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

    // Keep Redux columnOrder in sync with Context columnOrder
    useEffect(() => {
        reduxDispatch(
            explorerActions.setColumnOrder(
                unsavedChartVersion.tableConfig.columnOrder,
            ),
        );
    }, [unsavedChartVersion.tableConfig.columnOrder, reduxDispatch]);

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
            payload: initialState || defaultStateWithConfig,
        });
    }, [defaultStateWithConfig, initialState]);

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

    const setParameter = useCallback(
        (key: string, value: ParameterValue | null) => {
            if (value === null) {
                dispatch({
                    type: ActionType.SET_PARAMETER,
                    payload: { key, value: null },
                });
            } else {
                dispatch({
                    type: ActionType.SET_PARAMETER,
                    payload: { key, value },
                });
            }
            // TODO: REDUX-MIGRATION - Remove Context dispatch once all components use Redux
            reduxDispatch(explorerActions.setParameter({ key, value }));
        },
        [reduxDispatch],
    );

    const clearAllParameters = useCallback(() => {
        dispatch({ type: ActionType.CLEAR_ALL_PARAMETERS });
        // TODO: REDUX-MIGRATION - Remove Context dispatch once all components use Redux
        reduxDispatch(explorerActions.clearAllParameters());
    }, [reduxDispatch]);

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
                payload: getItemId(additionalMetric),
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

    const toggleWriteBackModal = useCallback(
        (args?: { items?: CustomDimension[] | AdditionalMetric[] }) => {
            dispatch({
                type: ActionType.TOGGLE_WRITE_BACK_MODAL,
                payload: args,
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
            // Sync to Redux for components that have been migrated
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
        },
        [],
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

    const hasUnsavedChanges = useMemo<boolean>(() => {
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
                    tableName: unsavedChartVersion.tableName,
                    chartConfig: cleanConfig(unsavedChartVersion.chartConfig),
                    metricQuery: unsavedChartVersion.metricQuery,
                    tableConfig: unsavedChartVersion.tableConfig,
                    pivotConfig: unsavedChartVersion.pivotConfig,
                    parameters: unsavedChartVersion.parameters,
                }),
            );
        }
        return isValidQuery;
    }, [unsavedChartVersion, isValidQuery, savedChart]);

    const { projectUuid: projectUuidFromParams } = useParams<{
        projectUuid: string;
    }>();
    const projectUuid = propProjectUuid || projectUuidFromParams;

    const { data: projectParameters } = useParameters(
        projectUuid,
        reducerState.parameterReferences ?? undefined,
        {
            enabled: !!reducerState.parameterReferences?.length,
        },
    );

    const { data: explore } = useExplore(unsavedChartVersion.tableName);

    const exploreParameterDefinitions = useMemo(() => {
        return explore
            ? getAvailableParametersFromTables(Object.values(explore.tables))
            : {};
    }, [explore]);

    const parameterDefinitions: ParameterDefinitions = useMemo(() => {
        return {
            ...(projectParameters ?? {}),
            ...(exploreParameterDefinitions ?? {}),
        };
    }, [projectParameters, exploreParameterDefinitions]);

    // TODO: REDUX-MIGRATION - Remove once parameterDefinitions are computed in Redux
    // Keep Redux parameter definitions in sync
    useEffect(() => {
        reduxDispatch(
            explorerActions.setParameterDefinitions(parameterDefinitions),
        );
    }, [parameterDefinitions, reduxDispatch]);

    const state = useMemo(
        () => ({
            // Don't use Redux state directly here to avoid re-renders
            ...reducerState,
            isEditMode,
            activeFields,
            isValidQuery,
            hasUnsavedChanges,
            savedChart,
            parameterDefinitions,
        }),
        [
            isEditMode,
            reducerState,
            activeFields,
            isValidQuery,
            hasUnsavedChanges,
            savedChart,
            parameterDefinitions,
        ],
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
    const clearQuery = useCallback(async () => {
        dispatch({
            type: ActionType.RESET,
            payload: {
                ...defaultStateWithConfig,
                unsavedChartVersion: {
                    ...defaultStateWithConfig.unsavedChartVersion,
                    tableName: unsavedChartVersion.tableName,
                },
            },
        });
        // Reset query execution state in Redux
        reduxDispatch(explorerActions.resetQueryExecution());
        // clear state in url params
        void navigate(
            {
                search: '',
            },
            { replace: true },
        );
    }, [
        defaultStateWithConfig,
        navigate,
        unsavedChartVersion.tableName,
        reduxDispatch,
    ]);

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
    const actions = useMemo(
        () => ({
            clearExplore,
            clearQuery,
            reset,
            setTableName,
            removeActiveField,
            toggleActiveField,
            setFilters,
            setParameter,
            clearAllParameters,
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
        }),
        [
            clearExplore,
            clearQuery,
            reset,
            setTableName,
            removeActiveField,
            toggleActiveField,
            setFilters,
            setParameter,
            clearAllParameters,
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
