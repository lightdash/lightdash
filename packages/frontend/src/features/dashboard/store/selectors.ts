import { createSelector } from '@reduxjs/toolkit';
import type { DashboardStoreState } from '.';

const selectTileLoadingState = (state: DashboardStoreState) =>
    state.dashboardTileLoading;

/**
 * Select the loading status for a single tile.
 * Returns 'pending' for unknown tiles, keeping their queries gated.
 */
export const selectTileStatus = createSelector(
    [
        selectTileLoadingState,
        (_state: DashboardStoreState, tileUuid: string) => tileUuid,
    ],
    (loadingState, tileUuid) => loadingState.tiles[tileUuid] ?? 'pending',
);

/**
 * Whether a tile's query should be enabled.
 * True when status is 'visible' (no longer pending).
 */
export const selectIsTileQueryEnabled = createSelector(
    [
        selectTileLoadingState,
        (_state: DashboardStoreState, tileUuid: string) => tileUuid,
    ],
    (loadingState, tileUuid): boolean => {
        const status = loadingState.tiles[tileUuid];
        return status === 'visible';
    },
);
