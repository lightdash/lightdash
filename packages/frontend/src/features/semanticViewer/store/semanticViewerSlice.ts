import {
    FieldType as FieldKind,
    SemanticLayerFieldType,
    type ResultRow,
    type SemanticLayerField,
    type SemanticLayerSortBy,
    type SemanticLayerTimeDimension,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

export interface SemanticViewerState {
    projectUuid: string;

    view: string | undefined;

    selectedDimensions: Array<string>;
    selectedMetrics: Array<string>;
    selectedTimeDimensions: Array<SemanticLayerTimeDimension>;
    sortBy: SemanticLayerSortBy[];

    results: ResultRow[] | undefined;
}

const initialState: SemanticViewerState = {
    projectUuid: '',

    view: undefined,

    selectedDimensions: [],
    selectedMetrics: [],
    selectedTimeDimensions: [],
    sortBy: [],

    results: undefined,
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
            state.selectedTimeDimensions = [];
        },
        setResults: (state, action: PayloadAction<ResultRow[]>) => {
            state.results = action.payload;
        },
        toggleField: (
            state,
            action: PayloadAction<
                Pick<SemanticLayerField, 'name' | 'kind' | 'type'>
            >,
        ) => {
            if (!state.view) {
                throw new Error('Impossible state');
            }

            console.log(action.payload);

            switch (action.payload.kind) {
                case FieldKind.DIMENSION:
                    if (action.payload.type === SemanticLayerFieldType.TIME) {
                        if (
                            state.selectedTimeDimensions.find(
                                (field) => field.name === action.payload.name,
                            )
                        ) {
                            state.selectedTimeDimensions =
                                state.selectedTimeDimensions.filter(
                                    (field) =>
                                        field.name !== action.payload.name,
                                );
                        } else {
                            state.selectedTimeDimensions.push({
                                name: action.payload.name,
                                granularity: undefined, // TODO: pass the selected granularity here
                            });
                        }
                        break;
                    }

                    if (
                        state.selectedDimensions.includes(action.payload.name)
                    ) {
                        state.selectedDimensions =
                            state.selectedDimensions.filter(
                                (field) => field !== action.payload.name,
                            );
                    } else {
                        state.selectedDimensions.push(action.payload.name);
                    }
                    break;
                case FieldKind.METRIC:
                    if (state.selectedMetrics.includes(action.payload.name)) {
                        state.selectedMetrics = state.selectedMetrics.filter(
                            (field) => field !== action.payload.name,
                        );
                    } else {
                        state.selectedMetrics.push(action.payload.name);
                    }
                    break;
                default:
                    throw new Error('Unknown field type');
            }
        },
    },
});

export const {
    resetState,
    setProjectUuid,
    enterView,
    exitView,
    toggleField,
    setResults,
} = semanticViewerSlice.actions;
