import { isFormat, type CartesianChartDisplay } from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// Removes a lot of boilerplate to check for unset top-level properties
type SliceState = Required<CartesianChartDisplay>;

const initialState: SliceState = {
    xAxis: {},
    yAxis: [],
    series: {},
};

const cartesianChartDisplaySlice = createSlice({
    name: 'cartesianChartDisplaySlice',
    initialState,
    reducers: {
        setXAxisLabel: (state, action: PayloadAction<{ label: string }>) => {
            state.xAxis.label = action.payload.label;
        },
        setYAxisLabel: (
            state,
            action: PayloadAction<{ yIndex: number; label: string }>,
        ) => {
            const { yIndex, label } = action.payload;
            if (state.yAxis[yIndex] === undefined) {
                state.yAxis[yIndex] = {};
            }
            state.yAxis[yIndex].label = label;
        },
        setSeriesLabel: (
            state,
            action: PayloadAction<{ seriesKey: string; label: string }>,
        ) => {
            const { seriesKey, label } = action.payload;
            if (state.series[seriesKey] === undefined)
                state.series[seriesKey] = {};
            state.series[seriesKey].label = label;
        },
        setSeriesYAxisIndex: (
            state,
            action: PayloadAction<{ seriesKey: string; yIndex: number }>,
        ) => {
            const { seriesKey, yIndex } = action.payload;
            if (state.series[seriesKey] === undefined)
                state.series[seriesKey] = {};
            state.series[seriesKey].yAxisIndex = yIndex;
        },
        setYAxisPosition: (
            state,
            action: PayloadAction<{ yIndex: number; position: string }>,
        ) => {
            const { yIndex, position } = action.payload;
            if (state.yAxis[yIndex] === undefined) state.yAxis[yIndex] = {};
            state.yAxis[yIndex].position = position;
        },
        setYAxisFormat: (
            state,
            action: PayloadAction<{ format: string; yIndex: number }>,
        ) => {
            const { format, yIndex } = action.payload;
            if (!isFormat(format)) {
                return;
            }
            if (state.yAxis[yIndex] === undefined) state.yAxis[yIndex] = {};
            state.yAxis[yIndex].format = format;
            // Missing some logic for series
        },
        setSeriesFormat: (
            state,
            action: PayloadAction<{ seriesKey: string; format: string }>,
        ) => {
            const { seriesKey, format } = action.payload;
            if (!isFormat(format)) return;
            if (state.series[seriesKey] === undefined)
                state.series[seriesKey] = {};
            state.series[seriesKey].format = format;
            // missing logic for axis
        },
    },
});
