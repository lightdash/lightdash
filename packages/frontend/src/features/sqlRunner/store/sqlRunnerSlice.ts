import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

export interface SqlRunnerState {
    projectUuid: string;
    activeTable: string | undefined;
}

const initialState: SqlRunnerState = {
    projectUuid: '',
    activeTable: undefined,
};

const sqlRunnerSlice = createSlice({
    name: 'sqlRunner',
    initialState,
    reducers: {
        setActiveTable: (state, action: PayloadAction<string | undefined>) => {
            state.activeTable = action.payload;
        },
    },
});

export const { setActiveTable } = sqlRunnerSlice.actions;

export default sqlRunnerSlice.reducer;
