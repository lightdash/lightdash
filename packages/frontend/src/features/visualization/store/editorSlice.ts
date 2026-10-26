import { type PayloadAction } from '@reduxjs/toolkit';

export type EditorFieldUpdate<S> = {
    [K in keyof S]: { key: K; value: S[K] };
}[keyof S];

/**
 * Case reducers shared by every chart type's editor slice. A slice is seeded
 * by `buildInitialVisualizationState` for the mounted chart type and stays
 * `null` for the others.
 */
export const editorCaseReducers = <S extends object>() => ({
    set: (state: S | null, action: PayloadAction<EditorFieldUpdate<S>>) => {
        if (!state) return;
        Object.assign(state, { [action.payload.key]: action.payload.value });
    },
});
