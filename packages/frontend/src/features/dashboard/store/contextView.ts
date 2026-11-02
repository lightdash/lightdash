import { createSelector, type Store } from '@reduxjs/toolkit';
import { type DashboardStoreState } from '.';
import { type DashboardContextType } from '../../../providers/Dashboard/types';
import { createDashboardContextActions } from './contextActions';
import { selectHasTilesThatSupportFilters } from './dashboardEditSelectors';
import {
    selectAllFilterableFields,
    selectAllFilterableFieldsMap,
    selectAllFilterableMetrics,
    selectAllFilterableMetricsMap,
    selectDashboard,
    selectDashboardComments,
    selectDashboardCommentsCheck,
    selectDashboardError,
    selectFilterableFieldsByTileUuid,
    selectHasTileComments,
    selectHiddenFilterableFieldIds,
    selectIncludeUnpublishedDraft,
    selectIsDashboardLoading,
    selectIsFetchingDashboardFilters,
    selectIsLoadingDashboardFilters,
    selectIsRefreshingDashboardVersion,
    selectProjectUuid,
    selectRefreshDashboardVersion,
    selectTemporaryFilterLocks,
} from './dashboardSourceSelectors';

export type DashboardContextView = (
    state: DashboardStoreState,
) => DashboardContextType;

const views = new WeakMap<Store<DashboardStoreState>, DashboardContextView>();

/**
 * The dashboard context as a memoised view of the store: one object per
 * store that only changes when one of its values does, so a key selected
 * from it is as stable as the underlying selector.
 */
export const getDashboardContextView = (
    store: Store<DashboardStoreState>,
): DashboardContextView => {
    const cached = views.get(store);
    if (cached) return cached;
    const actions = createDashboardContextActions(store);
    const view = createSelector(
        [
            selectProjectUuid,
            selectIncludeUnpublishedDraft,
            selectIsDashboardLoading,
            selectDashboard,
            selectDashboardError,
            selectAllFilterableFieldsMap,
            selectAllFilterableMetricsMap,
            selectHiddenFilterableFieldIds,
            selectAllFilterableFields,
            selectAllFilterableMetrics,
            selectIsLoadingDashboardFilters,
            selectIsFetchingDashboardFilters,
            selectFilterableFieldsByTileUuid,
            selectTemporaryFilterLocks,
            selectHasTilesThatSupportFilters,
            selectDashboardCommentsCheck,
            selectDashboardComments,
            selectHasTileComments,
            selectRefreshDashboardVersion,
            selectIsRefreshingDashboardVersion,
        ],
        (
            projectUuid,
            includeUnpublishedDraft,
            isDashboardLoading,
            dashboard,
            dashboardError,
            allFilterableFieldsMap,
            allFilterableMetricsMap,
            hiddenFilterableFieldIds,
            allFilterableFields,
            allFilterableMetrics,
            isLoadingDashboardFilters,
            isFetchingDashboardFilters,
            filterableFieldsByTileUuid,
            temporaryFilterLocks,
            hasTilesThatSupportFilters,
            dashboardCommentsCheck,
            dashboardComments,
            hasTileComments,
            refreshDashboardVersion,
            isRefreshingDashboardVersion,
        ): DashboardContextType => ({
            ...actions,
            projectUuid,
            includeUnpublishedDraft,
            isDashboardLoading,
            dashboard,
            dashboardError,
            allFilterableFieldsMap,
            allFilterableMetricsMap,
            hiddenFilterableFieldIds,
            allFilterableFields,
            allFilterableMetrics,
            isLoadingDashboardFilters,
            isFetchingDashboardFilters,
            filterableFieldsByTileUuid,
            temporaryFilterLocks,
            hasTilesThatSupportFilters,
            dashboardCommentsCheck,
            dashboardComments,
            hasTileComments,
            refreshDashboardVersion,
            isRefreshingDashboardVersion,
        }),
    );
    views.set(store, view);
    return view;
};
