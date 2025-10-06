import {
    getItemId,
    toggleArrayValue,
    type AdditionalMetric,
    type ChartConfig,
    type CustomDimension,
    type FieldId,
    type MetricQuery,
    type ParameterValue,
    type SortField,
    type TableCalculation,
} from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type ReactNode } from 'react';
import { type QueryResultsProps } from '../../../hooks/useQueryResults';
import { defaultState } from '../../../providers/Explorer/defaultState';
import {
    type ExplorerReduceState,
    type ExplorerSection,
} from '../../../providers/Explorer/types';

// Use the existing ExplorerReduceState type from the current implementation
export type ExplorerSliceState = ExplorerReduceState;

const initialState: ExplorerSliceState = defaultState;

// Helper function for calculating column order when toggling fields
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

const explorerSlice = createSlice({
    name: 'explorer',
    initialState,
    reducers: {
        // Core state management
        reset: (state, action: PayloadAction<ExplorerSliceState>) => {
            return action.payload;
        },
        setTableName: (state, action: PayloadAction<string>) => {
            state.unsavedChartVersion.tableName = action.payload;
            state.unsavedChartVersion.metricQuery.exploreName = action.payload;
        },
        setIsEditMode: (state, action: PayloadAction<boolean>) => {
            state.isEditMode = action.payload;
        },
        setPreviouslyFetchedState: (
            state,
            action: PayloadAction<MetricQuery>,
        ) => {
            state.previouslyFetchedState = action.payload;
        },

        // UI state
        toggleExpandedSection: (
            state,
            action: PayloadAction<ExplorerSection>,
        ) => {
            const index = state.expandedSections.indexOf(action.payload);
            if (index > -1) {
                state.expandedSections.splice(index, 1);
            } else {
                state.expandedSections.push(action.payload);
            }
        },

        // Filters
        setFilters: (state, action: PayloadAction<MetricQuery['filters']>) => {
            state.unsavedChartVersion.metricQuery.filters = action.payload;
        },

        // Sorting actions
        setSortFields: (state, action: PayloadAction<SortField[]>) => {
            state.unsavedChartVersion.metricQuery.sorts = action.payload;
        },

        // Dimensions and Metrics
        setDimensions: (state, action: PayloadAction<string[]>) => {
            state.unsavedChartVersion.metricQuery.dimensions = action.payload;
        },
        setMetrics: (state, action: PayloadAction<string[]>) => {
            state.unsavedChartVersion.metricQuery.metrics = action.payload;
        },

        // Toggle dimension - adds/removes and updates related state
        toggleDimension: (state, action: PayloadAction<FieldId>) => {
            const fieldId = action.payload;
            const currentDimensions =
                state.unsavedChartVersion.metricQuery.dimensions;

            // Toggle the dimension in the array
            state.unsavedChartVersion.metricQuery.dimensions = toggleArrayValue(
                currentDimensions,
                fieldId,
            );

            // Remove any sort for this field
            state.unsavedChartVersion.metricQuery.sorts =
                state.unsavedChartVersion.metricQuery.sorts.filter(
                    (s) => s.fieldId !== fieldId,
                );

            // Recalculate column order
            const dimensionIds =
                state.unsavedChartVersion.metricQuery.dimensions;
            const metricIds = state.unsavedChartVersion.metricQuery.metrics;
            const calcIds =
                state.unsavedChartVersion.metricQuery.tableCalculations.map(
                    ({ name }) => name,
                );

            state.unsavedChartVersion.tableConfig.columnOrder = calcColumnOrder(
                state.unsavedChartVersion.tableConfig.columnOrder,
                [...dimensionIds, ...metricIds, ...calcIds],
                dimensionIds,
            );
        },

        // Toggle metric - adds/removes and updates related state
        toggleMetric: (state, action: PayloadAction<FieldId>) => {
            const fieldId = action.payload;
            const currentMetrics =
                state.unsavedChartVersion.metricQuery.metrics;

            // Toggle the metric in the array
            state.unsavedChartVersion.metricQuery.metrics = toggleArrayValue(
                currentMetrics,
                fieldId,
            );

            // Remove any sort for this field
            state.unsavedChartVersion.metricQuery.sorts =
                state.unsavedChartVersion.metricQuery.sorts.filter(
                    (s) => s.fieldId !== fieldId,
                );

            // Filter metricOverrides to only include active metrics
            state.unsavedChartVersion.metricQuery.metricOverrides =
                Object.fromEntries(
                    Object.entries(
                        state.unsavedChartVersion.metricQuery.metricOverrides ||
                            {},
                    ).filter(([key]) =>
                        state.unsavedChartVersion.metricQuery.metrics.includes(
                            key,
                        ),
                    ),
                );

            // Recalculate column order
            const dimensionIds =
                state.unsavedChartVersion.metricQuery.dimensions;
            const metricIds = state.unsavedChartVersion.metricQuery.metrics;
            const calcIds =
                state.unsavedChartVersion.metricQuery.tableCalculations.map(
                    ({ name }) => name,
                );

            state.unsavedChartVersion.tableConfig.columnOrder = calcColumnOrder(
                state.unsavedChartVersion.tableConfig.columnOrder,
                [...dimensionIds, ...metricIds, ...calcIds],
            );
        },

        // Remove field - removes from all relevant arrays
        removeField: (state, action: PayloadAction<FieldId>) => {
            const fieldToRemove = action.payload;

            // Remove from dimensions
            state.unsavedChartVersion.metricQuery.dimensions =
                state.unsavedChartVersion.metricQuery.dimensions.filter(
                    (fieldId) => fieldId !== fieldToRemove,
                );

            // Remove from metrics
            state.unsavedChartVersion.metricQuery.metrics =
                state.unsavedChartVersion.metricQuery.metrics.filter(
                    (fieldId) => fieldId !== fieldToRemove,
                );

            // Remove from sorts
            state.unsavedChartVersion.metricQuery.sorts =
                state.unsavedChartVersion.metricQuery.sorts.filter(
                    (s) => s.fieldId !== fieldToRemove,
                );

            // Remove from tableCalculations
            state.unsavedChartVersion.metricQuery.tableCalculations =
                state.unsavedChartVersion.metricQuery.tableCalculations.filter(
                    (tc) => tc.name !== fieldToRemove,
                );

            // Remove from columnOrder
            state.unsavedChartVersion.tableConfig.columnOrder =
                state.unsavedChartVersion.tableConfig.columnOrder.filter(
                    (fieldId) => fieldId !== fieldToRemove,
                );
        },

        setRowLimit: (state, action: PayloadAction<number>) => {
            state.unsavedChartVersion.metricQuery.limit = action.payload;
        },

        // Column order
        setColumnOrder: (state, action: PayloadAction<string[]>) => {
            // When user explicitly sets column order (e.g., drag-and-drop), respect it exactly
            // Don't run through calcColumnOrder as that might reorder things
            state.unsavedChartVersion.tableConfig.columnOrder = action.payload;
        },

        // Parameters
        setParameter: (
            state,
            action: PayloadAction<{
                key: string;
                value: ParameterValue | null;
            }>,
        ) => {
            const { key, value } = action.payload;
            if (!state.unsavedChartVersion.parameters) {
                state.unsavedChartVersion.parameters = {};
            }
            if (value === null || value === undefined) {
                delete state.unsavedChartVersion.parameters[key];
            } else {
                state.unsavedChartVersion.parameters[key] = value;
            }
        },

        clearAllParameters: (state) => {
            state.unsavedChartVersion.parameters = {};
        },

        setParameterReferences: (
            state,
            action: PayloadAction<string[] | null>,
        ) => {
            state.parameterReferences = action.payload;
        },

        setParameterDefinitions: (
            state,
            action: PayloadAction<ExplorerReduceState['parameterDefinitions']>,
        ) => {
            state.parameterDefinitions = action.payload;
        },

        // Visualization config
        openVisualizationConfig: (state) => {
            state.isVisualizationConfigOpen = true;
        },
        closeVisualizationConfig: (state) => {
            state.isVisualizationConfigOpen = false;
        },

        // Modal actions
        toggleCustomDimensionModal: (
            state,
            action: PayloadAction<
                | {
                      isEditing: boolean;
                      table?: string;
                      item?: any;
                  }
                | undefined
            >,
        ) => {
            state.modals.customDimension = {
                isOpen: !state.modals.customDimension.isOpen,
                ...(action.payload && { ...action.payload }),
            };
        },
        toggleAdditionalMetricModal: (
            state,
            action: PayloadAction<
                | {
                      type?: any;
                      item?: any;
                      isEditing: boolean;
                  }
                | undefined
            >,
        ) => {
            state.modals.additionalMetric = {
                isOpen: !state.modals.additionalMetric.isOpen,
                ...(action.payload && { ...action.payload }),
            };
        },
        toggleWriteBackModal: (
            state,
            action: PayloadAction<{ items?: any[] } | undefined>,
        ) => {
            state.modals.writeBack = {
                isOpen: !state.modals.writeBack.isOpen,
                ...(action.payload && { ...action.payload }),
            };
        },
        toggleFormatModal: (
            state,
            action: PayloadAction<{ metric?: any } | undefined>,
        ) => {
            state.modals.format = {
                isOpen: !state.modals.format.isOpen,
                ...(action.payload && { ...action.payload }),
            };
        },
        openItemDetail: (
            state,
            action: PayloadAction<{ header: ReactNode; detail: ReactNode }>,
        ) => {
            state.modals.itemDetail = {
                isOpen: true,
                header: action.payload.header,
                detail: action.payload.detail,
            };
        },
        closeItemDetail: (state) => {
            state.modals.itemDetail = {
                isOpen: false,
                header: undefined,
                detail: undefined,
            };
        },

        // Chart config
        setChartConfig: (state, action: PayloadAction<ChartConfig>) => {
            state.unsavedChartVersion.chartConfig = action.payload;
        },

        // Table calculations
        addTableCalculation: (
            state,
            action: PayloadAction<TableCalculation>,
        ) => {
            state.unsavedChartVersion.metricQuery.tableCalculations.push(
                action.payload,
            );
        },
        updateTableCalculation: (
            state,
            action: PayloadAction<{
                oldName: string;
                tableCalculation: TableCalculation;
            }>,
        ) => {
            const { oldName, tableCalculation } = action.payload;
            const index =
                state.unsavedChartVersion.metricQuery.tableCalculations.findIndex(
                    (tc) => tc.name === oldName,
                );
            if (index > -1) {
                state.unsavedChartVersion.metricQuery.tableCalculations[index] =
                    tableCalculation;
            }
        },
        deleteTableCalculation: (state, action: PayloadAction<string>) => {
            const nameToRemove = action.payload;
            state.unsavedChartVersion.metricQuery.tableCalculations =
                state.unsavedChartVersion.metricQuery.tableCalculations.filter(
                    (tc) => tc.name !== nameToRemove,
                );
        },
        setTableCalculations: (
            state,
            action: PayloadAction<TableCalculation[]>,
        ) => {
            state.unsavedChartVersion.metricQuery.tableCalculations =
                action.payload;
        },

        // Custom dimensions
        addCustomDimension: (state, action: PayloadAction<CustomDimension>) => {
            const newCustomDimension = action.payload;

            if (!state.unsavedChartVersion.metricQuery.customDimensions) {
                state.unsavedChartVersion.metricQuery.customDimensions = [];
            }
            state.unsavedChartVersion.metricQuery.customDimensions.push(
                newCustomDimension,
            );

            // Automatically select the custom dimension (add to dimensions array)
            const customDimensionId = getItemId(newCustomDimension);
            if (
                !state.unsavedChartVersion.metricQuery.dimensions.includes(
                    customDimensionId,
                )
            ) {
                state.unsavedChartVersion.metricQuery.dimensions.push(
                    customDimensionId,
                );
            }

            // Recalculate column order
            const dimensionIds =
                state.unsavedChartVersion.metricQuery.dimensions;
            const metricIds = state.unsavedChartVersion.metricQuery.metrics;
            const calcIds =
                state.unsavedChartVersion.metricQuery.tableCalculations.map(
                    ({ name }) => name,
                );

            state.unsavedChartVersion.tableConfig.columnOrder = calcColumnOrder(
                state.unsavedChartVersion.tableConfig.columnOrder,
                [...dimensionIds, ...metricIds, ...calcIds],
                dimensionIds,
            );
        },
        updateCustomDimension: (
            state,
            action: PayloadAction<{
                oldId: string;
                customDimension: CustomDimension;
            }>,
        ) => {
            const { oldId, customDimension } = action.payload;
            if (!state.unsavedChartVersion.metricQuery.customDimensions) {
                state.unsavedChartVersion.metricQuery.customDimensions = [];
                return;
            }

            // Update the custom dimension in the array
            const index =
                state.unsavedChartVersion.metricQuery.customDimensions.findIndex(
                    (cd) => cd.id === oldId,
                );
            if (index > -1) {
                state.unsavedChartVersion.metricQuery.customDimensions[index] =
                    customDimension;
            }

            // The ID might have changed (if name changed), so update dimensions array
            const newId = getItemId(customDimension);
            if (oldId !== newId) {
                state.unsavedChartVersion.metricQuery.dimensions =
                    state.unsavedChartVersion.metricQuery.dimensions.map(
                        (dim) => (dim === oldId ? newId : dim),
                    );

                // Update sorts if the field was sorted
                state.unsavedChartVersion.metricQuery.sorts =
                    state.unsavedChartVersion.metricQuery.sorts.map((sort) =>
                        sort.fieldId === oldId
                            ? { ...sort, fieldId: newId }
                            : sort,
                    );

                // Update column order
                state.unsavedChartVersion.tableConfig.columnOrder =
                    state.unsavedChartVersion.tableConfig.columnOrder.map(
                        (col) => (col === oldId ? newId : col),
                    );
            }
        },
        removeCustomDimension: (state, action: PayloadAction<string>) => {
            const idToRemove = action.payload;
            if (!state.unsavedChartVersion.metricQuery.customDimensions) {
                return;
            }
            state.unsavedChartVersion.metricQuery.customDimensions =
                state.unsavedChartVersion.metricQuery.customDimensions.filter(
                    (cd) => cd.id !== idToRemove,
                );
        },
        setCustomDimensions: (
            state,
            action: PayloadAction<CustomDimension[] | undefined>,
        ) => {
            state.unsavedChartVersion.metricQuery.customDimensions =
                action.payload;
        },

        // Additional metrics
        setAdditionalMetrics: (
            state,
            action: PayloadAction<AdditionalMetric[] | undefined>,
        ) => {
            state.unsavedChartVersion.metricQuery.additionalMetrics =
                action.payload;
        },
        addAdditionalMetric: (
            state,
            action: PayloadAction<AdditionalMetric>,
        ) => {
            const newMetric = action.payload;
            const isMetricAlreadyInList = (
                state.unsavedChartVersion.metricQuery.additionalMetrics || []
            ).find((metric) => getItemId(metric) === getItemId(newMetric));

            if (!isMetricAlreadyInList) {
                state.unsavedChartVersion.metricQuery.additionalMetrics = [
                    ...(state.unsavedChartVersion.metricQuery
                        .additionalMetrics || []),
                    newMetric,
                ];
            }

            // Automatically select the metric (add to metrics array)
            const metricId = getItemId(newMetric);
            if (
                !state.unsavedChartVersion.metricQuery.metrics.includes(
                    metricId,
                )
            ) {
                state.unsavedChartVersion.metricQuery.metrics.push(metricId);
            }

            // Recalculate column order
            const dimensionIds =
                state.unsavedChartVersion.metricQuery.dimensions;
            const metricIds = state.unsavedChartVersion.metricQuery.metrics;
            const calcIds =
                state.unsavedChartVersion.metricQuery.tableCalculations.map(
                    ({ name }) => name,
                );

            state.unsavedChartVersion.tableConfig.columnOrder = calcColumnOrder(
                state.unsavedChartVersion.tableConfig.columnOrder,
                [...dimensionIds, ...metricIds, ...calcIds],
            );
        },
        updateAdditionalMetric: (
            state,
            action: PayloadAction<{
                oldId: string;
                additionalMetric: AdditionalMetric;
            }>,
        ) => {
            const { oldId, additionalMetric } = action.payload;
            const newId = getItemId(additionalMetric);

            // Update the additional metric in the array
            state.unsavedChartVersion.metricQuery.additionalMetrics = (
                state.unsavedChartVersion.metricQuery.additionalMetrics || []
            ).map((metric) =>
                getItemId(metric) === oldId ? additionalMetric : metric,
            );

            // The ID might have changed (if name changed), so update metrics array
            if (oldId !== newId) {
                state.unsavedChartVersion.metricQuery.metrics =
                    state.unsavedChartVersion.metricQuery.metrics.map(
                        (metric) => (metric === oldId ? newId : metric),
                    );

                // Update sorts if the field was sorted
                state.unsavedChartVersion.metricQuery.sorts =
                    state.unsavedChartVersion.metricQuery.sorts.map((sort) =>
                        sort.fieldId === oldId
                            ? { ...sort, fieldId: newId }
                            : sort,
                    );

                // Update column order
                state.unsavedChartVersion.tableConfig.columnOrder =
                    state.unsavedChartVersion.tableConfig.columnOrder.map(
                        (col) => (col === oldId ? newId : col),
                    );
            }
        },
        removeAdditionalMetric: (state, action: PayloadAction<string>) => {
            const metricIdToRemove = action.payload;

            // Remove from additionalMetrics array
            state.unsavedChartVersion.metricQuery.additionalMetrics = (
                state.unsavedChartVersion.metricQuery.additionalMetrics || []
            ).filter((metric) => getItemId(metric) !== metricIdToRemove);

            // Remove from metrics array
            state.unsavedChartVersion.metricQuery.metrics =
                state.unsavedChartVersion.metricQuery.metrics.filter(
                    (metric) => metric !== metricIdToRemove,
                );

            // Remove from sorts
            state.unsavedChartVersion.metricQuery.sorts =
                state.unsavedChartVersion.metricQuery.sorts.filter(
                    (sort) => sort.fieldId !== metricIdToRemove,
                );

            // Remove from columnOrder
            state.unsavedChartVersion.tableConfig.columnOrder =
                state.unsavedChartVersion.tableConfig.columnOrder.filter(
                    (fieldId) => fieldId !== metricIdToRemove,
                );
        },

        // Query execution state management
        setValidQueryArgs: (
            state,
            action: PayloadAction<QueryResultsProps | null>,
        ) => {
            state.queryExecution.validQueryArgs = action.payload;
        },
        setUnpivotedQueryArgs: (
            state,
            action: PayloadAction<QueryResultsProps | null>,
        ) => {
            state.queryExecution.unpivotedQueryArgs = action.payload;
        },
        setQueryUuidHistory: (state, action: PayloadAction<string[]>) => {
            state.queryExecution.queryUuidHistory = action.payload;
        },
        addQueryUuid: (state, action: PayloadAction<string>) => {
            state.queryExecution.queryUuidHistory.push(action.payload);
        },
        setUnpivotedQueryUuidHistory: (
            state,
            action: PayloadAction<string[]>,
        ) => {
            state.queryExecution.unpivotedQueryUuidHistory = action.payload;
        },
        addUnpivotedQueryUuid: (state, action: PayloadAction<string>) => {
            state.queryExecution.unpivotedQueryUuidHistory.push(action.payload);
        },
        resetQueryExecution: (state) => {
            state.queryExecution = {
                validQueryArgs: null,
                unpivotedQueryArgs: null,
                queryUuidHistory: [],
                unpivotedQueryUuidHistory: [],
            };
        },
    },
});

export const explorerActions = explorerSlice.actions;
export const explorerReducer = explorerSlice.reducer;
