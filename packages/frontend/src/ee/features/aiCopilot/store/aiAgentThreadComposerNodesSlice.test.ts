import { describe, expect, it } from 'vitest';
import {
    addThreadComposerNode,
    aiAgentThreadComposerNodesSlice,
    clearThreadComposerNodes,
    removeThreadComposerNode,
    selectThreadComposerNodes,
    type ThreadComposerNode,
} from './aiAgentThreadComposerNodesSlice';

const { reducer } = aiAgentThreadComposerNodesSlice;

const wrap = (aiAgentThreadComposerNodes: ReturnType<typeof reducer>) => ({
    aiAgentThreadComposerNodes,
});

const revenue: ThreadComposerNode = {
    artifactUuid: 'artifact-1',
    versionUuid: 'version-1',
    nodeId: 'revenue',
    title: 'Revenue by month',
};

const orders: ThreadComposerNode = {
    ...revenue,
    nodeId: 'orders',
    title: 'Orders',
};

const reduce = (...actions: Parameters<typeof reducer>[1][]) =>
    actions.reduce(reducer, reducer(undefined, { type: '@@init' }));

describe('aiAgentThreadComposerNodesSlice', () => {
    it('adds nodes per thread and ignores duplicates', () => {
        const state = wrap(
            reduce(
                addThreadComposerNode({ threadUuid: 't1', node: revenue }),
                addThreadComposerNode({ threadUuid: 't1', node: orders }),
                addThreadComposerNode({ threadUuid: 't1', node: revenue }),
                addThreadComposerNode({ threadUuid: 't2', node: orders }),
            ),
        );
        expect(selectThreadComposerNodes('t1')(state)).toEqual([
            revenue,
            orders,
        ]);
        expect(selectThreadComposerNodes('t2')(state)).toEqual([orders]);
    });

    it('treats the same node id in another version as a different node', () => {
        const nextVersion = { ...revenue, versionUuid: 'version-2' };
        const state = wrap(
            reduce(
                addThreadComposerNode({ threadUuid: 't1', node: revenue }),
                addThreadComposerNode({ threadUuid: 't1', node: nextVersion }),
            ),
        );
        expect(selectThreadComposerNodes('t1')(state)).toEqual([
            revenue,
            nextVersion,
        ]);
    });

    it('removes one node and clears a thread', () => {
        const removed = wrap(
            reduce(
                addThreadComposerNode({ threadUuid: 't1', node: revenue }),
                addThreadComposerNode({ threadUuid: 't1', node: orders }),
                removeThreadComposerNode({ threadUuid: 't1', node: revenue }),
            ),
        );
        expect(selectThreadComposerNodes('t1')(removed)).toEqual([orders]);

        const cleared = wrap(
            reduce(
                addThreadComposerNode({ threadUuid: 't1', node: revenue }),
                clearThreadComposerNodes({ threadUuid: 't1' }),
            ),
        );
        expect(selectThreadComposerNodes('t1')(cleared)).toEqual([]);
    });
});
