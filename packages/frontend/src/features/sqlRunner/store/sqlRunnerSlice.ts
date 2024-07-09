import { type BarChartConfig } from '@lightdash/common/src/types/visualizations';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

export interface SqlRunnerState {
    projectUuid: string;
    activeTable: string | undefined;
    chartConfig: BarChartConfig | undefined;
}

const initialState: SqlRunnerState = {
    projectUuid: '',
    activeTable: undefined,
    chartConfig: {
        metadata: {
            version: 1,
        },
        type: 'barChart',
        style: {
            legend: {
                position: 'top',
                align: 'start',
            },
        },
        axesConfig: {
            x: {
                reference: 'status',
                label: 'moo',
            },
            y: [
                {
                    reference: 'total_amount',
                    position: 'left',
                    label: 'baz',
                },
            ],
        },
        seriesConfig: [],
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
