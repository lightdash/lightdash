import { type MetricQuery, type ParameterValue } from '@lightdash/common';
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
    },
});

export const explorerActions = explorerSlice.actions;
export const explorerReducer = explorerSlice.reducer;
