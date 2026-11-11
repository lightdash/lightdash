import {
    DashboardTileTypes,
    isDashboardChartTileType,
    isDashboardSqlChartTile,
    type DashboardTileParameterReferencesTile,
    type DateZoomConfig,
    type SavedChartsInfoForDashboardAvailableFilters,
} from '@lightdash/common';
import { createSelector } from '@reduxjs/toolkit';
import { isEqual } from 'es-toolkit/compat';
import { type DashboardStoreState } from '.';
import {
    canStepTileLayout,
    isDateZoomConfigDraftCurrent,
    isDraftCurrent,
    type SavedDateZoomSettings,
} from './dashboardEditReducer';

export const selectDashboardTiles = (state: DashboardStoreState) =>
    state.edit.tiles;
export const selectHaveTilesChanged = (state: DashboardStoreState) =>
    state.edit.haveTilesChanged;
export const selectCanUndoTileLayout = (state: DashboardStoreState) =>
    canStepTileLayout(state.edit, 'undo');
export const selectCanRedoTileLayout = (state: DashboardStoreState) =>
    canStepTileLayout(state.edit, 'redo');
export const selectCanvasZoom = (state: DashboardStoreState) =>
    state.edit.canvasZoom;
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
export const selectControlSections = (state: DashboardStoreState) =>
    state.edit.controlSections;
export const selectHaveControlSectionsChanged = (state: DashboardStoreState) =>
    state.edit.haveControlSectionsChanged;
export const selectControlOrder = (state: DashboardStoreState) =>
    state.edit.controlOrder;
export const selectHasControlOrderChanged = (state: DashboardStoreState) =>
    state.edit.hasControlOrderChanged;

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
    // Moving or resizing a tile keeps the mapping, and everything derived from it
    { memoizeOptions: { resultEqualityCheck: isEqual } },
);

/** Every chart and SQL chart tile with its saved query, on every tab */
export const selectTileQuerySources = createSelector(
    [selectDashboardTiles],
    (tiles) =>
        tiles?.flatMap<DashboardTileParameterReferencesTile>((tile) => {
            if (
                isDashboardChartTileType(tile) &&
                tile.properties.savedChartUuid
            )
                return [
                    {
                        tileUuid: tile.uuid,
                        savedChartUuid: tile.properties.savedChartUuid,
                        savedSqlUuid: null,
                    },
                ];
            if (isDashboardSqlChartTile(tile) && tile.properties.savedSqlUuid)
                return [
                    {
                        tileUuid: tile.uuid,
                        savedChartUuid: null,
                        savedSqlUuid: tile.properties.savedSqlUuid,
                    },
                ];
            return [];
        }) ?? [],
);

/** Changes only with the tile-to-query mapping, not when tiles move */
export const selectTileQuerySourcesKey = createSelector(
    [selectTileQuerySources],
    (sources) =>
        sources
            .map(
                ({ tileUuid, savedChartUuid, savedSqlUuid }) =>
                    `${tileUuid}:${savedChartUuid ?? ''}:${savedSqlUuid ?? ''}`,
            )
            .sort()
            .join(','),
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
