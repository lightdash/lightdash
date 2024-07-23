import { type BarChartConfig } from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

const initialState: BarChartConfig | undefined = undefined;

export const barChartSlice = createSlice({
    name: 'barChartConfig',
    initialState,
    reducers: {
        setXAxisLabel: (state, action: PayloadAction<string>) => {
            if (state?.axes) {
                state.axes.x.label = action.payload;
            }
        },
        setYAxisLabel: (state, action: PayloadAction<string>) => {
            if (state.barChartConfig) {
                state.barChartConfig.axes.y[0].label = action.payload;
            }
        },
        setSeriesLabel: (
            state,
            action: PayloadAction<{ index: number; label: string }>,
        ) => {
            if (state.barChartConfig) {
                state.barChartConfig.series[action.payload.index].name =
                    action.payload.label;
            }
        },
    },
});

export const { setXAxisLabel, setYAxisLabel, setSeriesLabel } =
    barChartSlice.actions;
