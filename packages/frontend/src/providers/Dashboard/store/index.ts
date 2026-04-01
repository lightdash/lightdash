import { configureStore } from '@reduxjs/toolkit';
import dashboardDataReducer from './dashboardDataSlice';
import dashboardFiltersReducer from './dashboardFiltersSlice';
import dashboardTileStatusReducer from './dashboardTileStatusSlice';

export function createDashboardStore() {
    return configureStore({
        reducer: {
            dashboardData: dashboardDataReducer,
            dashboardFilters: dashboardFiltersReducer,
            dashboardTileStatus: dashboardTileStatusReducer,
        },
        middleware: (getDefaultMiddleware) =>
            getDefaultMiddleware({
                // We store non-serializable values (Set, Date, etc.) in the store
                serializableCheck: false,
            }),
    });
}

export type DashboardStore = ReturnType<typeof createDashboardStore>;
export type DashboardStoreState = ReturnType<DashboardStore['getState']>;
export type DashboardStoreDispatch = DashboardStore['dispatch'];
