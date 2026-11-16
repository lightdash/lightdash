import {
    getItemId,
    type Dashboard,
    type DashboardAvailableFilters,
    type DashboardFilterableField,
    type DashboardFilters,
    type FilterableDimension,
    type Metric,
    type DashboardAvailableFiltersTile,
} from '@lightdash/common';
import { createSelector } from '@reduxjs/toolkit';
import { type DashboardStoreState } from '.';
import { selectSavedChartUuidsAndTileUuids } from './dashboardEditSelectors';
import { type TemporaryFilterLocks } from './selectors';

export const selectProjectUuid = (state: DashboardStoreState) =>
    state.source.projectUuid;
export const selectIncludeUnpublishedDraft = (state: DashboardStoreState) =>
    state.source.includeUnpublishedDraft;
const selectEmbedToken = (state: DashboardStoreState) =>
    state.source.embedToken;
const selectQueryDashboard = (state: DashboardStoreState) =>
    state.source.queryDashboard;
export const selectEmbedDashboard = (state: DashboardStoreState) =>
    state.source.embedDashboard;
/** The dashboard from the query, or the one an embed set */
export const selectDashboard = (state: DashboardStoreState) =>
    state.source.queryDashboard ?? state.source.embedDashboard;
export const selectIsDashboardLoading = (state: DashboardStoreState) =>
    state.source.isDashboardLoading;
export const selectDashboardError = (state: DashboardStoreState) =>
    state.source.dashboardError;
const selectAvailableFilters = (state: DashboardStoreState) =>
    state.source.availableFilters;
export const selectIsLoadingDashboardFilters = (state: DashboardStoreState) =>
    state.source.isLoadingDashboardFilters;
export const selectIsFetchingDashboardFilters = (state: DashboardStoreState) =>
    state.source.isFetchingDashboardFilters;
export const selectDashboardCommentsCheck = (state: DashboardStoreState) =>
    state.source.dashboardCommentsCheck;
export const selectDashboardComments = (state: DashboardStoreState) =>
    state.source.dashboardComments;
export const selectRefreshDashboardVersion = (state: DashboardStoreState) =>
    state.source.refreshDashboardVersion;

export const selectAllFilterableFields = (state: DashboardStoreState) =>
    state.source.availableFilters?.allFilterableFields;
export const selectAllFilterableMetrics = (state: DashboardStoreState) =>
    state.source.availableFilters?.allFilterableMetrics;

/** The filterable fields of each chart tile; undefined until the dashboard and its filters loaded */
export const getFilterableFieldsByTileUuid = (
    dashboard: Dashboard | undefined,
    embedToken: string | undefined,
    savedChartUuidsAndTileUuids: DashboardAvailableFiltersTile[] | undefined,
    availableFilters: DashboardAvailableFilters | undefined,
) => {
    // Embeds have no query dashboard, so they skip the dashboard check
    if (
        (!dashboard && !embedToken) ||
        !savedChartUuidsAndTileUuids ||
        !availableFilters
    )
        return undefined;

    return savedChartUuidsAndTileUuids.reduce<
        Record<string, DashboardFilterableField[]>
    >((acc, { tileUuid }) => {
        const dimensionFields =
            availableFilters.savedQueryFilters[tileUuid]?.map(
                (index) => availableFilters.allFilterableFields[index],
            ) ?? [];
        const metricFields =
            availableFilters.savedQueryMetricFilters[tileUuid]?.map(
                (index) => availableFilters.allFilterableMetrics[index],
            ) ?? [];
        const combined = [...dimensionFields, ...metricFields];
        if (combined.length > 0) {
            acc[tileUuid] = combined;
        }
        return acc;
    }, {});
};

export const selectFilterableFieldsByTileUuid = createSelector(
    [
        selectQueryDashboard,
        selectEmbedToken,
        selectSavedChartUuidsAndTileUuids,
        selectAvailableFilters,
    ],
    getFilterableFieldsByTileUuid,
);

const emptyFieldsMap: Record<string, FilterableDimension> = {};
export const selectAllFilterableFieldsMap = createSelector(
    [selectAllFilterableFields],
    (fields) =>
        fields && fields.length > 0
            ? Object.fromEntries(
                  fields.map((field) => [getItemId(field), field]),
              )
            : emptyFieldsMap,
);

const emptyMetricsMap: Record<string, Metric> = {};
export const selectAllFilterableMetricsMap = createSelector(
    [selectAllFilterableMetrics],
    (metrics) =>
        metrics && metrics.length > 0
            ? Object.fromEntries(
                  metrics.map((metric) => [getItemId(metric), metric]),
              )
            : emptyMetricsMap,
);

export const selectHiddenFilterableFieldIds = createSelector(
    [selectAvailableFilters],
    (availableFilters): ReadonlySet<string> =>
        new Set(availableFilters?.hiddenFilterableFieldIds),
);

const selectSavedFiltersForLocks = (state: DashboardStoreState) =>
    state.source.queryDashboard?.filters;
const selectHasTabsForLocks = (state: DashboardStoreState) =>
    (state.source.queryDashboard?.tabs?.length ?? 0) > 0;

// Temporary filters may not override a filter locked on the active tab;
// embeds don't load the dashboard through the query, so nothing is locked.
export const getTemporaryFilterLocks = (
    savedFilters: DashboardFilters | undefined,
    hasTabs: boolean,
): TemporaryFilterLocks | undefined =>
    savedFilters ? { savedFilters, hasTabs } : undefined;

export const selectTemporaryFilterLocks = createSelector(
    [selectSavedFiltersForLocks, selectHasTabsForLocks],
    getTemporaryFilterLocks,
);

export const selectHasTileComments = createSelector(
    [selectDashboardComments],
    (comments) => (tileUuid: string) =>
        !!(comments && comments[tileUuid] && comments[tileUuid].length > 0),
);
