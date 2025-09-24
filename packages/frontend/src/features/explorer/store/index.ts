import { configureStore } from '@reduxjs/toolkit';
import { explorerReducer } from './explorerSlice';

export const explorerStore = configureStore({
    reducer: {
        explorer: explorerReducer,
    },
});

export type ExplorerStoreState = ReturnType<typeof explorerStore.getState>;
export type ExplorerStoreDispatch = typeof explorerStore.dispatch;

// Export the actions and selectors for easy access
export { explorerActions } from './explorerSlice';
export * from './hooks';
export * from './selectors';
export { useExplorerInitialization } from './useExplorerInitialization';
