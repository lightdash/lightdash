import {
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

    selectedDimensions: Pick<SemanticLayerField, 'name'>[];
    selectedTimeDimensions: Pick<
        SemanticLayerTimeDimension,
        'name' | 'granularity'
    >[];
    selectedMetrics: Pick<SemanticLayerField, 'name'>[];

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
        toggleDimension: (
            state,
            action: PayloadAction<Pick<SemanticLayerField, 'name' | 'kind'>>,
        ) => {
            if (!state.view) {
                throw new Error('Impossible state');
            }

            if (
                state.selectedDimensions.some(
                    (f) => f.name === action.payload.name,
                )
            ) {
                state.selectedDimensions = state.selectedDimensions.filter(
                    (f) => f.name !== action.payload.name,
                );
            } else {
                state.selectedDimensions.push(action.payload);
            }
        },
        toggleTimeDimension: (
            state,
            action: PayloadAction<
                Pick<SemanticLayerTimeDimension, 'name' | 'granularity'>
            >,
        ) => {
            if (!state.view) {
                throw new Error('Impossible state');
            }

            if (
                state.selectedTimeDimensions.some(
                    (f) => f.name === action.payload.name,
                )
            ) {
                state.selectedTimeDimensions =
                    state.selectedTimeDimensions.filter(
                        (f) => f.name !== action.payload.name,
                    );
            } else {
                state.selectedTimeDimensions.push(action.payload);
            }
        },
        toggleMetric: (
            state,
            action: PayloadAction<Pick<SemanticLayerField, 'name' | 'kind'>>,
        ) => {
            if (!state.view) {
                throw new Error('Impossible state');
            }

            if (
                state.selectedMetrics.some(
                    (f) => f.name === action.payload.name,
                )
            ) {
                state.selectedMetrics = state.selectedMetrics.filter(
                    (f) => f.name !== action.payload.name,
                );
            } else {
                state.selectedMetrics.push(action.payload);
            }
        },
    },
});

export const {
    resetState,
    setProjectUuid,
    enterView,
    exitView,
    toggleDimension,
    toggleTimeDimension,
    toggleMetric,
    setResults,
} = semanticViewerSlice.actions;
