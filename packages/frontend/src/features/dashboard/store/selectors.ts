import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../../../store';

const selectTileLoadingState = (state: RootState) => state.dashboardTileLoading;

/**
 * Select the loading status for a single tile.
 * Returns 'pending' for unknown tiles, keeping their queries gated.
 */
export const selectTileStatus = createSelector(
    [selectTileLoadingState, (_state: RootState, tileUuid: string) => tileUuid],
    (loadingState, tileUuid) => loadingState.tiles[tileUuid] ?? 'pending',
);

/**
 * Whether a tile's query should be enabled.
 * True when status is 'visible' (no longer pending).
 */
export const selectIsTileQueryEnabled = createSelector(
    [selectTileLoadingState, (_state: RootState, tileUuid: string) => tileUuid],
    (loadingState, tileUuid): boolean => {
        const status = loadingState.tiles[tileUuid];
        return status === 'visible';
    },
);
