import {
    type CreateDashboardChartTile,
    type DashboardFilters,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface DashboardEditingState {
    dashboardName: string | null;
    dashboardUuid: string | null;
    unsavedTiles: DashboardTile[] | CreateDashboardChartTile[] | null;
    unsavedFilters: DashboardFilters | null;
    tabs: DashboardTab[] | null;
    hasChanges: boolean;
    activeTabUuid: string | null;
}

const initialState: DashboardEditingState = {
    dashboardName: null,
    dashboardUuid: null,
    unsavedTiles: null,
    unsavedFilters: null,
    tabs: null,
    hasChanges: false,
    activeTabUuid: null,
};

export const dashboardEditingSlice = createSlice({
    name: 'dashboardEditing',
    initialState,
    reducers: {
        storeDashboard(
            state,
            action: PayloadAction<{
                dashboardName: string;
                dashboardUuid: string;
                unsavedTiles: DashboardTile[];
                unsavedFilters: DashboardFilters | null;
                tabs: DashboardTab[] | null;
                hasChanges: boolean;
                activeTabUuid: string | null;
            }>,
        ) {
            state.dashboardName = action.payload.dashboardName;
            state.dashboardUuid = action.payload.dashboardUuid;
            state.unsavedTiles = action.payload.unsavedTiles;
            state.unsavedFilters = action.payload.unsavedFilters;
            state.tabs = action.payload.tabs;
            state.hasChanges = action.payload.hasChanges;
            state.activeTabUuid = action.payload.activeTabUuid;
        },
        setChartInfo(
            state,
            action: PayloadAction<{
                name: string;
                dashboardUuid: string;
            }>,
        ) {
            state.dashboardName = action.payload.name;
            state.dashboardUuid = action.payload.dashboardUuid;
        },
        clearChartInfo(state) {
            state.dashboardName = null;
            state.dashboardUuid = null;
        },
        clearAll() {
            return initialState;
        },
        setUnsavedTiles(
            state,
            action: PayloadAction<DashboardTile[] | CreateDashboardChartTile[]>,
        ) {
            state.unsavedTiles = action.payload;
        },
    },
});

export const dashboardEditingActions = dashboardEditingSlice.actions;
