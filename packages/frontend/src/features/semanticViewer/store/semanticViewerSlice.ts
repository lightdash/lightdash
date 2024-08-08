import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

export interface SemanticViewerState {
    projectUuid: string;

    view: string | undefined;
    selectedFields: string[];
}

const initialState: SemanticViewerState = {
    projectUuid: '',

    view: undefined,
    selectedFields: [],
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
        enterView: (state, action: PayloadAction<string>) => {
            state.view = action.payload;
        },
        exitView: (state) => {
            state.view = undefined;
            state.selectedFields = [];
        },
        toggleField: (state, action: PayloadAction<string>) => {
            if (!state.view) {
                throw new Error('Impossible state');
            }

            const index = state.selectedFields.indexOf(action.payload);

            if (index === -1) {
                state.selectedFields.push(action.payload);
            } else {
                state.selectedFields.splice(index, 1);
            }
        },
    },
});

export const { resetState, setProjectUuid, enterView, exitView, toggleField } =
    semanticViewerSlice.actions;
