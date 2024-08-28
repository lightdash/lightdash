import { ChartKind, deepEqual, isVizBarChartConfig } from '@lightdash/common';
import { createSlice } from '@reduxjs/toolkit';
import { onResults, setChartConfig } from './actions/commonChartActions';
import { cartesianChartConfigSlice } from './cartesianChartBaseSlice';

export const barChartConfigSlice = createSlice({
    name: 'barChartConfig',
    initialState: cartesianChartConfigSlice.getInitialState(),
    reducers: {
        ...cartesianChartConfigSlice.caseReducers,
    },
    extraReducers: (builder) => {
        builder.addCase(onResults, (state, action) => {
            if (action.payload.type !== ChartKind.VERTICAL_BAR) {
                return;
            }
            state.options = action.payload.options;

            if (
                !state.config ||
                !deepEqual(state.config, action.payload.config)
            ) {
                state.config = action.payload.config;
            }
        });
        builder.addCase(setChartConfig, (state, action) => {
            if (isVizBarChartConfig(action.payload)) {
                state.config = action.payload;
            }
        });
    },
});

export type BarChartActionsType = typeof barChartConfigSlice.actions;
