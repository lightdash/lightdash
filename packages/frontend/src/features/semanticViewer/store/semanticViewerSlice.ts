import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

export interface SemanticViewerState {
    projectUuid: string;

    view: string | undefined;
    selectedFields: Set<string>;
}

const initialState: SemanticViewerState = {
    projectUuid: '',

    view: undefined,
    selectedFields: new Set<string>(),
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
            state.selectedFields = new Set<string>();
        },
        toggleField: (state, action: PayloadAction<string>) => {
            if (!state.view) {
                throw new Error('Impossible state');
            }

            if (state.selectedFields.has(action.payload)) {
                state.selectedFields.delete(action.payload);
            } else {
                state.selectedFields.add(action.payload);
            }
        },
    },
});

export const { resetState, setProjectUuid, enterView, exitView, toggleField } =
    semanticViewerSlice.actions;
