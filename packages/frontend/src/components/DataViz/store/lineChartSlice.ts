import { ChartKind, isVizLineChartConfig } from '@lightdash/common';
import { createSlice } from '@reduxjs/toolkit';
import {
    setChartConfig,
    setChartOptionsAndConfig,
} from './actions/commonChartActions';
import { cartesianChartConfigSlice } from './cartesianChartBaseSlice';

export const lineChartConfigSlice = createSlice({
    name: 'lineChartConfig',
    initialState: cartesianChartConfigSlice.getInitialState(),
    reducers: {
        ...cartesianChartConfigSlice.caseReducers,
    },
    extraReducers: (builder) => {
        builder.addCase(setChartOptionsAndConfig, (state, action) => {
            if (action.payload.type !== ChartKind.LINE) {
                return;
            }

            state.options = action.payload.options;

            // Only set the initial config if it's not already set and the fieldConfig is present
            if (!state.config && action.payload.config.fieldConfig) {
                state.config = action.payload.config;
            }
        });
        builder.addCase(setChartConfig, (state, action) => {
            if (isVizLineChartConfig(action.payload)) {
                state.config = action.payload;
            }
        });
    },
});

export type LineChartActionsType = typeof lineChartConfigSlice.actions;
