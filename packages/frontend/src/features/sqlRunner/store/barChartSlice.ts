import {
    ChartKind,
    deepEqual,
    type AggregationOptions,
    type BarChartConfig,
    type BarChartDisplay,
    type GroupByLayoutOptions,
    type SqlTransformBarChartConfig,
    type XLayoutOptions,
    type YLayoutOptions,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { SqlRunnerResultsTransformerFE } from '../transformers/useBarChart';
import { setSaveChartData, setSqlRunnerResults } from './sqlRunnerSlice';

type InitialState = {
    defaultLayout: SqlTransformBarChartConfig | undefined;
    config: BarChartConfig | undefined;
    options: {
        xLayoutOptions: XLayoutOptions[];
        yLayoutOptions: YLayoutOptions[];
        groupByOptions: GroupByLayoutOptions[];
    };
};

const initialState: InitialState = {
    defaultLayout: undefined,
    config: undefined,
    options: {
        xLayoutOptions: [],
        yLayoutOptions: [],
        groupByOptions: [],
    },
};

export const barChartConfigSlice = createSlice({
    name: 'barChartConfig',
    initialState,
    reducers: {
        // TODO: add y field feature
        // addYField: (
        //     state,
        //     action: PayloadAction<SqlTransformBarChartConfig['y'][number]>,
        // ) => {
        //     if (!state.config) return;
        //     if (!state.config.fieldConfig) return;

        //     const yAxisFields = state.config.fieldConfig.y;
        //     if (yAxisFields) {
        //         state.config.fieldConfig.y = [...yAxisFields, action.payload];
        //     }
        // },
        setXAxisReference: ({ config }, action: PayloadAction<string>) => {
            if (config?.fieldConfig?.x) {
                config.fieldConfig.x.reference = action.payload;
            }
        },
        setGroupByReference: (
            { config },
            action: PayloadAction<{
                reference: string;
            }>,
        ) => {
            if (config?.fieldConfig) {
                config.fieldConfig.groupBy = [
                    { reference: action.payload.reference },
                ];
            }
        },
        unsetGroupByReference: ({ config }) => {
            if (config?.fieldConfig) {
                config.fieldConfig.groupBy = undefined;
            }
        },
        setYAxisReference: (
            { config },
            action: PayloadAction<{
                previousReference: string;
                reference: string;
                aggregation: AggregationOptions;
            }>,
        ) => {
            if (config?.fieldConfig?.y) {
                const yAxis = config.fieldConfig.y.find(
                    (axis) =>
                        axis.reference === action.payload.previousReference,
                );
                if (yAxis) {
                    yAxis.reference = action.payload.reference;
                    yAxis.aggregation = action.payload.aggregation;
                }
            }
        },
        setYAxisAggregation: (
            { config },
            action: PayloadAction<{
                reference: string;
                aggregation: AggregationOptions;
            }>,
        ) => {
            if (!config) return;
            if (!config?.fieldConfig?.y) return;

            const yAxis = config.fieldConfig.y.find(
                (axis) => axis.reference === action.payload.reference,
            );
            if (yAxis) {
                yAxis.aggregation = action.payload.aggregation;
            }
        },
        setXAxisLabel: (
            { config },
            action: PayloadAction<BarChartDisplay['xAxis']>,
        ) => {
            if (!config) return;
            if (!config.display) {
                config.display = {
                    xAxis: action.payload,
                };
            } else {
                config.display.xAxis = action.payload;
            }
        },
        setYAxisLabel: (
            { config },
            action: PayloadAction<{ index: number; label: string }>,
        ) => {
            if (!config) return;

            config.display = config.display || {};
            config.display.yAxis = config.display.yAxis || [];

            const { index, label } = action.payload;
            if (config.display.yAxis[index] === undefined) {
                config.display.yAxis[index] = {
                    label,
                };
            } else {
                config.display.yAxis[index].label = label;
            }
        },
        setSeriesLabel: (
            { config },
            action: PayloadAction<{
                reference: string;
                label: string;
            }>,
        ) => {
            if (!config || !config.display) return;

            if (config.display.series) {
                config.display.series[action.payload.reference].label =
                    action.payload.label;
            }
        },
    },
    extraReducers: (builder) => {
        builder.addCase(setSqlRunnerResults, (state, action) => {
            if (action.payload.results && action.payload.columns) {
                // Transform results into options
                const sqlRunnerResultsTransformer =
                    new SqlRunnerResultsTransformerFE({
                        rows: action.payload.results,
                        columns: action.payload.columns,
                    });
                if (action.payload.columns) {
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
                        type: ChartKind.VERTICAL_BAR,
                        fieldConfig: newDefaultLayout,
                        display: state.config?.display,
                    };
                }
            }
        });
        builder.addCase(setSaveChartData, (state, action) => {
            if (action.payload.config.type === ChartKind.VERTICAL_BAR) {
                state.config = action.payload.config;
            }
        });
    },
});

export const {
    setYAxisLabel,
    setXAxisLabel,
    setXAxisReference,
    setYAxisReference,
    setYAxisAggregation,
    setSeriesLabel,
    setGroupByReference,
    unsetGroupByReference,
} = barChartConfigSlice.actions;
