import {
    type AdditionalMetric,
    type CustomDimension,
    type FieldId,
    type MetricQuery,
    type ParameterValue,
    type SortField,
    type TableCalculation,
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

        // Dimensions and Metrics
        setDimensions: (state, action: PayloadAction<FieldId[]>) => {
            state.unsavedChartVersion.metricQuery.dimensions = action.payload;
        },
        setMetrics: (state, action: PayloadAction<FieldId[]>) => {
            state.unsavedChartVersion.metricQuery.metrics = action.payload;
        },

        // Sorts
        setSorts: (state, action: PayloadAction<SortField[]>) => {
            state.unsavedChartVersion.metricQuery.sorts = action.payload;
        },

        // Row limit
        setRowLimit: (state, action: PayloadAction<number>) => {
            state.unsavedChartVersion.metricQuery.limit = action.payload;
        },

        // Additional Metrics
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
        removeAdditionalMetric: (state, action: PayloadAction<FieldId>) => {
            if (state.unsavedChartVersion.metricQuery.additionalMetrics) {
                state.unsavedChartVersion.metricQuery.additionalMetrics =
                    state.unsavedChartVersion.metricQuery.additionalMetrics.filter(
                        (metric) => metric.uuid !== action.payload,
                    );
            }
        },
        editAdditionalMetric: (
            state,
            action: PayloadAction<{
                metric: AdditionalMetric;
                previousName: string;
            }>,
        ) => {
            if (state.unsavedChartVersion.metricQuery.additionalMetrics) {
                const index =
                    state.unsavedChartVersion.metricQuery.additionalMetrics.findIndex(
                        (m) => m.uuid === action.payload.metric.uuid,
                    );
                if (index !== -1) {
                    state.unsavedChartVersion.metricQuery.additionalMetrics[
                        index
                    ] = action.payload.metric;
                }
            }
        },

        // Custom Dimensions
        addCustomDimension: (state, action: PayloadAction<CustomDimension>) => {
            if (!state.unsavedChartVersion.metricQuery.customDimensions) {
                state.unsavedChartVersion.metricQuery.customDimensions = [];
            }
            state.unsavedChartVersion.metricQuery.customDimensions.push(
                action.payload,
            );
        },
        removeCustomDimension: (state, action: PayloadAction<FieldId>) => {
            if (state.unsavedChartVersion.metricQuery.customDimensions) {
                state.unsavedChartVersion.metricQuery.customDimensions =
                    state.unsavedChartVersion.metricQuery.customDimensions.filter(
                        (dimension) => dimension.id !== action.payload,
                    );
            }
        },

        // Table Calculations
        addTableCalculation: (
            state,
            action: PayloadAction<TableCalculation>,
        ) => {
            state.unsavedChartVersion.metricQuery.tableCalculations.push(
                action.payload,
            );
        },
        removeTableCalculation: (state, action: PayloadAction<string>) => {
            state.unsavedChartVersion.metricQuery.tableCalculations =
                state.unsavedChartVersion.metricQuery.tableCalculations.filter(
                    (calc) => calc.name !== action.payload,
                );
        },
        updateTableCalculation: (
            state,
            action: PayloadAction<{
                oldName: string;
                tableCalculation: TableCalculation;
            }>,
        ) => {
            const index =
                state.unsavedChartVersion.metricQuery.tableCalculations.findIndex(
                    (calc) => calc.name === action.payload.oldName,
                );
            if (index !== -1) {
                state.unsavedChartVersion.metricQuery.tableCalculations[index] =
                    action.payload.tableCalculation;
            }
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

        setParameterReferences: (
            state,
            action: PayloadAction<string[] | null>,
        ) => {
            state.parameterReferences = action.payload;
        },

        // Visualization config
        openVisualizationConfig: (state) => {
            state.isVisualizationConfigOpen = true;
        },
        closeVisualizationConfig: (state) => {
            state.isVisualizationConfigOpen = false;
        },

        // Modal actions
        toggleAdditionalMetricModal: (
            state,
            action?: PayloadAction<{
                isEditing?: boolean;
                item?: any;
                type?: any;
            }>,
        ) => {
            state.modals.additionalMetric.isOpen =
                !state.modals.additionalMetric.isOpen;
            if (action?.payload) {
                Object.assign(state.modals.additionalMetric, action.payload);
            }
        },
        toggleCustomDimensionModal: (
            state,
            action?: PayloadAction<{
                isEditing?: boolean;
                table?: string;
                item?: any;
            }>,
        ) => {
            state.modals.customDimension.isOpen =
                !state.modals.customDimension.isOpen;
            if (action?.payload) {
                Object.assign(state.modals.customDimension, action.payload);
            }
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

        // Custom dimensions
        addCustomDimension: (state, action: PayloadAction<CustomDimension>) => {
            if (!state.unsavedChartVersion.metricQuery.customDimensions) {
                state.unsavedChartVersion.metricQuery.customDimensions = [];
            }
            state.unsavedChartVersion.metricQuery.customDimensions.push(
                action.payload,
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
            const index =
                state.unsavedChartVersion.metricQuery.customDimensions.findIndex(
                    (cd) => cd.id === oldId,
                );
            if (index > -1) {
                state.unsavedChartVersion.metricQuery.customDimensions[index] =
                    customDimension;
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
    },
});

export const explorerActions = explorerSlice.actions;
export const explorerReducer = explorerSlice.reducer;
