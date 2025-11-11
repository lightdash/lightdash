import { configureStore } from '@reduxjs/toolkit';
import { explorerReducer, type ExplorerSliceState } from './explorerSlice';

export type ExplorerRootState = { explorer: ExplorerSliceState };

// Factory function to create a new store instance.
// We create a new store each time the explorer is mounted
export const createExplorerStore = (
    preloadedState?: Partial<ExplorerRootState>,
) =>
    configureStore({
        reducer: {
            explorer: explorerReducer,
        },
        preloadedState: preloadedState as ExplorerRootState | undefined,
    });

type ExplorerStore = ReturnType<typeof createExplorerStore>;
export type ExplorerStoreState = ReturnType<ExplorerStore['getState']>;
export type ExplorerStoreDispatch = ExplorerStore['dispatch'];

export { buildInitialExplorerState } from './buildInitialState';
export { explorerActions } from './explorerSlice';
export * from './hooks';
export * from './selectors';
