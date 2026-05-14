// Per-thread UI mode state that needs to persist across streaming sessions
// (the existing aiAgentThreadStreamSlice wipes its entry on each new stream,
// which would reset the toggle every prompt).
//
// Currently holds the SQL-mode toggle: when ON, the user is asking the
// agent to use runSql + warehouse-introspection tools for this prompt.
// Frontend state only — backend treats `enableSqlMode` as a request-time
// parameter on each stream call, no DB persistence.

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type ThreadMode = {
    sqlMode: boolean;
};

type State = Record<string, ThreadMode>;

const initialState: State = {};

const DEFAULT_SQL_MODE = false;

export const aiAgentThreadModeSlice = createSlice({
    name: 'aiAgentThreadMode',
    initialState,
    reducers: {
        setThreadSqlMode: (
            state,
            action: PayloadAction<{ threadUuid: string; enabled: boolean }>,
        ) => {
            const { threadUuid, enabled } = action.payload;
            state[threadUuid] = { ...state[threadUuid], sqlMode: enabled };
        },
    },
});

export const { setThreadSqlMode } = aiAgentThreadModeSlice.actions;

export const selectThreadSqlMode =
    (threadUuid: string) =>
    (state: { aiAgentThreadMode: State }): boolean =>
        state.aiAgentThreadMode[threadUuid]?.sqlMode ?? DEFAULT_SQL_MODE;
