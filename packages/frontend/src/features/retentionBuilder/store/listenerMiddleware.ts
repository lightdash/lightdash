// FIXES ts2742 issue with configureStore
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';
import { createListenerMiddleware } from '@reduxjs/toolkit';
import type { AppDispatch, RootState } from '../../sqlRunner/store';
import {
    addRetentionConfigChangeListener,
    addRetentionEventFieldChangeListener,
    addRetentionExploreChangeListener,
} from './retentionBuilderListeners';

export const retentionBuilderListenerMiddleware = createListenerMiddleware();

export const startAppListening =
    retentionBuilderListenerMiddleware.startListening.withTypes<
        RootState,
        AppDispatch
    >();

addRetentionConfigChangeListener(startAppListening);
addRetentionExploreChangeListener(startAppListening);
addRetentionEventFieldChangeListener(startAppListening);
