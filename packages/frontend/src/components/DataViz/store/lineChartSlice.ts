import {
    CartesianChartDataTransformer,
    ChartKind,
    isLineChartSQLConfig,
} from '@lightdash/common';
import { createSlice } from '@reduxjs/toolkit';
import { setSavedChartData } from '../../../features/sqlRunner/store/sqlRunnerSlice';
import {
    cartesianChartConfigSlice,
    onResults,
} from './cartesianChartBaseSlice';

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
        builder.addCase(setSavedChartData, (state, action) => {
            if (isLineChartSQLConfig(action.payload.config)) {
                state.config = action.payload.config;
            }
        });
    },
});

export type LineChartActionsType = typeof lineChartConfigSlice.actions;
