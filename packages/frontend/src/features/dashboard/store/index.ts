import { configureStore } from '@reduxjs/toolkit';
import {
    dashboardFiltersReducer,
    type DashboardFiltersState,
} from './dashboardFiltersReducer';
import {
    dashboardParametersReducer,
    type DashboardParametersState,
} from './dashboardParametersReducer';

export type DashboardStoreState = {
    filters: DashboardFiltersState;
    parameters: DashboardParametersState;
};

// One store per mounted dashboard
export const createDashboardStore = (preloadedState: DashboardStoreState) =>
    configureStore({
        reducer: {
            filters: dashboardFiltersReducer,
            parameters: dashboardParametersReducer,
        },
        preloadedState,
        middleware: (getDefaultMiddleware) =>
            // Filter values can hold Date objects from the date inputs
            getDefaultMiddleware({ serializableCheck: false }),
    });

export type DashboardStore = ReturnType<typeof createDashboardStore>;
export type DashboardStoreDispatch = DashboardStore['dispatch'];

export { DashboardStoreContext } from './context';
export { buildInitialDashboardState } from './buildInitialState';
export type { DashboardUrlRestoreErrors } from './buildInitialState';
export {
    dashboardFiltersActions,
    emptyDashboardFilters,
} from './dashboardFiltersReducer';
export { dashboardParametersActions } from './dashboardParametersReducer';
export * from './hooks';
export { hasSavedFiltersOverrides } from './savedFilterOverrides';
export * from './selectors';
