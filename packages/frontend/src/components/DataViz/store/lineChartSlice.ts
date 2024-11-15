import { ChartKind, isVizLineChartConfig } from '@lightdash/common';
import { createSlice } from '@reduxjs/toolkit';
import { prepareAndFetchChartData } from '../../../features/sqlRunner/store/thunks';
import {
    getNewSortBy,
    resetChartState,
    setChartConfig,
    setChartOptionsAndConfig,
    updateChartSortBy,
} from './actions/commonChartActions';
import { cartesianChartConfigSlice } from './cartesianChartBaseSlice';

export const lineChartConfigSlice = createSlice({
    name: 'lineChartConfig',
    initialState: cartesianChartConfigSlice.getInitialState(),
    reducers: {
        ...cartesianChartConfigSlice.caseReducers,
    },
    extraReducers: (builder) => {
        // Include the extraReducers from cartesianChartConfigSlice
        builder.addCase(prepareAndFetchChartData.pending, (state) => {
            state.chartDataLoading = true;
            state.chartDataError = undefined;
        });
        builder.addCase(prepareAndFetchChartData.fulfilled, (state, action) => {
            state.chartDataLoading = false;
            state.series = action.payload?.valuesColumns;
            state.chartData = action.payload;
        });
        builder.addCase(prepareAndFetchChartData.rejected, (state, action) => {
            state.chartDataLoading = false;
            state.chartData = undefined;
            state.chartDataError = new Error(action.error.message);
        });
        builder.addCase(setChartOptionsAndConfig, (state, action) => {
            if (action.payload.type !== ChartKind.LINE) {
                return;
            }

            state.options = action.payload.options;

            // Only set the initial config if it's not already set and the fieldConfig is present
            if (!state.fieldConfig && action.payload.config.fieldConfig) {
                state.fieldConfig = action.payload.config.fieldConfig;
            }
            if (!state.display && action.payload.config.display) {
                state.display = action.payload.config.display;
            }

            state.errors = action.payload.errors;
        });
        builder.addCase(setChartConfig, (state, action) => {
            if (isVizLineChartConfig(action.payload)) {
                state.fieldConfig = action.payload.fieldConfig;
                state.display = action.payload.display;
            }
        });
        builder.addCase(resetChartState, () => ({
            ...cartesianChartConfigSlice.getInitialState(),
            type: ChartKind.LINE,
        }));

        builder.addCase(updateChartSortBy, (state, action) => {
            if (!state.fieldConfig) return;
            state.fieldConfig.sortBy = getNewSortBy(
                action.payload,
                state.fieldConfig.sortBy,
            );
        });
    },
});

export type LineChartActionsType = typeof lineChartConfigSlice.actions;
