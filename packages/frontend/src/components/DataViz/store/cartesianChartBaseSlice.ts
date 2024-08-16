import {
    DEFAULT_AGGREGATION,
    IndexType,
    isFormat,
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
import { type ResultsAndColumns } from '../Results';

type InitialState = {
    defaultLayout: SqlCartesianChartLayout | undefined;
    config: BarChartSqlConfig | LineChartSqlConfig | undefined;
    options: {
        indexLayoutOptions: IndexLayoutOptions[];
        valuesLayoutOptions: ValuesLayoutOptions[];
        pivotLayoutOptions: PivotLayoutOptions[];
    };
};

const initialState: InitialState = {
    defaultLayout: undefined,
    config: undefined,
    options: {
        indexLayoutOptions: [],
        valuesLayoutOptions: [],
        pivotLayoutOptions: [],
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
                    state.options.indexLayoutOptions.find(
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
                        state.options.valuesLayoutOptions.find(
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

            const yAxisFieldsAvailable =
                state.options.valuesLayoutOptions.filter(
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
            if (!state.config?.fieldConfig?.y) return;

            const index = action.payload;
            state.config.fieldConfig.y.splice(index, 1);

            if (state.config.display) {
                if (state.config.display.yAxis) {
                    state.config.display.yAxis.splice(index, 1);
                }

                if (state.config.display.series) {
                    Object.entries(state.config.display.series).forEach(
                        ([key, series]) => {
                            if (series.yAxisIndex === index) {
                                // NOTE: Delete series from display object when it's removed from yAxis
                                delete state.config?.display?.series?.[key];
                            } else if (
                                // NOTE: Decrease yAxisIndex for series that are after the removed yAxis
                                series.yAxisIndex &&
                                series.yAxisIndex > index
                            ) {
                                series.yAxisIndex--;
                            }
                        },
                    );
                }
            }
        },
        setStacked: ({ config }, action: PayloadAction<boolean>) => {
            if (!config) return;

            config.display = config.display || {};

            config.display.stack = action.payload;
        },

        setYAxisFormat: (
            { config },
            action: PayloadAction<{ format: string }>,
        ) => {
            if (!config) return;
            config.display = config.display || {};

            const validFormat = isFormat(action.payload.format)
                ? action.payload.format
                : undefined;

            config.display.yAxis = config.display.yAxis || [];

            if (config.display.yAxis.length === 0) {
                config.display.yAxis.push({ format: validFormat });
            } else {
                config.display.yAxis[0].format = validFormat;
            }

            // Update the format for series with yAxisIndex 0
            if (config.display.series) {
                Object.values(config.display.series).forEach((series) => {
                    if (series.yAxisIndex === 0) {
                        series.format = validFormat;
                    }
                });
            } else if (config.fieldConfig?.y[0].reference) {
                config.display.series = {
                    [config.fieldConfig?.y[0].reference]: {
                        format: validFormat,
                        yAxisIndex: 0,
                    },
                };
            }
        },
        setSeriesFormat: (
            { config },
            action: PayloadAction<{
                index: number;
                format: string;
                reference: string;
            }>,
        ) => {
            if (!config?.display) return;

            const { index, format, reference } = action.payload;
            const validFormat = isFormat(format) ? format : undefined;

            config.display.series = config.display.series || {};
            config.display.series[reference] = {
                ...config.display.series[reference],
                format: validFormat,
                yAxisIndex: index,
            };

            if (index === 0) {
                config.display.yAxis = config.display.yAxis || [];
                config.display.yAxis[0] = {
                    ...config.display.yAxis[0],
                    format: validFormat,
                };
            }
        },
        onResults: (
            // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
            state,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
            action: PayloadAction<ResultsAndColumns>,
        ) => {
            // This should be called from the sqlRunner or semanticViewer on results
            // When this is called, this method will update the options and config on the different chat slices
            // See extraReducers for more details
        },
    },
});

export const { onResults } = cartesianChartConfigSlice.actions;
