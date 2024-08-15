import {
    CartesianChartDataTransformer,
    ChartKind,
    isLineChartSQLConfig,
} from '@lightdash/common';
import { createSlice } from '@reduxjs/toolkit';
import { SqlRunnerResultsTransformerFE } from '../transformers/SqlRunnerResultsTransformerFE';
import { cartesianChartConfigSlice } from './cartesianChartBaseSlice';
import { setSavedChartData, setSqlRunnerResults } from './sqlRunnerSlice';

export const lineChartConfigSlice = createSlice({
    name: 'lineChartConfig',
    initialState: cartesianChartConfigSlice.getInitialState(),
    reducers: {
        ...cartesianChartConfigSlice.caseReducers,
    },
    extraReducers: (builder) => {
        builder.addCase(setSqlRunnerResults, (state, action) => {
            if (action.payload.results && action.payload.columns) {
                const sqlRunnerResultsTransformer =
                    new SqlRunnerResultsTransformerFE({
                        rows: action.payload.results,
                        columns: action.payload.columns,
                    });
                const lineChartModel = new CartesianChartDataTransformer({
                    transformer: sqlRunnerResultsTransformer,
                });

                state.options =
                    sqlRunnerResultsTransformer.getPivotChartLayoutOptions();

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
