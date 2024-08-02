import { ChartKind, deepEqual, isLineChartSQLConfig } from '@lightdash/common';
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
                if (action.payload.columns) {
                    state.options = {
                        xLayoutOptions:
                            sqlRunnerResultsTransformer.cartesianChartXLayoutOptions(),
                        yLayoutOptions:
                            sqlRunnerResultsTransformer.cartesianChartYLayoutOptions(),
                        groupByOptions:
                            sqlRunnerResultsTransformer.cartesianChartGroupByLayoutOptions(),
                    };
                }

                // Update layout
                const oldDefaultLayout = state.defaultLayout;
                const newDefaultLayout =
                    sqlRunnerResultsTransformer.defaultCartesianChartLayout();
                state.defaultLayout = newDefaultLayout;

                if (
                    !state.config ||
                    deepEqual(
                        oldDefaultLayout || {},
                        state.config?.fieldConfig || {},
                    )
                ) {
                    state.config = {
                        metadata: {
                            version: 1,
                        },
                        type: ChartKind.LINE,
                        fieldConfig: newDefaultLayout,
                        display: state.config?.display,
                    };
                }
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
