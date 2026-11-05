// Per-thread composer pipeline nodes waiting for the next prompt; kept outside
// the pipeline panel so they survive closing it.

import { composerNodeContextKey } from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ThreadComposerNode = {
    artifactUuid: string;
    versionUuid: string;
    nodeId: string;
    title: string;
};

type State = Record<string, ThreadComposerNode[]>;

const initialState: State = {};

const NO_NODES: ThreadComposerNode[] = [];

export const aiAgentThreadComposerNodesSlice = createSlice({
    name: 'aiAgentThreadComposerNodes',
    initialState,
    reducers: {
        addThreadComposerNode: (
            state,
            action: PayloadAction<{
                threadUuid: string;
                node: ThreadComposerNode;
            }>,
        ) => {
            const { threadUuid, node } = action.payload;
            const existing = state[threadUuid] ?? [];
            const key = composerNodeContextKey(node);
            if (existing.some((n) => composerNodeContextKey(n) === key)) return;
            state[threadUuid] = [...existing, node];
        },
        removeThreadComposerNode: (
            state,
            action: PayloadAction<{
                threadUuid: string;
                node: ThreadComposerNode;
            }>,
        ) => {
            const { threadUuid, node } = action.payload;
            const existing = state[threadUuid];
            if (!existing) return;
            const key = composerNodeContextKey(node);
            state[threadUuid] = existing.filter(
                (n) => composerNodeContextKey(n) !== key,
            );
        },
        clearThreadComposerNodes: (
            state,
            action: PayloadAction<{ threadUuid: string }>,
        ) => {
            delete state[action.payload.threadUuid];
        },
    },
});

export const {
    addThreadComposerNode,
    removeThreadComposerNode,
    clearThreadComposerNodes,
} = aiAgentThreadComposerNodesSlice.actions;

export const selectThreadComposerNodes =
    (threadUuid: string | undefined) =>
    (state: { aiAgentThreadComposerNodes: State }): ThreadComposerNode[] =>
        (threadUuid && state.aiAgentThreadComposerNodes[threadUuid]) ||
        NO_NODES;
