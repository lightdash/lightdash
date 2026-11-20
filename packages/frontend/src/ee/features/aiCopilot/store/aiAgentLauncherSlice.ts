import { type AiDashboardRuntimeOverrides } from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type LauncherActiveAgentUuid } from '../components/Launcher/launcherAgentSelection';

export type LauncherDockItem = {
    threadId: string;
    agentUuid: string;
    title: string;
    // Optional: missing on items persisted before this field existed.
    createdAt?: number;
};

export type LauncherPendingContext = {
    chartUuid?: string;
    sqlChartUuid?: string;
    composerChartUuid?: string;
    dashboardUuid?: string;
    dataAppUuid?: string;
    documentUuid?: string;
};

export type LauncherCurrentDashboard = {
    projectUuid: string;
    uuid: string;
    name: string;
    activeTabUuid: string | null;
    runtimeOverrides: AiDashboardRuntimeOverrides | null;
};

// The data app page the user is on; no runtime overrides are captured.
export type LauncherCurrentDataApp = {
    projectUuid: string;
    uuid: string;
};

// The Document page the user is on.
export type LauncherCurrentDocument = {
    projectUuid: string;
    uuid: string;
};

export type DashboardRefreshRequest = {
    dashboardUuid: string;
    focusChartSlug: string | null;
    requestId: number;
};

type LauncherMode = 'collapsed' | 'panel-open';

/** Which surface the open panel shows: agent chat, or the AI analysis view. */
export type LauncherView = 'chat' | 'analysis';

export interface AiAgentLauncherState {
    mode: LauncherMode;
    view: LauncherView;
    activeThreadId: string | null;
    activeAgentUuid: LauncherActiveAgentUuid | null;
    pendingContext: LauncherPendingContext | null;
    /** A prompt to send as soon as the new-thread panel is ready. */
    pendingPrompt: string | null;
    /** Uploaded images to send with the pending prompt. */
    pendingImageFileUuids: string[];
    currentDashboard: LauncherCurrentDashboard | null;
    currentDataApp: LauncherCurrentDataApp | null;
    currentDocument: LauncherCurrentDocument | null;
    dashboardRefreshRequest: DashboardRefreshRequest | null;
}

const initialState: AiAgentLauncherState = {
    mode: 'collapsed',
    view: 'chat',
    activeThreadId: null,
    activeAgentUuid: null,
    pendingContext: null,
    pendingPrompt: null,
    pendingImageFileUuids: [],
    currentDashboard: null,
    currentDataApp: null,
    currentDocument: null,
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
                agentUuid: LauncherActiveAgentUuid;
                pendingContext?: LauncherPendingContext | null;
            }>,
        ) => {
            state.mode = 'panel-open';
            state.view = 'chat';
            state.activeThreadId = action.payload.threadId;
            state.activeAgentUuid = action.payload.agentUuid;
            state.pendingContext = action.payload.pendingContext ?? null;
        },
        // Panel showing AI analysis of the current view; the adapter that
        // feeds it lives outside the store (launcherAnalysisAdapter).
        openAnalysisPanel: (state) => {
            state.mode = 'panel-open';
            state.view = 'analysis';
        },
        openDefaultAgentPanel: (
            state,
            action: PayloadAction<{
                pendingContext?: LauncherPendingContext | null;
                pendingPrompt?: string | null;
                pendingImageFileUuids?: string[];
            }>,
        ) => {
            state.mode = 'panel-open';
            state.view = 'chat';
            state.activeThreadId = null;
            state.activeAgentUuid = null;
            state.pendingContext = action.payload.pendingContext ?? null;
            state.pendingPrompt = action.payload.pendingPrompt ?? null;
            state.pendingImageFileUuids =
                action.payload.pendingImageFileUuids ?? [];
        },
        clearPendingPrompt: (state) => {
            state.pendingPrompt = null;
            state.pendingImageFileUuids = [];
        },
        setActiveAgent: (
            state,
            action: PayloadAction<LauncherActiveAgentUuid>,
        ) => {
            state.activeAgentUuid = action.payload;
        },
        closePanel: (state) => {
            state.mode = 'collapsed';
        },
        resetActivePanel: (state) => {
            state.mode = 'collapsed';
            state.view = 'chat';
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
                state.view = 'chat';
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
        setCurrentDataApp: (
            state,
            action: PayloadAction<LauncherCurrentDataApp | null>,
        ) => {
            state.currentDataApp = action.payload;
        },
        setCurrentDocument: (
            state,
            action: PayloadAction<LauncherCurrentDocument | null>,
        ) => {
            state.currentDocument = action.payload;
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
    clearPendingPrompt,
    openPanel,
    openAnalysisPanel,
    openDefaultAgentPanel,
    setActiveAgent,
    closePanel,
    resetActivePanel,
    dockItemRemoved,
    setCurrentDashboard,
    setCurrentDataApp,
    setCurrentDocument,
    requestDashboardRefresh,
} = aiAgentLauncherSlice.actions;
