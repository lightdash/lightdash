import { ChartKind, isVizBarChartConfig } from '@lightdash/common';
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

export const barChartConfigSlice = createSlice({
    name: 'barChartConfig',
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
            if (action.payload.type !== ChartKind.VERTICAL_BAR) {
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
            if (isVizBarChartConfig(action.payload)) {
                state.fieldConfig = action.payload.fieldConfig;
                state.display = action.payload.display;
            }
        });
        builder.addCase(resetChartState, () =>
            cartesianChartConfigSlice.getInitialState(),
        );

        builder.addCase(updateChartSortBy, (state, action) => {
            if (!state.fieldConfig) return;
            state.fieldConfig.sortBy = getNewSortBy(
                action.payload,
                state.fieldConfig.sortBy,
            );
        });
    },
});

export type BarChartActionsType = typeof barChartConfigSlice.actions;
