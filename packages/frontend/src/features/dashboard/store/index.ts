// FIXES ts2742 issue with configureStore
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';
import { configureStore } from '@reduxjs/toolkit';
import {
    dashboardTileLoadingReducer,
    type DashboardTileLoadingState,
} from './dashboardTileLoadingSlice';

export type DashboardRootState = {
    dashboardTileLoading: DashboardTileLoadingState;
};

/**
 * Factory function to create a new dashboard store instance.
 * Uses the same factory pattern as the Explorer store — each dashboard
 * mount gets its own store so state doesn't leak between navigations.
 */
export const createDashboardStore = (
    preloadedState?: Partial<DashboardRootState>,
) =>
    configureStore({
        reducer: {
            dashboardTileLoading: dashboardTileLoadingReducer,
        },
        preloadedState: preloadedState as DashboardRootState | undefined,
        devTools: process.env.NODE_ENV === 'development',
    });

type DashboardStore = ReturnType<typeof createDashboardStore>;
export type DashboardStoreState = ReturnType<DashboardStore['getState']>;
export type DashboardStoreDispatch = DashboardStore['dispatch'];
