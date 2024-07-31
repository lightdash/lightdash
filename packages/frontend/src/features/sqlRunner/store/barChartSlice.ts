import {
    ChartKind,
    deepEqual,
    DEFAULT_AGGREGATION,
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
import { SqlRunnerResultsTransformerFE } from '../transformers/SqlRunnerResultsTransformerFE';
import { setSavedChartData, setSqlRunnerResults } from './sqlRunnerSlice';

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
        setXAxisReference: (
            { config },
            action: PayloadAction<SqlTransformBarChartConfig['x']>,
        ) => {
            if (config?.fieldConfig?.x) {
                config.fieldConfig.x = action.payload;
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
        setYAxisPosition: (
            { config },
            action: PayloadAction<{
                index: number;
                position: string | undefined;
            }>,
        ) => {
            if (!config) return;

            config.display = config.display || {};
            config.display.yAxis = config.display.yAxis || [];

            const { index, position } = action.payload;
            if (config.display.yAxis[index] === undefined) {
                config.display.yAxis[index] = {
                    position,
                };
            } else {
                config.display.yAxis[index].position = position;
            }
        },
        addYAxisField: (state) => {
            if (!state.config) return;
            if (!state.config.fieldConfig) return;

            const yAxisFieldsAvailable = state.options.yLayoutOptions.filter(
                (option) =>
                    option.reference !==
                    state.config?.fieldConfig?.y[0]?.reference,
            );
            const yAxisFields = state.config.fieldConfig.y;

            let defaultYAxisField: string | undefined;

            if (yAxisFieldsAvailable.length > 0) {
                defaultYAxisField = yAxisFieldsAvailable[0].reference;
            } else {
                defaultYAxisField = state.config.fieldConfig.y[0].reference;
            }

            if (yAxisFields) {
                state.config.fieldConfig.y.push({
                    reference: defaultYAxisField,
                    aggregation: DEFAULT_AGGREGATION,
                });
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
        builder.addCase(setSavedChartData, (state, action) => {
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
    setGroupByReference,
    unsetGroupByReference,
    setYAxisPosition,
    addYAxisField,
} = barChartConfigSlice.actions;
