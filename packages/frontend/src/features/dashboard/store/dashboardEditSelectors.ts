import {
    DashboardTileTypes,
    isDashboardChartTileType,
    type DateZoomConfig,
    type SavedChartsInfoForDashboardAvailableFilters,
} from '@lightdash/common';
import { createSelector } from '@reduxjs/toolkit';
import { type DashboardStoreState } from '.';
import {
    isDateZoomConfigDraftCurrent,
    isDraftCurrent,
    type SavedDateZoomSettings,
} from './dashboardEditReducer';

export const selectDashboardTiles = (state: DashboardStoreState) =>
    state.edit.tiles;
export const selectHaveTilesChanged = (state: DashboardStoreState) =>
    state.edit.haveTilesChanged;
export const selectDashboardTabs = (state: DashboardStoreState) =>
    state.edit.tabs;
export const selectHaveTabsChanged = (state: DashboardStoreState) =>
    state.edit.haveTabsChanged;
export const selectActiveTab = (state: DashboardStoreState) =>
    state.edit.activeTab;
export const selectActiveTabUuid = (state: DashboardStoreState) =>
    state.edit.activeTab?.uuid;
export const selectDashboardCustomMetrics = (state: DashboardStoreState) =>
    state.edit.customMetrics;
export const selectHaveCustomMetricsChanged = (state: DashboardStoreState) =>
    state.edit.haveCustomMetricsChanged;
export const selectIsDateZoomDisabled = (state: DashboardStoreState) =>
    state.edit.isDateZoomDisabled;
export const selectIsAddFilterDisabled = (state: DashboardStoreState) =>
    state.edit.isAddFilterDisabled;
export const selectEditedRequiredFiltersNote = (state: DashboardStoreState) =>
    state.edit.editedRequiredFiltersNote;

const tileTypesThatSupportFilters = [
    DashboardTileTypes.SQL_CHART,
    DashboardTileTypes.SAVED_CHART,
];
export const selectHasTilesThatSupportFilters = (state: DashboardStoreState) =>
    !!state.edit.tiles?.some(({ type }) =>
        tileTypesThatSupportFilters.includes(type),
    );

/** Joined tile uuids, so moving or resizing a tile doesn't change it */
export const selectTileUuidsKey = (state: DashboardStoreState) =>
    state.edit.tiles?.map((tile) => tile.uuid).join(',');

/**
 * Changes only when the chart-tile mapping changes, not when tiles are moved
 * or resized, so a drag doesn't re-run the filter chain.
 */
export const selectSavedChartUuidsAndTileUuidsKey = (
    state: DashboardStoreState,
) =>
    state.edit.tiles
        ?.filter(isDashboardChartTileType)
        .map((tile) => `${tile.uuid}:${tile.properties.savedChartUuid ?? ''}`)
        .sort()
        .join(',') ?? '';

export const selectSavedChartUuidsAndTileUuids = createSelector(
    [selectDashboardTiles],
    (tiles) =>
        tiles
            ?.filter(isDashboardChartTileType)
            .reduce<SavedChartsInfoForDashboardAvailableFilters>(
                (acc, tile) => {
                    if (tile.properties.savedChartUuid) {
                        acc.push({
                            tileUuid: tile.uuid,
                            savedChartUuid: tile.properties.savedChartUuid,
                        });
                    }
                    return acc;
                },
                [],
            ),
);

// Editor-authored date zoom settings resolve against the saved config
export const selectDateZoomConfig = (
    state: DashboardStoreState,
    saved: DateZoomConfig,
) =>
    isDateZoomConfigDraftCurrent(state.edit.dateZoomConfig, saved)
        ? state.edit.dateZoomConfig!.value
        : saved;
export const selectHasDateZoomConfigChanged = (
    state: DashboardStoreState,
    saved: DateZoomConfig,
) =>
    isDateZoomConfigDraftCurrent(state.edit.dateZoomConfig, saved) &&
    state.edit.dateZoomConfig!.changed;
export const selectDateZoomGranularities = (
    state: DashboardStoreState,
    saved: SavedDateZoomSettings['dateZoomGranularities'],
) =>
    isDraftCurrent(state.edit.dateZoomGranularities, saved)
        ? state.edit.dateZoomGranularities!.value
        : saved;
export const selectHaveDateZoomGranularitiesChanged = (
    state: DashboardStoreState,
) => state.edit.haveDateZoomGranularitiesChanged;
export const selectDefaultDateZoomGranularity = (
    state: DashboardStoreState,
    saved: SavedDateZoomSettings['defaultDateZoomGranularity'],
) =>
    isDraftCurrent(state.edit.defaultDateZoomGranularity, saved)
        ? state.edit.defaultDateZoomGranularity!.value
        : saved;
export const selectHasDefaultDateZoomGranularityChanged = (
    state: DashboardStoreState,
) => state.edit.hasDefaultDateZoomGranularityChanged;
