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
    dashboardEditReducer,
    type DashboardEditState,
} from './dashboardEditReducer';
import {
    dashboardFiltersReducer,
    type DashboardFiltersState,
} from './dashboardFiltersReducer';
import {
    dashboardParametersReducer,
    type DashboardParametersState,
} from './dashboardParametersReducer';
import {
    dashboardSourceReducer,
    type DashboardSourceState,
} from './dashboardSourceReducer';
import {
    dashboardTileStatusReducer,
    type DashboardTileStatusState,
} from './dashboardTileStatusReducer';

export type DashboardStoreState = {
    source: DashboardSourceState;
    filters: DashboardFiltersState;
    parameters: DashboardParametersState;
    dateZoom: DashboardDateZoomState;
    tileStatus: DashboardTileStatusState;
    edit: DashboardEditState;
    chartSort: DashboardChartSortState;
};

// One store per mounted dashboard
export const createDashboardStore = (preloadedState: DashboardStoreState) =>
    configureStore({
        reducer: {
            source: dashboardSourceReducer,
            filters: dashboardFiltersReducer,
            parameters: dashboardParametersReducer,
            dateZoom: dashboardDateZoomReducer,
            tileStatus: dashboardTileStatusReducer,
            edit: dashboardEditReducer,
            chartSort: dashboardChartSortReducer,
        },
        preloadedState,
        middleware: (getDefaultMiddleware) =>
            // Filter values can hold Date objects; `source` holds react-query results
            getDefaultMiddleware({
                serializableCheck: false,
                immutableCheck: { ignoredPaths: ['source'] },
            }),
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
export {
    dashboardEditActions,
    getSavedDateZoomSettings,
} from './dashboardEditReducer';
export type { DashboardEditState } from './dashboardEditReducer';
export {
    selectActiveTab,
    selectActiveTabUuid,
    selectCanRedoTileLayout,
    selectCanUndoTileLayout,
    selectControlOrder,
    selectControlSections,
    selectDashboardCustomMetrics,
    selectDashboardTabs,
    selectDashboardTiles,
    selectDateZoomGranularities,
    selectDefaultDateZoomGranularity,
    selectHasControlOrderChanged,
    selectHasDefaultDateZoomGranularityChanged,
    selectHaveControlSectionsChanged,
    selectHaveCustomMetricsChanged,
    selectHaveDateZoomGranularitiesChanged,
    selectHaveTabsChanged,
    selectHaveTilesChanged,
    selectIsAddFilterDisabled,
    selectIsDateZoomDisabled,
    selectSavedChartUuidsAndTileUuids,
    selectSavedChartUuidsAndTileUuidsKey,
    selectTileQuerySources,
    selectTileQuerySourcesKey,
    selectTileUuidsKey,
} from './dashboardEditSelectors';
export * from './editHooks';
export { dashboardChartSortActions } from './dashboardChartSortReducer';
export {
    dashboardSourceActions,
    initialDashboardProviderState,
} from './dashboardSourceReducer';
export type {
    DashboardProviderState,
    DashboardSourceState,
} from './dashboardSourceReducer';
export {
    getFilterableFieldsByTileUuid,
    getTemporaryFilterLocks,
    selectEmbedDashboard,
} from './dashboardSourceSelectors';
export { getDashboardContextView } from './contextView';
export * from './hooks';
export { hasSavedFiltersOverrides } from './savedFilterOverrides';
export * from './selectors';
