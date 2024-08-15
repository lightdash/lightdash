import { ChartKind, isBarChartSQLConfig } from '@lightdash/common';
import { createSlice } from '@reduxjs/toolkit';
import { SemanticViewerResultsTransformerFE } from '../transformers/SemanticViewerResultsTransformerFE';
import { cartesianChartConfigSlice } from './cartesianChartBaseSlice';
import { setResults, setSavedChartData } from './semanticViewerSlice';

export const barChartConfigSlice = createSlice({
    name: 'barChartConfig',
    initialState: cartesianChartConfigSlice.getInitialState(),
    reducers: {
        ...cartesianChartConfigSlice.caseReducers,
    },
    extraReducers: (builder) => {
        builder.addCase(setResults, (state, action) => {
            if (action.payload.results && action.payload.columns) {
                const sqlRunnerResultsTransformer =
                    new SemanticViewerResultsTransformerFE({
                        rows: action.payload.results,
                        columns: action.payload.columns,
                    });

                state.options =
                    sqlRunnerResultsTransformer.getCartesianLayoutOptions();

                const { newConfig, newDefaultLayout } =
                    sqlRunnerResultsTransformer.getChartConfig({
                        chartType: ChartKind.VERTICAL_BAR,
                        currentConfig: state.config,
                    });

                state.config = newConfig;
                state.defaultLayout = newDefaultLayout;
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
