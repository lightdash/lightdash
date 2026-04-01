// FIXES ts2742 issue with configureStore
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';
import { configureStore } from '@reduxjs/toolkit';
import { dashboardDataReducer } from './dashboardDataSlice';
import { dashboardFiltersReducer } from './dashboardFiltersSlice';
import { dashboardTileStatusReducer } from './dashboardTileStatusSlice';

// ts-unused-exports:disable-next-line
export const createDashboardStore = () =>
    configureStore({
        reducer: {
            dashboardData: dashboardDataReducer,
            dashboardFilters: dashboardFiltersReducer,
            dashboardTileStatus: dashboardTileStatusReducer,
        },
        middleware: (getDefaultMiddleware) =>
            getDefaultMiddleware({
                serializableCheck: {
                    ignoredPaths: [
                        'dashboardTileStatus.oldestCacheTime',
                        'dashboardData.dashboard',
                        'dashboardData.dashboardCommentsCheck',
                        'dashboardData.dashboardComments',
                        'dashboardFilters.embedDashboard',
                    ],
                    ignoredActionPaths: ['payload'],
                },
            }),
        devTools: process.env.NODE_ENV === 'development',
    });

type DashboardStore = ReturnType<typeof createDashboardStore>;
// ts-unused-exports:disable-next-line
export type DashboardStoreState = ReturnType<DashboardStore['getState']>;
// ts-unused-exports:disable-next-line
export type DashboardStoreDispatch = DashboardStore['dispatch'];
