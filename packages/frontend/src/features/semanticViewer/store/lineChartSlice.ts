import {
    CartesianChartDataTransformer,
    ChartKind,
    isLineChartSQLConfig,
} from '@lightdash/common';
import { createSlice } from '@reduxjs/toolkit';
import { SemanticViewerResultsTransformerFE } from '../transformers/SemanticViewerResultsTransformerFE';
import { cartesianChartConfigSlice } from './cartesianChartBaseSlice';
import { setResults, setSavedChartData } from './semanticViewerSlice';

export const lineChartConfigSlice = createSlice({
    name: 'lineChartConfig',
    initialState: cartesianChartConfigSlice.getInitialState(),
    reducers: {
        ...cartesianChartConfigSlice.caseReducers,
    },
    extraReducers: (builder) => {
        builder.addCase(setResults, (state, action) => {
            if (action.payload) {
                const sqlRunnerResultsTransformer =
                    new SemanticViewerResultsTransformerFE({
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
