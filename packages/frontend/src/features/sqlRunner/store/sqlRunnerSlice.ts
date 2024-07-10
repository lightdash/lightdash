import { type BarChartConfig } from '@lightdash/common/src/types/visualizations';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

export interface SqlRunnerState {
    projectUuid: string;
    activeTable: string | undefined;
    chartConfig: BarChartConfig;
}

const initialState: SqlRunnerState = {
    projectUuid: '',
    activeTable: undefined,
    chartConfig: {
        metadata: {
            version: 1,
        },
        style: {
            legend: {
                position: 'top',
                align: 'start',
            },
        },
        axes: {
            x: {},
            y: [],
        },
        series: [],
    },
};

export const sqlRunnerSlice = createSlice({
    name: 'sqlRunner',
    initialState,
    reducers: {
        setProjectUuid: (state, action: PayloadAction<string>) => {
            state.projectUuid = action.payload;
        },
        toggleActiveTable: (
            state,
            action: PayloadAction<string | undefined>,
        ) => {
            state.activeTable = action.payload;
        },
    },
});

export const { toggleActiveTable, setProjectUuid } = sqlRunnerSlice.actions;
