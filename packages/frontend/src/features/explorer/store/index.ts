import { configureStore } from '@reduxjs/toolkit';
import { explorerReducer, type ExplorerSliceState } from './explorerSlice';

export type ExplorerRootState = { explorer: ExplorerSliceState };

// Factory function to create a new store instance with optional preloaded state
// This prevents state leaking between different explorer instances
export const createExplorerStore = (
    preloadedState?: Partial<ExplorerRootState>,
) =>
    configureStore({
        reducer: {
            explorer: explorerReducer,
        },
        preloadedState: preloadedState as ExplorerRootState | undefined,
    });

// Keep singleton for backward compatibility (Explorer.tsx uses it)
export const explorerStore = createExplorerStore();

export type ExplorerStoreState = ReturnType<typeof explorerStore.getState>;
export type ExplorerStoreDispatch = typeof explorerStore.dispatch;

// Export the actions and selectors for easy access
export { buildInitialExplorerState } from './buildInitialState';
export { explorerActions } from './explorerSlice';
export * from './hooks';
export * from './selectors';
