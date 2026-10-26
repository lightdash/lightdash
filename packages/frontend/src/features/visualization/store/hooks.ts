// FIXES ts2742 issue with useDispatch and useSelector
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';
import {
    type ActionCreatorWithoutPayload,
    type ActionCreatorWithPayload,
} from '@reduxjs/toolkit';
import {
    useCallback,
    useLayoutEffect,
    useState,
    type SetStateAction,
} from 'react';
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

type EditorSliceActions<S> = {
    init: ActionCreatorWithPayload<S>;
    clear: ActionCreatorWithoutPayload;
};

/**
 * A chart type's editor state for the lifetime of its adapter. Seeded once
 * from the chart config on mount, like the `useState` it replaces, so a later
 * change to the saved config does not reset an edit in progress. The seed is
 * read until the store holds it, so the first render already sees it.
 */
export const useEditorState = <S extends object>(
    select: (state: VisualizationStoreState) => S | null,
    actions: EditorSliceActions<S>,
    build: () => S,
): S => {
    const dispatch = useVisualizationDispatch();
    const [seed] = useState(build);
    const stored = useVisualizationSelector(select);

    useLayoutEffect(() => {
        dispatch(actions.init(seed));
        return () => {
            dispatch(actions.clear());
        };
    }, [dispatch, actions, seed]);

    return stored ?? seed;
};

/**
 * A stable, key-typed setter over a slice's `set` action. Accepts a value or
 * a `useState`-style updater, which reads the committed value at call time.
 */
export const useEditorFieldSetter = <S extends object>(
    select: (state: VisualizationStoreState) => S | null,
    set: ActionCreatorWithPayload<EditorFieldUpdate<S>>,
) => {
    const store = useVisualizationStore();
    return useCallback(
        <K extends keyof S>(key: K, value: SetStateAction<S[K]>) => {
            let next: S[K];
            if (typeof value === 'function') {
                const current = select(store.getState());
                if (!current) return;
                next = (value as (prev: S[K]) => S[K])(current[key]);
            } else {
                next = value;
            }
            // A generic pair narrows to one member of the key/value union
            store.dispatch(set({ key, value: next } as EditorFieldUpdate<S>));
        },
        [store, select, set],
    );
};
