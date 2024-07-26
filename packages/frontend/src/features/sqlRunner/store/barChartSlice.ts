import {
    ChartKind,
    type AggregationOptions,
    type BarChartConfig,
    type BarChartDisplay,
    type XLayoutOptions,
    type YLayoutOptions,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { SqlRunnerResultsTransformerFE } from '../transformers/useBarChart';
import { setInitialResultsAndSeries, setSaveChartData } from './sqlRunnerSlice';

type InitialState = {
    config: BarChartConfig | undefined;
    options: {
        xLayoutOptions: XLayoutOptions[];
        yLayoutOptions: YLayoutOptions[];
    };
};

const initialState: InitialState = {
    config: undefined,
    options: {
        xLayoutOptions: [],
        yLayoutOptions: [],
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
            config.display.yAxis[index] = {
                ...config.display.yAxis[index],
                label,
            };
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
        builder.addCase(setInitialResultsAndSeries, (state, action) => {
            if (
                state.config === undefined &&
                action.payload.results &&
                action.payload.columns
            ) {
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
                    };
                    state.config = sqlRunnerResultsTransformer.defaultConfig();
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
} = barChartConfigSlice.actions;
