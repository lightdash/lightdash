// FIXES ts2742 issue with configureStore
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';
import { createListenerMiddleware } from '@reduxjs/toolkit';
import type { AppDispatch, RootState } from '../../sqlRunner/store';
import {
    addEventFieldChangeListener,
    addFieldChangeInvalidationListener,
    addFunnelConfigChangeListener,
} from './funnelBuilderListeners';

export const funnelBuilderListenerMiddleware = createListenerMiddleware();

export const startAppListening =
    funnelBuilderListenerMiddleware.startListening.withTypes<
        RootState,
        AppDispatch
    >();

// Register listeners
addFunnelConfigChangeListener(startAppListening);
addFieldChangeInvalidationListener(startAppListening);
addEventFieldChangeListener(startAppListening);
