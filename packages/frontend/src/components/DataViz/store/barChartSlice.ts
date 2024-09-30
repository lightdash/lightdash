import { ChartKind, isVizBarChartConfig } from '@lightdash/common';
import { createSlice } from '@reduxjs/toolkit';
import {
    resetChartState,
    setChartConfig,
    setChartOptionsAndConfig,
} from './actions/commonChartActions';
import { cartesianChartConfigSlice } from './cartesianChartBaseSlice';

export const barChartConfigSlice = createSlice({
    name: 'barChartConfig',
    initialState: cartesianChartConfigSlice.getInitialState(),
    reducers: {
        ...cartesianChartConfigSlice.caseReducers,
    },
    extraReducers: (builder) => {
        builder.addCase(setChartOptionsAndConfig, (state, action) => {
            if (action.payload.type !== ChartKind.VERTICAL_BAR) {
                return;
            }

            state.options = action.payload.options;

            // Only set the initial config if it's not already set and the fieldConfig is present
            if (!state.config && action.payload.config.fieldConfig) {
                state.config = action.payload.config;
            }

            state.errors = action.payload.errors;
        });
        builder.addCase(setChartConfig, (state, action) => {
            if (isVizBarChartConfig(action.payload)) {
                state.config = action.payload;
            }
        });
        builder.addCase(resetChartState, () =>
            cartesianChartConfigSlice.getInitialState(),
        );
    },
});

export type BarChartActionsType = typeof barChartConfigSlice.actions;
