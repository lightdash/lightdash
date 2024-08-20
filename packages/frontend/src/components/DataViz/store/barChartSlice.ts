import {
    CartesianChartDataTransformer,
    ChartKind,
    isBarChartSQLConfig,
} from '@lightdash/common';
import { createSlice } from '@reduxjs/toolkit';
import { SqlRunnerResultsTransformer } from '../../../features/sqlRunner/SqlResultsRunner';
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
            if (action.payload.results && action.payload.columns) {
                const sqlRunnerResultsTransformer =
                    new SqlRunnerResultsTransformer({
                        rows: action.payload.results,
                        columns: action.payload.columns,
                    });
                const barChartModel = new CartesianChartDataTransformer({
                    transformer: sqlRunnerResultsTransformer,
                });

                state.options =
                    sqlRunnerResultsTransformer.getPivotChartLayoutOptions();

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
