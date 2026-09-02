// Per-thread element references waiting for the next prompt; kept outside the
// preview panel so they survive closing it and a new app version landing.

import { dataAppElementContextKey } from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ThreadElementReference = {
    appUuid: string;
    appSlug: string;
    appDisplayName: string;
    /** The ready version the reference was picked from. */
    version: number;
    tag: string;
    text: string;
    loc: string;
};

type State = Record<string, ThreadElementReference[]>;

const initialState: State = {};

const NO_REFERENCES: ThreadElementReference[] = [];

const referenceKey = dataAppElementContextKey;

export const aiAgentThreadElementRefsSlice = createSlice({
    name: 'aiAgentThreadElementRefs',
    initialState,
    reducers: {
        addThreadElementReference: (
            state,
            action: PayloadAction<{
                threadUuid: string;
                reference: ThreadElementReference;
            }>,
        ) => {
            const { threadUuid, reference } = action.payload;
            const existing = state[threadUuid] ?? [];
            const key = referenceKey(reference);
            if (existing.some((r) => referenceKey(r) === key)) return;
            state[threadUuid] = [...existing, reference];
        },
        removeThreadElementReference: (
            state,
            action: PayloadAction<{
                threadUuid: string;
                reference: ThreadElementReference;
            }>,
        ) => {
            const { threadUuid, reference } = action.payload;
            const existing = state[threadUuid];
            if (!existing) return;
            const key = referenceKey(reference);
            state[threadUuid] = existing.filter((r) => referenceKey(r) !== key);
        },
        clearThreadElementReferences: (
            state,
            action: PayloadAction<{ threadUuid: string }>,
        ) => {
            delete state[action.payload.threadUuid];
        },
    },
});

export const {
    addThreadElementReference,
    removeThreadElementReference,
    clearThreadElementReferences,
} = aiAgentThreadElementRefsSlice.actions;

/** Only a thread composer carries references; a new-thread composer has none. */
export const selectThreadElementReferences =
    (threadUuid: string | undefined) =>
    (state: { aiAgentThreadElementRefs: State }): ThreadElementReference[] =>
        (threadUuid && state.aiAgentThreadElementRefs[threadUuid]) ||
        NO_REFERENCES;
