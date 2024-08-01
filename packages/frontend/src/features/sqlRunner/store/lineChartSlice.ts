import { ChartKind, deepEqual } from '@lightdash/common';
import { createSlice } from '@reduxjs/toolkit';
import { SqlRunnerResultsTransformerFE } from '../transformers/SqlRunnerResultsTransformerFE';
import { barChartConfigSlice } from './barChartSlice';
import { setSqlRunnerResults } from './sqlRunnerSlice';

export const lineChartConfigSlice = createSlice({
    name: 'lineChartConfig',
    initialState: barChartConfigSlice.getInitialState(),
    reducers: {
        ...barChartConfigSlice.caseReducers,
    },
    extraReducers: (builder) => {
        builder.addCase(setSqlRunnerResults, (state, action) => {
            if (action.payload.data.results && action.payload.data.columns) {
                //TODO: BarLine
                const sqlRunnerResultsTransformer =
                    new SqlRunnerResultsTransformerFE({
                        rows: action.payload.data.results,
                        columns: action.payload.data.columns,
                    });
                if (action.payload.data.columns) {
                    state.options = {
                        xLayoutOptions:
                            sqlRunnerResultsTransformer.barChartXLayoutOptions(),
                        yLayoutOptions:
                            sqlRunnerResultsTransformer.barChartYLayoutOptions(),
                        groupByOptions:
                            sqlRunnerResultsTransformer.barChartGroupByLayoutOptions(),
                    };
                }

                // Update layout
                const oldDefaultLayout = state.defaultLayout;
                const newDefaultLayout =
                    sqlRunnerResultsTransformer.defaultBarChartLayout();
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
    },
});

export const {
    addYAxisField,
    removeYAxisField,
    setGroupByReference,
    setXAxisReference,
    setYAxisAggregation,
    setYAxisReference,
    unsetGroupByReference,
    setXAxisLabel,
    setYAxisLabel,
    setYAxisPosition,
} = lineChartConfigSlice.actions;
