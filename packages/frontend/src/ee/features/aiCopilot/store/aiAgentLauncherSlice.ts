import {
    type AiDashboardRuntimeOverrides,
    type AiPromptContextInput,
    type AiPromptContextItem,
} from '@lightdash/common';
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

/** Content that goes out with the next prompt: what is sent, and how it is shown. */
export type LauncherPinnedContextEntry = {
    key: string;
    input: AiPromptContextInput[number];
    preview: AiPromptContextItem;
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
    /** Content asked about from a page, until its names have loaded. */
    pendingContext: LauncherPendingContext | null;
    pinnedContext: LauncherPinnedContextEntry[];
    /** The user removed the dashboard on screen from the next prompt. */
    pageContextDismissed: boolean;
    /** A prompt to send as soon as the new-thread panel is ready. */
    pendingPrompt: string | null;
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
    pinnedContext: [],
    pageContextDismissed: false,
    pendingPrompt: null,
    currentDashboard: null,
    currentDataApp: null,
    currentDocument: null,
    dashboardRefreshRequest: null,
};

const clearNextPromptContext = (state: AiAgentLauncherState) => {
    state.pendingContext = null;
    state.pinnedContext = [];
    state.pageContextDismissed = false;
};

const addPinnedContext = (
    state: AiAgentLauncherState,
    entries: LauncherPinnedContextEntry[],
) => {
    const pinnedKeys = new Set(state.pinnedContext.map(({ key }) => key));
    entries.forEach((entry) => {
        if (pinnedKeys.has(entry.key)) return;
        pinnedKeys.add(entry.key);
        state.pinnedContext.push(entry);
    });
    const pinsDashboardOnScreen = entries.some(
        ({ preview }) =>
            preview.type === 'dashboard' &&
            preview.dashboardUuid === state.currentDashboard?.uuid,
    );
    if (pinsDashboardOnScreen) state.pageContextDismissed = false;
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
            // Switching agent on a new thread keeps what was pinned to it.
            if (action.payload.threadId !== state.activeThreadId) {
                clearNextPromptContext(state);
            }
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
            }>,
        ) => {
            clearNextPromptContext(state);
            state.mode = 'panel-open';
            state.view = 'chat';
            state.activeThreadId = null;
            state.activeAgentUuid = null;
            state.pendingContext = action.payload.pendingContext ?? null;
            state.pendingPrompt = action.payload.pendingPrompt ?? null;
        },
        // Pins the context to the thread on screen; with none, a new thread.
        attachContextOrStartThread: (
            state,
            action: PayloadAction<{
                pendingContext: LauncherPendingContext | null;
            }>,
        ) => {
            const hasThreadOnScreen =
                state.mode === 'panel-open' &&
                state.view === 'chat' &&
                state.activeThreadId !== null;
            if (!hasThreadOnScreen) {
                clearNextPromptContext(state);
                state.activeThreadId = null;
                state.activeAgentUuid = null;
                state.pendingPrompt = null;
            }
            state.mode = 'panel-open';
            state.view = 'chat';
            state.pendingContext = action.payload.pendingContext;
        },
        // The thread on screen cannot be replied to: its context moves to a
        // new thread.
        startThreadKeepingContext: (state) => {
            state.activeThreadId = null;
            state.activeAgentUuid = null;
        },
        clearPendingPrompt: (state) => {
            state.pendingPrompt = null;
        },
        // The names of the pending content loaded: it joins the pinned list.
        pendingContextResolved: (
            state,
            action: PayloadAction<LauncherPinnedContextEntry[]>,
        ) => {
            state.pendingContext = null;
            addPinnedContext(state, action.payload);
        },
        unpinContext: (
            state,
            action: PayloadAction<{
                key: string;
                dashboardUuid: string | null;
            }>,
        ) => {
            state.pinnedContext = state.pinnedContext.filter(
                ({ key }) => key !== action.payload.key,
            );
            // The dashboard on screen is added on its own, so removing its
            // chip has to hold that back too.
            if (
                action.payload.dashboardUuid !== null &&
                action.payload.dashboardUuid === state.currentDashboard?.uuid
            ) {
                state.pageContextDismissed = true;
            }
        },
        // After a prompt is sent; the dashboard stays dismissed for the thread.
        clearPinnedContext: (state) => {
            state.pinnedContext = [];
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
            clearNextPromptContext(state);
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
                clearNextPromptContext(state);
            }
        },
        setCurrentDashboard: (
            state,
            action: PayloadAction<LauncherCurrentDashboard | null>,
        ) => {
            if (action.payload?.uuid !== state.currentDashboard?.uuid) {
                state.pageContextDismissed = false;
            }
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
    attachContextOrStartThread,
    clearPinnedContext,
    clearPendingPrompt,
    pendingContextResolved,
    startThreadKeepingContext,
    unpinContext,
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
