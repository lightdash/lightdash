import {
    CartesianChartDataTransformer,
    ChartKind,
    isLineChartSQLConfig,
} from '@lightdash/common';
import { createSlice } from '@reduxjs/toolkit';
import { onResults, setChartConfig } from './actions/commonChartActions';
import { cartesianChartConfigSlice } from './cartesianChartBaseSlice';

export const lineChartConfigSlice = createSlice({
    name: 'lineChartConfig',
    initialState: cartesianChartConfigSlice.getInitialState(),
    reducers: {
        ...cartesianChartConfigSlice.caseReducers,
    },
    extraReducers: (builder) => {
        builder.addCase(onResults, (state, action) => {
            if (action.payload) {
                const lineChartModel = new CartesianChartDataTransformer({
                    transformer: action.payload.transformer,
                });

                state.options =
                    action.payload.transformer.getPivotChartLayoutOptions();

                state.config = lineChartModel.mergeConfig(
                    ChartKind.LINE,
                    state.config,
                );
            }
        });
        builder.addCase(setChartConfig, (state, action) => {
            if (isLineChartSQLConfig(action.payload)) {
                state.config = action.payload;
            }
        });
    },
});

export type LineChartActionsType = typeof lineChartConfigSlice.actions;
