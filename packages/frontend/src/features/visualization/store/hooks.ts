// FIXES ts2742 issue with useDispatch and useSelector
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';
import { type ActionCreatorWithPayload } from '@reduxjs/toolkit';
import { useCallback } from 'react';
import {
    createDispatchHook,
    createSelectorHook,
    createStoreHook,
} from 'react-redux';
import {
    type VisualizationStore,
    type VisualizationStoreDispatch,
    type VisualizationStoreState,
} from '.';
import { VisualizationStoreContext } from './context';
import { type EditorFieldUpdate } from './editorSlice';

// NOTE: Use these for visualization editor state instead of plain `useDispatch` and `useSelector`
export const useVisualizationDispatch = createDispatchHook(
    VisualizationStoreContext,
).withTypes<VisualizationStoreDispatch>();
export const useVisualizationSelector = createSelectorHook(
    VisualizationStoreContext,
).withTypes<VisualizationStoreState>();
/** Reads state inside callbacks without subscribing to it */
export const useVisualizationStore = createStoreHook(
    VisualizationStoreContext,
).withTypes<VisualizationStore>();

/** A stable, key-typed setter over a slice's `set` action */
export const useEditorFieldSetter = <S extends object>(
    set: ActionCreatorWithPayload<EditorFieldUpdate<S>>,
) => {
    const dispatch = useVisualizationDispatch();
    return useCallback(
        <K extends keyof S>(key: K, value: S[K]) =>
            // A generic pair narrows to one member of the key/value union
            dispatch(set({ key, value } as EditorFieldUpdate<S>)),
        [dispatch, set],
    );
};
