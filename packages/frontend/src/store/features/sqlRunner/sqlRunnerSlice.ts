import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { uniq } from 'lodash';

export interface SqlRunnerState {
    projectUuid: string;
    activeTable: string | undefined;
    activeFields: string[] | undefined;
}

const initialState: SqlRunnerState = {
    projectUuid: '',
    activeTable: undefined,
    activeFields: undefined,
};

const sqlRunnerSlice = createSlice({
    name: 'sqlRunner',
    initialState,
    reducers: {
        setActiveFields: (state, action: PayloadAction<string>) => {
            state.activeFields = uniq([
                ...(state.activeFields ?? []),
                action.payload,
            ]);
        },
        setActiveTable: (state, action: PayloadAction<string | undefined>) => {
            state.activeTable = action.payload;
            state.activeFields = undefined;
        },
    },
});

export const { setActiveTable, setActiveFields } = sqlRunnerSlice.actions;

export default sqlRunnerSlice.reducer;
