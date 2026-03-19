import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * Progressive loading state for dashboard tiles.
 *
 * Tiles start as 'pending' and transition to 'visible' when they
 * enter the viewport (or are near it). Chart queries are gated on
 * the tile being 'visible'.
 *
 * Non-chart tiles (markdown, loom, heading) are marked 'visible'
 * immediately since they don't fire queries.
 */
export type TileLoadingStatus = 'pending' | 'visible';

export interface DashboardTileLoadingState {
    /** Per-tile loading status keyed by tile UUID */
    tiles: Record<string, TileLoadingStatus>;
}

const initialState: DashboardTileLoadingState = {
    tiles: {},
};

const dashboardTileLoadingSlice = createSlice({
    name: 'dashboardTileLoading',
    initialState,
    reducers: {
        /**
         * Register all tile UUIDs when the dashboard loads.
         * Chart tile UUIDs start as 'pending'; non-chart tiles
         * are marked 'visible' immediately (they don't need gating).
         */
        initializeTiles(
            state,
            action: PayloadAction<{
                chartTileUuids: string[];
                staticTileUuids: string[];
            }>,
        ) {
            state.tiles = {};
            for (const uuid of action.payload.chartTileUuids) {
                state.tiles[uuid] = 'pending';
            }
            for (const uuid of action.payload.staticTileUuids) {
                state.tiles[uuid] = 'visible';
            }
        },

        /**
         * Mark a tile as visible (entered viewport).
         * Only transitions from 'pending'.
         */
        tileEnteredViewport(state, action: PayloadAction<string>) {
            const uuid = action.payload;
            if (state.tiles[uuid] === 'pending') {
                state.tiles[uuid] = 'visible';
            }
        },

        /** Release all pending tiles at once (e.g. for screenshots/exports) */
        releaseAll(state) {
            for (const tileUuid of Object.keys(state.tiles)) {
                if (state.tiles[tileUuid] === 'pending') {
                    state.tiles[tileUuid] = 'visible';
                }
            }
        },

        /** Reset the slice (dashboard unmount or navigation) */
        reset() {
            return initialState;
        },
    },
});

export const dashboardTileLoadingActions = dashboardTileLoadingSlice.actions;
export const dashboardTileLoadingReducer = dashboardTileLoadingSlice.reducer;
