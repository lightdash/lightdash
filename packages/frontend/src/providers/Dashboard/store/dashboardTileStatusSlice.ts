import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type TileLoadingStatus = 'loading' | 'loaded' | 'error';

export type DashboardTileStatusState = {
    tileStatuses: Record<string, TileLoadingStatus>;
};

const initialState: DashboardTileStatusState = {
    tileStatuses: {},
};

const dashboardTileStatusSlice = createSlice({
    name: 'dashboardTileStatus',
    initialState,
    reducers: {
        setTileStatus(
            state,
            action: PayloadAction<{
                tileUuid: string;
                status: TileLoadingStatus;
            }>,
        ) {
            state.tileStatuses[action.payload.tileUuid] = action.payload.status;
        },
        resetTileStatuses(state) {
            state.tileStatuses = {};
        },
    },
});

// ts-unused-exports:disable-next-line
export const dashboardTileStatusActions = dashboardTileStatusSlice.actions;
export default dashboardTileStatusSlice.reducer;
