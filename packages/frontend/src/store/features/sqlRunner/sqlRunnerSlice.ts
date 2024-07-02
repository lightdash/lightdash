import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

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
            const field = action.payload;
            const stateFields = state.activeFields ?? [];
            const index = stateFields.indexOf(field);

            if (index === -1) {
                state.activeFields = [...stateFields, field];
            } else {
                state.activeFields = [
                    ...stateFields.slice(0, index),
                    ...stateFields.slice(index + 1),
                ];
            }
        },
        setActiveTable: (state, action: PayloadAction<string | undefined>) => {
            state.activeTable = action.payload;
            state.activeFields = undefined;
        },
    },
});

export const { setActiveTable, setActiveFields } = sqlRunnerSlice.actions;

export default sqlRunnerSlice.reducer;
