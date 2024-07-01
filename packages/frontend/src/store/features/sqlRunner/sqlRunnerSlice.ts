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
        // setActiveFields: (state, action: PayloadAction<string>) => {
        //     // Redux Toolkit allows us to write "mutating" logic in reducers. It
        //     // doesn't actually mutate the state because it uses the Immer library,
        //     // which detects changes to a "draft state" and produces a brand new
        //     // immutable state based off those changes
        //   state.activeFields
        // },
        setActiveFields: (state, action: PayloadAction<string>) => {
            // JS Sets are not advised to be used in Redux state
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

// Action creators are generated for each case reducer function
export const { setActiveTable, setActiveFields } = sqlRunnerSlice.actions;

export default sqlRunnerSlice.reducer;
