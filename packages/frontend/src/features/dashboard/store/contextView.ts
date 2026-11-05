import { createSelector, type Store } from '@reduxjs/toolkit';
import { createStructuredSelector } from 'reselect';
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
    selectProjectUuid,
    selectRefreshDashboardVersion,
    selectTemporaryFilterLocks,
} from './dashboardSourceSelectors';

const selectContextValues = createStructuredSelector({
    projectUuid: selectProjectUuid,
    includeUnpublishedDraft: selectIncludeUnpublishedDraft,
    isDashboardLoading: selectIsDashboardLoading,
    dashboard: selectDashboard,
    dashboardError: selectDashboardError,
    allFilterableFieldsMap: selectAllFilterableFieldsMap,
    allFilterableMetricsMap: selectAllFilterableMetricsMap,
    hiddenFilterableFieldIds: selectHiddenFilterableFieldIds,
    allFilterableFields: selectAllFilterableFields,
    allFilterableMetrics: selectAllFilterableMetrics,
    isLoadingDashboardFilters: selectIsLoadingDashboardFilters,
    isFetchingDashboardFilters: selectIsFetchingDashboardFilters,
    filterableFieldsByTileUuid: selectFilterableFieldsByTileUuid,
    temporaryFilterLocks: selectTemporaryFilterLocks,
    hasTilesThatSupportFilters: selectHasTilesThatSupportFilters,
    dashboardCommentsCheck: selectDashboardCommentsCheck,
    dashboardComments: selectDashboardComments,
    hasTileComments: selectHasTileComments,
    refreshDashboardVersion: selectRefreshDashboardVersion,
});

type DashboardContextView = (
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
        [selectContextValues],
        (values): DashboardContextType => ({ ...actions, ...values }),
    );
    views.set(store, view);
    return view;
};
