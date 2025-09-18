import {
    type AdditionalMetric,
    type ChartConfig,
    type ChartType,
    type CustomDimension,
    type CustomFormat,
    type FieldId,
    type Metric,
    type MetricQuery,
    type ParameterValue,
    type SortField,
    type TableCalculation,
    type TimeZone,
} from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { defaultState } from '../../../providers/Explorer/defaultState';
import {
    type ExplorerReduceState,
    type ExplorerSection,
} from '../../../providers/Explorer/types';

// Use the existing ExplorerReduceState type from the current implementation
export type ExplorerSliceState = ExplorerReduceState;

const initialState: ExplorerSliceState = defaultState;

export const explorerSlice = createSlice({
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

        // Field management
        removeField: (state, action: PayloadAction<FieldId>) => {
            const fieldToRemove = action.payload;
            state.unsavedChartVersion.metricQuery.dimensions =
                state.unsavedChartVersion.metricQuery.dimensions.filter(
                    (fieldId) => fieldId !== fieldToRemove,
                );
            state.unsavedChartVersion.metricQuery.metrics =
                state.unsavedChartVersion.metricQuery.metrics.filter(
                    (fieldId) => fieldId !== fieldToRemove,
                );
            state.unsavedChartVersion.metricQuery.sorts =
                state.unsavedChartVersion.metricQuery.sorts.filter(
                    (s) => s.fieldId !== fieldToRemove,
                );
            state.unsavedChartVersion.metricQuery.tableCalculations =
                state.unsavedChartVersion.metricQuery.tableCalculations.filter(
                    (tc) => tc.name !== fieldToRemove,
                );
            state.unsavedChartVersion.tableConfig.columnOrder =
                state.unsavedChartVersion.tableConfig.columnOrder.filter(
                    (fieldId) => fieldId !== fieldToRemove,
                );
        },

        toggleDimension: (state, action: PayloadAction<FieldId>) => {
            const fieldId = action.payload;
            const dimensions = state.unsavedChartVersion.metricQuery.dimensions;
            const index = dimensions.indexOf(fieldId);

            if (index > -1) {
                dimensions.splice(index, 1);
            } else {
                dimensions.push(fieldId);
            }

            // Remove from sorts if dimension was removed
            if (index > -1) {
                state.unsavedChartVersion.metricQuery.sorts =
                    state.unsavedChartVersion.metricQuery.sorts.filter(
                        (s) => s.fieldId !== fieldId,
                    );
            }

            // Update column order
            const dimensionIds =
                state.unsavedChartVersion.metricQuery.dimensions;
            const metricIds = state.unsavedChartVersion.metricQuery.metrics;
            const calcIds =
                state.unsavedChartVersion.metricQuery.tableCalculations.map(
                    ({ name }) => name,
                );
            const allFieldIds = [...dimensionIds, ...metricIds, ...calcIds];

            // Helper function to calculate column order
            const cleanColumnOrder =
                state.unsavedChartVersion.tableConfig.columnOrder.filter(
                    (column) => allFieldIds.includes(column),
                );
            const missingColumns = allFieldIds.filter(
                (id) => !cleanColumnOrder.includes(id),
            );
            const positionDimensionColumn = Math.max(
                ...dimensionIds.map((d) => cleanColumnOrder.indexOf(d)),
            );
            cleanColumnOrder.splice(
                positionDimensionColumn + 1,
                0,
                ...missingColumns,
            );
            state.unsavedChartVersion.tableConfig.columnOrder =
                cleanColumnOrder;
        },

        toggleMetric: (state, action: PayloadAction<FieldId>) => {
            const fieldId = action.payload;
            const metrics = state.unsavedChartVersion.metricQuery.metrics;
            const index = metrics.indexOf(fieldId);

            if (index > -1) {
                metrics.splice(index, 1);
            } else {
                metrics.push(fieldId);
            }

            // Remove from sorts if metric was removed
            if (index > -1) {
                state.unsavedChartVersion.metricQuery.sorts =
                    state.unsavedChartVersion.metricQuery.sorts.filter(
                        (s) => s.fieldId !== fieldId,
                    );
            }

            // Update column order
            const dimensionIds =
                state.unsavedChartVersion.metricQuery.dimensions;
            const metricIds = state.unsavedChartVersion.metricQuery.metrics;
            const calcIds =
                state.unsavedChartVersion.metricQuery.tableCalculations.map(
                    ({ name }) => name,
                );
            const allFieldIds = [...dimensionIds, ...metricIds, ...calcIds];

            const cleanColumnOrder =
                state.unsavedChartVersion.tableConfig.columnOrder.filter(
                    (column) => allFieldIds.includes(column),
                );
            const missingColumns = allFieldIds.filter(
                (id) => !cleanColumnOrder.includes(id),
            );
            state.unsavedChartVersion.tableConfig.columnOrder = [
                ...cleanColumnOrder,
                ...missingColumns,
            ];
        },

        // Sorting
        toggleSortField: (state, action: PayloadAction<FieldId>) => {
            const fieldId = action.payload;
            const sorts = state.unsavedChartVersion.metricQuery.sorts;
            const sortIndex = sorts.findIndex((s) => s.fieldId === fieldId);

            if (sortIndex > -1) {
                sorts.splice(sortIndex, 1);
            } else {
                sorts.push({
                    fieldId,
                    descending: false,
                });
            }
        },

        setSortFields: (state, action: PayloadAction<SortField[]>) => {
            state.unsavedChartVersion.metricQuery.sorts = action.payload;
        },

        addSortField: (state, action: PayloadAction<SortField>) => {
            state.unsavedChartVersion.metricQuery.sorts.push(action.payload);
        },

        removeSortField: (state, action: PayloadAction<FieldId>) => {
            state.unsavedChartVersion.metricQuery.sorts =
                state.unsavedChartVersion.metricQuery.sorts.filter(
                    (s) => s.fieldId !== action.payload,
                );
        },

        moveSortFields: (
            state,
            action: PayloadAction<{
                sourceIndex: number;
                destinationIndex: number;
            }>,
        ) => {
            const { sourceIndex, destinationIndex } = action.payload;
            const sorts = state.unsavedChartVersion.metricQuery.sorts;
            const [removed] = sorts.splice(sourceIndex, 1);
            sorts.splice(destinationIndex, 0, removed);
        },

        setSortFieldNullsFirst: (
            state,
            action: PayloadAction<{
                fieldId: FieldId;
                nullsFirst: boolean | undefined;
            }>,
        ) => {
            const { fieldId, nullsFirst } = action.payload;
            const sort = state.unsavedChartVersion.metricQuery.sorts.find(
                (s) => s.fieldId === fieldId,
            );
            if (sort) {
                sort.nullsFirst = nullsFirst;
            }
        },

        // Query configuration
        setRowLimit: (state, action: PayloadAction<number>) => {
            state.unsavedChartVersion.metricQuery.limit = action.payload;
        },

        setTimezone: (state, action: PayloadAction<TimeZone>) => {
            state.unsavedChartVersion.metricQuery.timezone = action.payload;
        },

        setFilters: (state, action: PayloadAction<MetricQuery['filters']>) => {
            state.unsavedChartVersion.metricQuery.filters = action.payload;
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

        // Pivot configuration
        setPivotFields: (state, action: PayloadAction<FieldId[]>) => {
            const pivotDimensions = action.payload;
            if (pivotDimensions.length === 0) {
                state.unsavedChartVersion.pivotConfig = undefined;
            } else {
                state.unsavedChartVersion.pivotConfig = {
                    columns: pivotDimensions,
                };
            }
        },

        // Chart configuration
        setChartType: (state, action: PayloadAction<ChartType>) => {
            state.unsavedChartVersion.chartConfig.type = action.payload;
            // Note: Chart config cache logic will be handled separately
        },

        setChartConfig: (state, action: PayloadAction<ChartConfig>) => {
            state.unsavedChartVersion.chartConfig = action.payload;
        },

        // Table configuration
        setColumnOrder: (state, action: PayloadAction<string[]>) => {
            state.unsavedChartVersion.tableConfig.columnOrder = action.payload;
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
            if (index !== -1) {
                state.unsavedChartVersion.metricQuery.tableCalculations[index] =
                    tableCalculation;
            }
        },

        deleteTableCalculation: (state, action: PayloadAction<string>) => {
            const name = action.payload;
            state.unsavedChartVersion.metricQuery.tableCalculations =
                state.unsavedChartVersion.metricQuery.tableCalculations.filter(
                    (tc) => tc.name !== name,
                );
        },

        // Additional metrics
        addAdditionalMetric: (
            state,
            action: PayloadAction<AdditionalMetric>,
        ) => {
            if (!state.unsavedChartVersion.metricQuery.additionalMetrics) {
                state.unsavedChartVersion.metricQuery.additionalMetrics = [];
            }
            state.unsavedChartVersion.metricQuery.additionalMetrics.push(
                action.payload,
            );
        },

        editAdditionalMetric: (
            state,
            action: PayloadAction<{
                additionalMetric: AdditionalMetric;
                previousAdditionalMetricName: string;
            }>,
        ) => {
            const { additionalMetric, previousAdditionalMetricName } =
                action.payload;
            const index =
                state.unsavedChartVersion.metricQuery.additionalMetrics?.findIndex(
                    (am) => am.name === previousAdditionalMetricName,
                ) ?? -1;
            if (
                index !== -1 &&
                state.unsavedChartVersion.metricQuery.additionalMetrics
            ) {
                state.unsavedChartVersion.metricQuery.additionalMetrics[index] =
                    additionalMetric;
            }
        },

        removeAdditionalMetric: (state, action: PayloadAction<FieldId>) => {
            if (state.unsavedChartVersion.metricQuery.additionalMetrics) {
                state.unsavedChartVersion.metricQuery.additionalMetrics =
                    state.unsavedChartVersion.metricQuery.additionalMetrics.filter(
                        (am) => am.name !== action.payload,
                    );
            }
        },

        // Custom dimensions
        addCustomDimension: (state, action: PayloadAction<CustomDimension>) => {
            if (!state.unsavedChartVersion.metricQuery.customDimensions) {
                state.unsavedChartVersion.metricQuery.customDimensions = [];
            }
            state.unsavedChartVersion.metricQuery.customDimensions.push(
                action.payload,
            );
        },

        editCustomDimension: (
            state,
            action: PayloadAction<{
                customDimension: CustomDimension;
                previousCustomDimensionName: string;
            }>,
        ) => {
            const { customDimension, previousCustomDimensionName } =
                action.payload;
            const index =
                state.unsavedChartVersion.metricQuery.customDimensions?.findIndex(
                    (cd) => cd.name === previousCustomDimensionName,
                ) ?? -1;
            if (
                index !== -1 &&
                state.unsavedChartVersion.metricQuery.customDimensions
            ) {
                state.unsavedChartVersion.metricQuery.customDimensions[index] =
                    customDimension;
            }
        },

        removeCustomDimension: (state, action: PayloadAction<FieldId>) => {
            if (state.unsavedChartVersion.metricQuery.customDimensions) {
                state.unsavedChartVersion.metricQuery.customDimensions =
                    state.unsavedChartVersion.metricQuery.customDimensions.filter(
                        (cd) => cd.name !== action.payload,
                    );
            }
        },

        // Modal management
        toggleAdditionalMetricModal: (
            state,
            action: PayloadAction<
                | Omit<
                      ExplorerSliceState['modals']['additionalMetric'],
                      'isOpen'
                  >
                | undefined
            >,
        ) => {
            if (action.payload) {
                state.modals.additionalMetric = {
                    ...action.payload,
                    isOpen: true,
                };
            } else {
                state.modals.additionalMetric.isOpen =
                    !state.modals.additionalMetric.isOpen;
            }
        },

        toggleCustomDimensionModal: (
            state,
            action: PayloadAction<
                | Omit<
                      ExplorerSliceState['modals']['customDimension'],
                      'isOpen'
                  >
                | undefined
            >,
        ) => {
            if (action.payload) {
                state.modals.customDimension = {
                    ...action.payload,
                    isOpen: true,
                };
            } else {
                state.modals.customDimension.isOpen =
                    !state.modals.customDimension.isOpen;
            }
        },

        toggleFormatModal: (
            state,
            action: PayloadAction<
                | Omit<ExplorerSliceState['modals']['format'], 'isOpen'>
                | undefined
            >,
        ) => {
            if (action.payload) {
                state.modals.format = {
                    ...action.payload,
                    isOpen: true,
                };
            } else {
                state.modals.format.isOpen = !state.modals.format.isOpen;
            }
        },

        toggleWriteBackModal: (
            state,
            action: PayloadAction<
                | Omit<ExplorerSliceState['modals']['writeBack'], 'isOpen'>
                | undefined
            >,
        ) => {
            if (action.payload) {
                state.modals.writeBack = {
                    ...action.payload,
                    isOpen: true,
                };
            } else {
                state.modals.writeBack.isOpen = !state.modals.writeBack.isOpen;
            }
        },

        // Metric format
        updateMetricFormat: (
            state,
            action: PayloadAction<{ metric: Metric; format?: CustomFormat }>,
        ) => {
            const { metric, format } = action.payload;
            if (!state.unsavedChartVersion.metricQuery.metricOverrides) {
                state.unsavedChartVersion.metricQuery.metricOverrides = {};
            }
            if (format) {
                state.unsavedChartVersion.metricQuery.metricOverrides[
                    metric.name
                ] = {
                    formatOptions: format,
                };
            } else {
                delete state.unsavedChartVersion.metricQuery.metricOverrides[
                    metric.name
                ];
            }
        },

        // Visualization config
        openVisualizationConfig: (state) => {
            state.isVisualizationConfigOpen = true;
        },

        closeVisualizationConfig: (state) => {
            state.isVisualizationConfigOpen = false;
        },
    },
});

export const explorerActions = explorerSlice.actions;
export const explorerReducer = explorerSlice.reducer;
