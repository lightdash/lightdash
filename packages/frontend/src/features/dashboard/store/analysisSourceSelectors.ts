import {
    isDashboardChartTileType,
    isDashboardSqlChartTile,
    type DashboardTile,
    type DataAppAnalysisSource,
} from '@lightdash/common';
import { createSelector } from '@reduxjs/toolkit';
import { type DashboardStoreState } from '.';
import {
    selectActiveTab,
    selectDashboardTabs,
    selectDashboardTiles,
} from './dashboardEditSelectors';

const selectTileQueries = (state: DashboardStoreState) =>
    state.tileStatus.tileQueries;

/** Tiles whose queries can feed an analysis; layout-only tiles cannot. */
const isAnalysableTile = (tile: DashboardTile): boolean =>
    (isDashboardChartTileType(tile) &&
        tile.properties.savedChartUuid !== null) ||
    isDashboardSqlChartTile(tile);

/**
 * The active tab's analysable tiles under view-mode semantics: hidden tabs
 * are excluded, visited tabs stay mounted-but-hidden (`keepTabsInMemory`), so
 * membership comes from the tile's tab, never from what is mounted. Tiles
 * with a stale tab reference render on the default/first visible tab.
 * Mirrors `isActiveTile` in `features/dashboardTabs`.
 */
const selectActiveAnalysableTiles = createSelector(
    [selectDashboardTiles, selectDashboardTabs, selectActiveTab],
    (tiles, tabs, activeTab): DashboardTile[] => {
        const analysable = (tiles ?? []).filter(isAnalysableTile);
        const allTabs = tabs ?? [];
        const visibleTabs = allTabs.filter((tab) => !tab.hidden);
        const tabsEnabled = visibleTabs.length > 1;
        if (!tabsEnabled) return analysable;
        const activeTabUuid = activeTab?.uuid;
        const defaultTabOrFirstTabActive =
            activeTabUuid === allTabs[0]?.uuid ||
            activeTabUuid === visibleTabs[0]?.uuid;
        return analysable.filter((tile) => {
            if (tile.tabUuid === activeTabUuid) return true;
            const tileHasStaleTabReference = !allTabs.some(
                (tab) => tab.uuid === tile.tabUuid,
            );
            return tileHasStaleTabReference && defaultTabOrFirstTabActive;
        });
    },
);

/**
 * The active view's tile showing this query, for hover-highlighting a
 * finding. Scoped to active analysable tiles so a retained hidden tab's
 * duplicate of the same chart (sharing the queryUuid) is never targeted.
 */
export const findActiveTileForQuery = (
    state: DashboardStoreState,
    queryUuid: string,
): string | null => {
    const tileQueries = selectTileQueries(state);
    const match = selectActiveAnalysableTiles(state).find(
        (tile) => tileQueries[tile.uuid]?.queryUuid === queryUuid,
    );
    return match?.uuid ?? null;
};

export type DashboardAnalysisSources = {
    /** Ready queries of the active tab's tiles, deduped by queryUuid. */
    sources: DataAppAnalysisSource[];
    /** True while an active analysable tile has not reported its query yet. */
    inFlight: boolean;
};

/**
 * The current view's analysis sources: each active tile's registered ready
 * query as `{queryUuid, label}`. Duplicate tiles of one chart share a
 * queryUuid and collapse to one source.
 */
export const selectDashboardAnalysisSources = createSelector(
    [selectActiveAnalysableTiles, selectTileQueries],
    (activeTiles, tileQueries): DashboardAnalysisSources => {
        const sources: DataAppAnalysisSource[] = [];
        const seen = new Set<string>();
        let inFlight = false;
        activeTiles.forEach((tile) => {
            const registration = tileQueries[tile.uuid];
            if (!registration) {
                inFlight = true;
                return;
            }
            if (registration.status !== 'ready') return;
            if (registration.queryUuid === null) return;
            if (seen.has(registration.queryUuid)) return;
            seen.add(registration.queryUuid);
            sources.push({
                queryUuid: registration.queryUuid,
                label: registration.label,
            });
        });
        return { sources, inFlight };
    },
);
