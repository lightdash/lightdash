import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

export interface SemanticViewerState {
    projectUuid?: string;
}

const initialState: SemanticViewerState = {
    projectUuid: undefined,
};

export const semanticViewerSlice = createSlice({
    name: 'semanticViewer',
    initialState,
    reducers: {
        resetState: () => {
            return initialState;
        },
        setProjectUuid: (state, action: PayloadAction<string>) => {
            state.projectUuid = action.payload;
        },
    },
});

export const { setProjectUuid, resetState } = semanticViewerSlice.actions;
