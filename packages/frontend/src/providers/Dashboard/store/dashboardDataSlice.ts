import { type Dashboard } from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import sortBy from 'lodash/sortBy';
import {
    type useDashboardCommentsCheck,
    type useGetComments,
} from '../../../features/comments';

// ts-unused-exports:disable-next-line
export type DashboardDataState = {
    projectUuid: string | undefined;
    isDashboardLoading: boolean;
    dashboard: Dashboard | undefined;
    dashboardError: unknown;
    dashboardTiles: Dashboard['tiles'] | undefined;
    haveTilesChanged: boolean;
    haveTabsChanged: boolean;
    dashboardTabs: Dashboard['tabs'];
    activeTab: Dashboard['tabs'][number] | undefined;
    dashboardCommentsCheck:
        | ReturnType<typeof useDashboardCommentsCheck>
        | undefined;
    dashboardComments: ReturnType<typeof useGetComments>['data'] | undefined;
    isRefreshingDashboardVersion: boolean;
};

const initialState: DashboardDataState = {
    projectUuid: undefined,
    isDashboardLoading: true,
    dashboard: undefined,
    dashboardError: null,
    dashboardTiles: undefined,
    haveTilesChanged: false,
    haveTabsChanged: false,
    dashboardTabs: [],
    activeTab: undefined,
    dashboardCommentsCheck: undefined,
    dashboardComments: undefined,
    isRefreshingDashboardVersion: false,
};

// ts-unused-exports:disable-next-line
export const dashboardDataSlice = createSlice({
    name: 'dashboardData',
    initialState,
    reducers: {
        setProjectUuid: (state, action: PayloadAction<string | undefined>) => {
            state.projectUuid = action.payload;
        },
        setDashboardLoading: (state, action: PayloadAction<boolean>) => {
            state.isDashboardLoading = action.payload;
        },
        setDashboard: (state, action: PayloadAction<Dashboard | undefined>) => {
            state.dashboard = action.payload;
        },
        setDashboardError: (state, action: PayloadAction<unknown>) => {
            state.dashboardError = action.payload;
        },
        setDashboardTiles: (
            state,
            action: PayloadAction<Dashboard['tiles'] | undefined>,
        ) => {
            state.dashboardTiles = action.payload;
        },
        setHaveTilesChanged: (state, action: PayloadAction<boolean>) => {
            state.haveTilesChanged = action.payload;
        },
        setHaveTabsChanged: (state, action: PayloadAction<boolean>) => {
            state.haveTabsChanged = action.payload;
        },
        setDashboardTabs: (state, action: PayloadAction<Dashboard['tabs']>) => {
            state.dashboardTabs = sortBy(action.payload, 'order');
        },
        setActiveTab: (
            state,
            action: PayloadAction<Dashboard['tabs'][number] | undefined>,
        ) => {
            state.activeTab = action.payload;
        },
        setDashboardComments: (
            state,
            action: PayloadAction<DashboardDataState['dashboardComments']>,
        ) => {
            state.dashboardComments = action.payload;
        },
        setDashboardCommentsCheck: (
            state,
            action: PayloadAction<DashboardDataState['dashboardCommentsCheck']>,
        ) => {
            state.dashboardCommentsCheck = action.payload;
        },
        setIsRefreshingDashboardVersion: (
            state,
            action: PayloadAction<boolean>,
        ) => {
            state.isRefreshingDashboardVersion = action.payload;
        },
    },
});

// ts-unused-exports:disable-next-line
export const dashboardDataActions = dashboardDataSlice.actions;
// ts-unused-exports:disable-next-line
export const dashboardDataReducer = dashboardDataSlice.reducer;
