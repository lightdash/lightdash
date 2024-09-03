import {
    CartesianChartDataTransformer,
    ChartKind,
    isBarChartSQLConfig,
} from '@lightdash/common';
import { createSlice } from '@reduxjs/toolkit';
import { setSavedChartData } from '../../../features/sqlRunner/store/sqlRunnerSlice';
import {
    cartesianChartConfigSlice,
    onResults,
} from './cartesianChartBaseSlice';

export const barChartConfigSlice = createSlice({
    name: 'barChartConfig',
    initialState: cartesianChartConfigSlice.getInitialState(),
    reducers: {
        ...cartesianChartConfigSlice.caseReducers,
    },
    extraReducers: (builder) => {
        builder.addCase(onResults, (state, action) => {
            if (action.payload) {
                const barChartModel = new CartesianChartDataTransformer({
                    transformer: action.payload.transformer,
                });

                state.options =
                    action.payload.transformer.getPivotChartLayoutOptions();

                state.config = barChartModel.mergeConfig(
                    ChartKind.VERTICAL_BAR,
                    state.config,
                );
            }
        });
        builder.addCase(setSavedChartData, (state, action) => {
            if (isBarChartSQLConfig(action.payload.config)) {
                state.config = action.payload.config;
            }
        });
    },
});

export type BarChartActionsType = typeof barChartConfigSlice.actions;
