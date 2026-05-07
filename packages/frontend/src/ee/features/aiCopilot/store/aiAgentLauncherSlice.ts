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

type LauncherMode = 'collapsed' | 'panel-open';

export interface AiAgentLauncherState {
    mode: LauncherMode;
    activeThreadId: string | null;
    activeAgentUuid: string | null;
    pendingContext: LauncherPendingContext | null;
}

const initialState: AiAgentLauncherState = {
    mode: 'collapsed',
    activeThreadId: null,
    activeAgentUuid: null,
    pendingContext: null,
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
    },
});

export const { openPanel, closePanel, resetActivePanel, dockItemRemoved } =
    aiAgentLauncherSlice.actions;
