import {
    assertUnreachable,
    ChartType,
    convertFieldRefToFieldId,
    deepEqual,
    getFieldRef,
    getItemId,
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
    type DateGranularity,
    type FieldId,
    type Metric,
    type MetricQuery,
    type ReplaceCustomFields,
    type SavedChart,
    type SortField,
    type TableCalculation,
    type TimeZone,
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
    useState,
    type FC,
} from 'react';
import { useNavigate, useParams } from 'react-router';
import useDefaultSortField from '../../hooks/useDefaultSortField';
import {
    executeQueryAndWaitForResults,
    useCancelQuery,
    useGetReadyQueryResults,
    useInfiniteQueryResults,
    type QueryResultsProps,
} from '../../hooks/useQueryResults';
import ExplorerContext from './context';
import { defaultState } from './defaultState';
import {
    ActionType,
    type Action,
    type ConfigCacheMap,
    type ExplorerContextType,
    type ExplorerReduceState,
    type ExplorerSection,
} from './types';
import { getValidChartConfig } from './utils';

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
            return produce(state, (draft) => {
                draft.unsavedChartVersion.tableName = action.payload;
                draft.unsavedChartVersion.metricQuery.exploreName =
                    action.payload;
            });
        }
        case ActionType.SET_FETCH_RESULTS_FALSE: {
            return produce(state, (draft) => {
                draft.shouldFetchResults = false;
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
        case ActionType.TOGGLE_SORT_FIELD: {
            return produce(state, (draft) => {
                const sortFieldId = action.payload;
                const activeFields = new Set([
                    ...draft.unsavedChartVersion.metricQuery.dimensions,
                    ...draft.unsavedChartVersion.metricQuery.metrics,
                    ...draft.unsavedChartVersion.metricQuery.tableCalculations.map(
                        (tc) => tc.name,
                    ),
                ]);
                if (!activeFields.has(sortFieldId)) {
                    return;
                }
                const sortField =
                    draft.unsavedChartVersion.metricQuery.sorts.find(
                        (sf) => sf.fieldId === sortFieldId,
                    );

                if (!sortField) {
                    draft.unsavedChartVersion.metricQuery.sorts.push({
                        fieldId: sortFieldId,
                        descending: false,
                    });
                } else if (sortField.descending) {
                    draft.unsavedChartVersion.metricQuery.sorts =
                        draft.unsavedChartVersion.metricQuery.sorts.filter(
                            (sf) => sf.fieldId !== sortFieldId,
                        );
                } else {
                    sortField.descending = true;
                }
            });
        }
        case ActionType.SET_SORT_FIELDS: {
            return produce(state, (draft) => {
                const activeFields = new Set([
                    ...draft.unsavedChartVersion.metricQuery.dimensions,
                    ...draft.unsavedChartVersion.metricQuery.metrics,
                    ...draft.unsavedChartVersion.metricQuery.tableCalculations.map(
                        (tc) => tc.name,
                    ),
                ]);
                draft.unsavedChartVersion.metricQuery.sorts =
                    action.payload.filter((sf) => activeFields.has(sf.fieldId));
            });
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
        viewModeQueryArgs?:
            | { chartUuid: string; context?: string }
            | { chartUuid: string; chartVersionUuid: string };
        dateZoomGranularity?: DateGranularity;
    }>
> = ({
    isEditMode = false,
    initialState,
    savedChart,
    defaultLimit,
    children,
    viewModeQueryArgs,
    dateZoomGranularity,
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
            options: {
                shouldFetchResults: true,
            },
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
            options: {
                shouldFetchResults: true,
            },
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
            previousCustomDimensionId: string,
        ) => {
            dispatch({
                type: ActionType.EDIT_CUSTOM_DIMENSION,
                payload: { customDimension, previousCustomDimensionId },
                options: {
                    shouldFetchResults: true,
                },
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
                options: {
                    shouldFetchResults: true,
                },
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

    const [validQueryArgs, setValidQueryArgs] =
        useState<QueryResultsProps | null>(null);
    const query = useGetReadyQueryResults(validQueryArgs);
    const [queryUuidHistory, setQueryUuidHistory] = useState<string[]>([]);
    useEffect(() => {
        if (query.data) {
            setQueryUuidHistory((prev) => [...prev, query.data.queryUuid]);
        }
    }, [query.data]);
    const queryResults = useInfiniteQueryResults(
        validQueryArgs?.projectUuid,
        // get last value from queryUuidHistory
        queryUuidHistory[queryUuidHistory.length - 1],
    );
    const getDownloadQueryUuid = useCallback(
        async (limit: number | null) => {
            let queryUuid = queryResults.queryUuid;
            // Always execute a new query if:
            // 1. limit is null (meaning "all results" - should ignore existing query limits)
            // 2. limit is different from current totalResults
            if (limit === null || limit !== queryResults.totalResults) {
                // Create query args with the specified limit
                const queryArgsWithLimit = validQueryArgs
                    ? {
                          ...validQueryArgs,
                          csvLimit: limit,
                      }
                    : null;
                const downloadQuery = await executeQueryAndWaitForResults(
                    queryArgsWithLimit,
                );
                queryUuid = downloadQuery.queryUuid;
            }
            if (!queryUuid) {
                throw new Error(`Missing query uuid`);
            }
            return queryUuid;
        },
        [queryResults.queryUuid, queryResults.totalResults, validQueryArgs],
    );
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { remove: clearQueryResults } = query;
    const resetQueryResults = useCallback(() => {
        setValidQueryArgs(null);
        clearQueryResults();
    }, [clearQueryResults]);

    // Prepares and executes query if all required parameters exist
    const runQuery = useCallback(() => {
        const fields = new Set([
            ...unsavedChartVersion.metricQuery.dimensions,
            ...unsavedChartVersion.metricQuery.metrics,
            ...unsavedChartVersion.metricQuery.tableCalculations.map(
                ({ name }) => name,
            ),
        ]);
        const hasFields = fields.size > 0;
        if (!!unsavedChartVersion.tableName && hasFields && projectUuid) {
            setValidQueryArgs({
                projectUuid,
                tableId: unsavedChartVersion.tableName,
                query: unsavedChartVersion.metricQuery,
                ...(isEditMode ? {} : viewModeQueryArgs),
                dateZoomGranularity,
            });
            dispatch({
                type: ActionType.SET_PREVIOUSLY_FETCHED_STATE,
                payload: cloneDeep(unsavedChartVersion.metricQuery),
            });
        } else {
            console.warn(
                `Can't make SQL request, invalid state`,
                unsavedChartVersion.tableName,
                hasFields,
                unsavedChartVersion.metricQuery,
            );
        }
    }, [
        unsavedChartVersion.metricQuery,
        unsavedChartVersion.tableName,
        projectUuid,
        isEditMode,
        viewModeQueryArgs,
        dateZoomGranularity,
    ]);

    useEffect(() => {
        if (!state.shouldFetchResults) return;
        runQuery();
        dispatch({ type: ActionType.SET_FETCH_RESULTS_FALSE });
    }, [runQuery, state.shouldFetchResults]);

    const queryClient = useQueryClient();
    const clearExplore = useCallback(async () => {
        resetCachedChartConfig();
        // cancel query creation
        void queryClient.cancelQueries({
            queryKey: ['create-query'],
            exact: false,
        });
        // reset query history
        setQueryUuidHistory([]);
        dispatch({
            type: ActionType.RESET,
            payload: defaultStateWithConfig,
        });
        resetQueryResults();
    }, [queryClient, resetQueryResults, defaultStateWithConfig]);

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
        resetQueryResults();
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
        resetQueryResults,
        unsavedChartVersion.tableName,
    ]);

    const defaultSort = useDefaultSortField(unsavedChartVersion);

    const fetchResults = useCallback(() => {
        if (unsavedChartVersion.metricQuery.sorts.length <= 0 && defaultSort) {
            setSortFields([defaultSort]);
        } else {
            // force new results even when query is the same
            clearQueryResults();
            runQuery();
        }
    }, [
        unsavedChartVersion.metricQuery.sorts.length,
        defaultSort,
        setSortFields,
        clearQueryResults,
        runQuery,
    ]);

    const { mutate: cancelQueryMutation } = useCancelQuery(
        projectUuid,
        query.data?.queryUuid,
    );

    const cancelQuery = useCallback(() => {
        // cancel query creation
        void queryClient.cancelQueries({
            queryKey: ['create-query', validQueryArgs],
        });

        if (query.data?.queryUuid) {
            // remove current queryUuid from setQueryUuidHistory
            setQueryUuidHistory((prev) => {
                return prev.filter(
                    (queryUuid) => queryUuid !== query.data.queryUuid,
                );
            });
            // mark query as cancelled
            cancelQueryMutation();
        }
    }, [queryClient, validQueryArgs, query.data, cancelQueryMutation]);

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
            toggleWriteBackModal,
            addTableCalculation,
            deleteTableCalculation,
            updateTableCalculation,
            setPivotFields,
            setChartType,
            setChartConfig,
            fetchResults,
            cancelQuery,
            toggleExpandedSection,
            addCustomDimension,
            editCustomDimension,
            removeCustomDimension,
            toggleCustomDimensionModal,
            toggleFormatModal,
            updateMetricFormat,
            replaceFields,
            getDownloadQueryUuid,
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
            cancelQuery,
            toggleExpandedSection,
            addCustomDimension,
            editCustomDimension,
            removeCustomDimension,
            toggleCustomDimensionModal,
            toggleFormatModal,
            updateMetricFormat,
            toggleWriteBackModal,
            replaceFields,
            getDownloadQueryUuid,
        ],
    );

    const value: ExplorerContextType = useMemo(
        () => ({
            state,
            query,
            queryResults,
            actions,
        }),
        [actions, query, queryResults, state],
    );
    return (
        <ExplorerContext.Provider value={value}>
            {children}
        </ExplorerContext.Provider>
    );
};

export default ExplorerProvider;
