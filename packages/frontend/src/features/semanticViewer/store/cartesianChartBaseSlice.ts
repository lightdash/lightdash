import {
    DEFAULT_AGGREGATION,
    IndexType,
    type AggregationOptions,
    type BarChartSqlConfig,
    type CartesianChartDisplay,
    type IndexLayoutOptions,
    type LineChartSqlConfig,
    type PivotLayoutOptions,
    type SqlCartesianChartLayout,
    type ValuesLayoutOptions,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

type InitialState = {
    defaultLayout: SqlCartesianChartLayout | undefined;
    config: BarChartSqlConfig | LineChartSqlConfig | undefined;
    options: {
        xLayoutOptions: IndexLayoutOptions[];
        yLayoutOptions: ValuesLayoutOptions[];
        groupByOptions: PivotLayoutOptions[];
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

export const cartesianChartConfigSlice = createSlice({
    name: 'cartesianChartBaseConfig',
    initialState,
    reducers: {
        setXAxisReference: (
            state,
            action: PayloadAction<SqlCartesianChartLayout['x']['reference']>,
        ) => {
            if (state.config?.fieldConfig?.x) {
                state.config.fieldConfig.x.reference = action.payload;
                state.config.fieldConfig.x.type =
                    state.options.xLayoutOptions.find(
                        (x) => x.reference === action.payload,
                    )?.type ?? IndexType.CATEGORY;
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
            state,
            action: PayloadAction<{
                reference: string;
                index: number;
            }>,
        ) => {
            if (state.config?.fieldConfig?.y) {
                const yAxis = state.config.fieldConfig.y[action.payload.index];
                if (yAxis) {
                    yAxis.reference = action.payload.reference;
                    yAxis.aggregation =
                        state.options.yLayoutOptions.find(
                            (option) =>
                                option.reference === action.payload.reference,
                        )?.aggregationOptions[0] ?? DEFAULT_AGGREGATION;
                }
            }
        },
        setYAxisAggregation: (
            { config },
            action: PayloadAction<{
                index: number;
                aggregation: AggregationOptions;
            }>,
        ) => {
            if (!config) return;
            if (!config?.fieldConfig?.y) return;

            const yAxis = config.fieldConfig.y[action.payload.index];
            if (yAxis) {
                yAxis.aggregation = action.payload.aggregation;
            }
        },
        setXAxisLabel: (
            { config },
            action: PayloadAction<CartesianChartDisplay['xAxis']>,
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
                    !state.config?.fieldConfig?.y
                        .map((y) => y.reference)
                        .includes(option.reference),
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
        removeYAxisField: (state, action: PayloadAction<number>) => {
            if (!state.config) return;
            if (!state.config.fieldConfig) return;

            state.config.fieldConfig.y.splice(action.payload, 1);
        },
    },
});
