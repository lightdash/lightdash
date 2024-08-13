import { ChartKind, isLineChartSQLConfig } from '@lightdash/common';
import { createSlice } from '@reduxjs/toolkit';
import { SqlRunnerResultsTransformerFE } from '../transformers/SqlRunnerResultsTransformerFE';
import { setResults } from './semanticViewerSlice';
import { cartesianChartConfigSlice } from './cartesianChartBaseSlice';

export const lineChartConfigSlice = createSlice({
    name: 'lineChartConfig',
    initialState: cartesianChartConfigSlice.getInitialState(),
    reducers: {
        ...cartesianChartConfigSlice.caseReducers,
    },
    extraReducers: (builder) => {
        builder.addCase(setResults, (state, action) => {
            if (action.payload ) {
                const sqlRunnerResultsTransformer =
                    new SqlRunnerResultsTransformerFE({
                        rows: action.payload,
                        columns: [],
                    });

                state.options =
                    sqlRunnerResultsTransformer.getCartesianLayoutOptions();

                const { newConfig, newDefaultLayout } =
                    sqlRunnerResultsTransformer.getChartConfig({
                        chartType: ChartKind.LINE,
                        currentConfig: state.config,
                    });

                state.config = newConfig;
                state.defaultLayout = newDefaultLayout;
            }
        });
        /*builder.addCase(setSavedChartData, (state, action) => {
            if (isLineChartSQLConfig(action.payload.config)) {
                state.config = action.payload.config;
            }
        });*/
    },
});

export type LineChartActionsType = typeof lineChartConfigSlice.actions;
