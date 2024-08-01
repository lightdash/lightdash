import { ChartKind, deepEqual, isBarChartSQLConfig } from '@lightdash/common';
import { createSlice } from '@reduxjs/toolkit';
import { SqlRunnerResultsTransformerFE } from '../transformers/SqlRunnerResultsTransformerFE';
import { cartesianChartConfigSlice } from './cartesianChartBaseSlice';
import { setSavedChartData, setSqlRunnerResults } from './sqlRunnerSlice';

export const barChartConfigSlice = createSlice({
    name: 'barChartConfig',
    initialState: cartesianChartConfigSlice.getInitialState(),
    reducers: {
        ...cartesianChartConfigSlice.caseReducers,
    },
    extraReducers: (builder) => {
        builder.addCase(setSqlRunnerResults, (state, action) => {
            if (action.payload.data.results && action.payload.data.columns) {
                // Transform results into options
                const sqlRunnerResultsTransformer =
                    new SqlRunnerResultsTransformerFE({
                        rows: action.payload.data.results,
                        columns: action.payload.data.columns,
                    });
                if (action.payload.data.columns) {
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
                        type: ChartKind.VERTICAL_BAR,
                        fieldConfig: newDefaultLayout,
                        display: state.config?.display,
                    };
                }
            }
        });
        builder.addCase(setSavedChartData, (state, action) => {
            if (isBarChartSQLConfig(action.payload.config)) {
                state.config = action.payload.config;
            }
        });
    },
});

export type barChartActionsType = typeof barChartConfigSlice.actions;
