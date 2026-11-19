import {
    QueryHistoryStatus,
    QuerySourceType,
    type ComposerPipelineNode,
} from '@lightdash/common';
import type { ComposerNodeStatus } from '../types/aiAgentDependencies';
import {
    hasReachedLimit,
    renderComposerNodeListing,
    toNodeSummary,
} from './composerQueryPipeline';

const apiNode: ComposerPipelineNode = {
    sourceType: QuerySourceType.API,
    nodeId: 'sessions',
    title: 'Sessions',
    connectionUuid: '22222222-2222-4222-8222-222222222222',
    payload: { kind: 'query', query: '{}' },
};

const readyStatus = (
    rowCount: number,
    liveResultNotices: ComposerNodeStatus['liveResultNotices'] = [],
): ComposerNodeStatus => ({
    nodeId: 'sessions',
    state: QueryHistoryStatus.READY,
    error: null,
    rowCount,
    columns: null,
    sample: null,
    liveResultNotices,
});

const renderListing = (status: ComposerNodeStatus) =>
    renderComposerNodeListing({
        queries: [apiNode],
        nodes: [toNodeSummary(apiNode, status, false)],
        nodeStatuses: [status],
        reusableNodes: [],
        submittedNodeIds: new Set(['sessions']),
        maxQueryLimit: 5000,
    });

describe('composer live data source nodes', () => {
    it('reports no limit, not the 500 default, for an api node without one', () => {
        const summary = toNodeSummary(apiNode, readyStatus(3000), false);

        expect(summary.limit).toBeNull();
        expect(hasReachedLimit(summary)).toBe(false);
        expect(renderListing(readyStatus(3000))).toContain(
            '3000 rows, no limit.',
        );
    });

    it('passes the live result notices on to the agent', () => {
        const message =
            'Showing the first 5,000 rows, the most one query can return. GA4 has more: add filters to see the rest.';
        const status = readyStatus(5000, [
            { type: 'truncated', rowCount: 5000, message },
        ]);

        expect(toNodeSummary(apiNode, status, false).notices).toEqual([
            message,
        ]);
        expect(renderListing(status)).toContain(
            `5000 rows, no limit. ${message}`,
        );
    });

    it('keeps the limit of an api node that sets one', () => {
        const summary = toNodeSummary(
            { ...apiNode, limit: 200 },
            readyStatus(200),
            false,
        );

        expect(summary.limit).toBe(200);
        expect(summary.notices).toBeUndefined();
        expect(hasReachedLimit(summary)).toBe(true);
    });
});
