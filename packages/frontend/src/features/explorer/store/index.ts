import { configureStore } from '@reduxjs/toolkit';
import { stampChangeOrigin } from '../../../utils/changeOrigin';
import {
    emptyExplorerHistory,
    explorerRootReducer,
    type ExplorerRootState,
} from './history';

// Factory function to create a new store instance.
// We create a new store each time the explorer is mounted
export const createExplorerStore = (
    preloadedState?: Pick<ExplorerRootState, 'explorer'>,
) =>
    configureStore({
        reducer: explorerRootReducer,
        preloadedState: preloadedState && {
            ...preloadedState,
            history: emptyExplorerHistory,
        },
        middleware: (getDefaultMiddleware) =>
            getDefaultMiddleware().concat(stampChangeOrigin),
    });

type ExplorerStore = ReturnType<typeof createExplorerStore>;
export type ExplorerStoreState = ReturnType<ExplorerStore['getState']>;
export type ExplorerStoreDispatch = ExplorerStore['dispatch'];

export { buildInitialExplorerState } from './buildInitialState';
export { explorerActions } from './explorerSlice';
export {
    explorerHistoryActions,
    selectCanRedo,
    selectCanUndo,
    selectHistoryRevision,
    type ExplorerRootState,
} from './history';
export * from './hooks';
export * from './selectors';
