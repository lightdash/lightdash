import { FieldType as FieldKind } from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

export interface SemanticViewerState {
    projectUuid: string;

    view: string | undefined;

    selectedDimensions: Array<string>;
    selectedMetrics: Array<string>;
}

const initialState: SemanticViewerState = {
    projectUuid: '',

    view: undefined,

    selectedDimensions: [],
    selectedMetrics: [],
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
            state.selectedDimensions = [];
            state.selectedMetrics = [];
        },
        toggleField: (
            state,
            action: PayloadAction<{
                field: string;
                kind: FieldKind;
            }>,
        ) => {
            if (!state.view) {
                throw new Error('Impossible state');
            }

            console.log(action.payload);

            switch (action.payload.kind) {
                case FieldKind.DIMENSION:
                    if (
                        state.selectedDimensions.includes(action.payload.field)
                    ) {
                        state.selectedDimensions =
                            state.selectedDimensions.filter(
                                (field) => field !== action.payload.field,
                            );
                    } else {
                        state.selectedDimensions.push(action.payload.field);
                    }
                    break;
                case FieldKind.METRIC:
                    if (state.selectedMetrics.includes(action.payload.field)) {
                        state.selectedMetrics = state.selectedMetrics.filter(
                            (field) => field !== action.payload.field,
                        );
                    } else {
                        state.selectedMetrics.push(action.payload.field);
                    }
                    break;
                default:
                    throw new Error('Unknown field type');
            }
        },
    },
});

export const { resetState, setProjectUuid, enterView, exitView, toggleField } =
    semanticViewerSlice.actions;
