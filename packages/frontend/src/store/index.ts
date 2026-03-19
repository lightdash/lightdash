// FIXES ts2742 issue with configureStore
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';
import { configureStore } from '@reduxjs/toolkit';
import { dashboardTileLoadingReducer } from '../features/dashboard/store/dashboardTileLoadingSlice';

/**
 * Root Redux store for the Lightdash app.
 *
 * All new slices should be added here. Existing feature-scoped stores
 * (SQL Runner, Explorer, AI Copilot) can be migrated here over time.
 */
export const store = configureStore({
    reducer: {
        dashboardTileLoading: dashboardTileLoadingReducer,
    },
    devTools: process.env.NODE_ENV === 'development',
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
