import { configureStore } from '@reduxjs/toolkit';
import { explorerReducer } from './explorerSlice';

// Factory function to create a new store instance
// This prevents state leaking between different explorer instances
export const createExplorerStore = () =>
    configureStore({
        reducer: {
            explorer: explorerReducer,
        },
    });

// Keep singleton for backward compatibility (Explorer.tsx uses it)
export const explorerStore = createExplorerStore();

export type ExplorerStoreState = ReturnType<typeof explorerStore.getState>;
export type ExplorerStoreDispatch = typeof explorerStore.dispatch;

// Export the actions and selectors for easy access
export { explorerActions } from './explorerSlice';
export * from './hooks';
export * from './selectors';
export { useExplorerInitialization } from './useExplorerInitialization';
