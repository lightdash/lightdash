import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

export interface SqlRunnerState {
    projectUuid: string;
    activeTable: string | undefined;
}

// TODO: this could go somewhere else
export type BarChartConfig = {
    metadata: {
        version: number;
    };
    // TODO: There was some back and forth about whether this should be 'defaultType'
    // I'm not sure
    type: 'barChart';
    style: {
        legend:
            | {
                  position: 'top' | 'bottom' | 'left' | 'right';
                  align: 'start' | 'center' | 'end';
              }
            | undefined;
    };
    axis: {
        x: {
            reference: string;
            label: string;
        };
        y: {
            reference: string;
            position: 'left' | 'right';
            label: string;
        }[];
    };
    series: {
        reference: string;
        yIndex: number;
    }[];
};

const initialState: SqlRunnerState = {
    projectUuid: '',
    activeTable: undefined,
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
