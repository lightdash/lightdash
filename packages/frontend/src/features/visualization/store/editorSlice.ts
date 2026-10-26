import { type PayloadAction } from '@reduxjs/toolkit';

export type EditorFieldUpdate<S> = {
    [K in keyof S]: { key: K; value: S[K] };
}[keyof S];

/**
 * Case reducers shared by every chart type's editor slice. The slice is
 * `null` until the chart type's adapter mounts and seeds it from the chart
 * config, and `null` again once the adapter unmounts.
 */
export const editorCaseReducers = <S extends object>() => ({
    init: (_state: S | null, action: PayloadAction<S>) => action.payload,
    clear: () => null,
    set: (state: S | null, action: PayloadAction<EditorFieldUpdate<S>>) => {
        if (!state) return;
        Object.assign(state, { [action.payload.key]: action.payload.value });
    },
});
