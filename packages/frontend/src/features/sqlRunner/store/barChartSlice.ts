import { ChartKind, type BarChartConfig } from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { setInitialResultsAndSeries, setSaveChartData } from './sqlRunnerSlice';

const initialState: { config: BarChartConfig | undefined } = {
    config: undefined,
};

export const barChartConfigSlice = createSlice({
    name: 'barChartConfig',
    initialState,
    reducers: {
        setXAxisLabel: ({ config }, action: PayloadAction<string>) => {
            if (config?.axes) {
                config.axes.x.label = action.payload;
            }
        },
        setYAxisLabel: ({ config }, action: PayloadAction<string>) => {
            if (config?.axes) {
                config.axes.y[0].label = action.payload;
            }
        },
        setSeriesLabel: (
            { config },
            action: PayloadAction<{ index: number; label: string }>,
        ) => {
            if (config?.series) {
                config.series[action.payload.index].name = action.payload.label;
            }
        },
    },
    extraReducers: (builder) => {
        builder.addCase(setInitialResultsAndSeries, (state, action) => {
            if (state.config === undefined) {
                const fieldIds = Object.keys(action.payload[0]);
                state.config = {
                    metadata: {
                        version: 1,
                    },
                    type: ChartKind.VERTICAL_BAR,
                    style: {
                        legend: {
                            position: 'top',
                            align: 'center',
                        },
                    },
                    axes: {
                        x: {
                            reference: fieldIds[0],
                            label: fieldIds[0],
                        },
                        y: [
                            {
                                reference: fieldIds[1],
                                label: fieldIds[1],
                            },
                        ],
                    },
                    series: fieldIds.slice(1).map((reference, index) => ({
                        reference,
                        name: reference,
                        yIndex: index,
                    })),
                };
            }
        });
        builder.addCase(setSaveChartData, (state, action) => {
            if (action.payload.config.type === ChartKind.VERTICAL_BAR) {
                state.config = action.payload.config;
            }
        });
    },
});

export const { setXAxisLabel, setYAxisLabel, setSeriesLabel } =
    barChartConfigSlice.actions;
