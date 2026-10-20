import { configureStore } from '@reduxjs/toolkit';
import {
    dashboardChartSortReducer,
    type DashboardChartSortState,
} from './dashboardChartSortReducer';
import {
    dashboardDateZoomReducer,
    type DashboardDateZoomState,
} from './dashboardDateZoomReducer';
import {
    dashboardFiltersReducer,
    type DashboardFiltersState,
} from './dashboardFiltersReducer';
import {
    dashboardParametersReducer,
    type DashboardParametersState,
} from './dashboardParametersReducer';
import {
    dashboardTileStatusReducer,
    type DashboardTileStatusState,
} from './dashboardTileStatusReducer';

export type DashboardStoreState = {
    filters: DashboardFiltersState;
    parameters: DashboardParametersState;
    dateZoom: DashboardDateZoomState;
    tileStatus: DashboardTileStatusState;
    chartSort: DashboardChartSortState;
};

// One store per mounted dashboard
export const createDashboardStore = (preloadedState: DashboardStoreState) =>
    configureStore({
        reducer: {
            filters: dashboardFiltersReducer,
            parameters: dashboardParametersReducer,
            dateZoom: dashboardDateZoomReducer,
            tileStatus: dashboardTileStatusReducer,
            chartSort: dashboardChartSortReducer,
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
export { dashboardDateZoomActions } from './dashboardDateZoomReducer';
export { dashboardTileStatusActions } from './dashboardTileStatusReducer';
export { dashboardChartSortActions } from './dashboardChartSortReducer';
export * from './hooks';
export { hasSavedFiltersOverrides } from './savedFilterOverrides';
export * from './selectors';
