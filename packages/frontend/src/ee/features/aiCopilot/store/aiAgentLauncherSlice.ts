import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type LauncherDockItem = {
    threadId: string;
    agentUuid: string;
    title: string;
};

export type LauncherPendingContext = {
    chartUuid?: string;
    dashboardUuid?: string;
};

// The dashboard the user is currently viewing, published by the dashboard page
// so the launcher can offer a "Save to current dashboard" quick action.
export type LauncherCurrentDashboard = {
    projectUuid: string;
    uuid: string;
    name: string;
    activeTabUuid: string | null;
};

// Pub-sub bridge: the launcher asks the dashboard page to refresh its tiles
// after a chart has been saved into the currently viewed dashboard.
export type DashboardRefreshRequest = {
    dashboardUuid: string;
    focusChartSlug: string | null;
    requestId: number;
};

type LauncherMode = 'collapsed' | 'panel-open';

export interface AiAgentLauncherState {
    mode: LauncherMode;
    activeThreadId: string | null;
    activeAgentUuid: string | null;
    pendingContext: LauncherPendingContext | null;
    currentDashboard: LauncherCurrentDashboard | null;
    dashboardRefreshRequest: DashboardRefreshRequest | null;
}

const initialState: AiAgentLauncherState = {
    mode: 'collapsed',
    activeThreadId: null,
    activeAgentUuid: null,
    pendingContext: null,
    currentDashboard: null,
    dashboardRefreshRequest: null,
};

export const aiAgentLauncherSlice = createSlice({
    name: 'aiAgentLauncher',
    initialState,
    reducers: {
        openPanel: (
            state,
            action: PayloadAction<{
                threadId: string | null;
                agentUuid: string | null;
                pendingContext?: LauncherPendingContext | null;
            }>,
        ) => {
            state.mode = 'panel-open';
            state.activeThreadId = action.payload.threadId;
            state.activeAgentUuid = action.payload.agentUuid;
            state.pendingContext = action.payload.pendingContext ?? null;
        },
        closePanel: (state) => {
            state.mode = 'collapsed';
        },
        resetActivePanel: (state) => {
            state.mode = 'collapsed';
            state.activeThreadId = null;
            state.activeAgentUuid = null;
            state.pendingContext = null;
        },
        // Cascade-reset the active panel when a dock item is removed externally
        // (the dock itself is owned by `LauncherDockProvider`/localStorage).
        dockItemRemoved: (
            state,
            action: PayloadAction<{ threadId: string }>,
        ) => {
            if (state.activeThreadId === action.payload.threadId) {
                state.mode = 'collapsed';
                state.activeThreadId = null;
                state.activeAgentUuid = null;
                state.pendingContext = null;
            }
        },
        setCurrentDashboard: (
            state,
            action: PayloadAction<LauncherCurrentDashboard | null>,
        ) => {
            state.currentDashboard = action.payload;
        },
        requestDashboardRefresh: (
            state,
            action: PayloadAction<{
                dashboardUuid: string;
                focusChartSlug: string | null;
            }>,
        ) => {
            state.dashboardRefreshRequest = {
                dashboardUuid: action.payload.dashboardUuid,
                focusChartSlug: action.payload.focusChartSlug,
                requestId: (state.dashboardRefreshRequest?.requestId ?? 0) + 1,
            };
        },
    },
});

export const {
    openPanel,
    closePanel,
    resetActivePanel,
    dockItemRemoved,
    setCurrentDashboard,
    requestDashboardRefresh,
} = aiAgentLauncherSlice.actions;
