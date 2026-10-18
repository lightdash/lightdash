// FIXES ts2742 issue with configureStore
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';
import { configureStore } from '@reduxjs/toolkit';
import {
    funnelBuilderListenerMiddleware,
    funnelBuilderSlice,
} from '../../funnelBuilder/store';
import { metricsCatalogSlice } from '../../metricsCatalog/store/metricsCatalogSlice';
import { sqlRunnerSlice } from './sqlRunnerSlice';

// TODO: move this store to `frontend/src`
export const store = configureStore({
    reducer: {
        // TODO: important because selectors assume that
        [sqlRunnerSlice.name]: sqlRunnerSlice.reducer,
        [metricsCatalogSlice.name]: metricsCatalogSlice.reducer,
        [funnelBuilderSlice.name]: funnelBuilderSlice.reducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().prepend(
            funnelBuilderListenerMiddleware.middleware,
        ),
    devTools: process.env.NODE_ENV === 'development',
});

export type RootState = ReturnType<typeof store.getState>;

export type AppDispatch = typeof store.dispatch;
