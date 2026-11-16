import {
    MergeJoinType,
    QuerySourceType,
    type MergeSourceQuery,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { summarizeMergeNode } from './mergeNodeSummary';

const LABELS: Record<string, string> = {
    orders_order_week: 'Order week',
    orders_total_revenue: 'Total revenue',
    sessions_session_week: 'Session week',
    sessions_count: 'Sessions',
    orders_status: 'Status',
};

const node: MergeSourceQuery = {
    sourceType: QuerySourceType.MERGE,
    nodeId: 'revenue_per_session',
    sources: [
        { nodeId: 'weekly_orders' },
        { nodeId: 'weekly_sessions', repeatValues: true },
    ],
    joinKey: [
        {
            name: 'week',
            fieldIdBySourceId: {
                weekly_orders: 'orders_order_week',
                weekly_sessions: 'sessions_session_week',
            },
        },
    ],
    joinType: MergeJoinType.LEFT,
    tableCalculations: [
        {
            name: 'per_session',
            displayName: 'Revenue per session',
            sql: '',
            formula:
                '=weekly_orders_orders_total_revenue / weekly_sessions_sessions_count',
        },
    ],
    sorts: [
        { fieldId: 'merge_week', descending: true },
        { fieldId: 'merge_per_session', descending: false },
    ],
    limit: 500,
};

const summarize = (query: MergeSourceQuery) =>
    summarizeMergeNode(
        query,
        {
            weekly_orders: { title: 'Weekly orders', exploreName: 'orders' },
            weekly_sessions: {
                title: 'Weekly sessions',
                exploreName: 'sessions',
            },
        },
        (_nodeId, fieldId) => LABELS[fieldId] ?? fieldId,
    );

describe('summarizeMergeNode', () => {
    it('names sources by title, with their key field and repeat flag', () => {
        expect(summarize(node).sources).toEqual([
            {
                nodeId: 'weekly_orders',
                title: 'Weekly orders',
                exploreName: 'orders',
                repeatValues: false,
                keyFields: [
                    { fieldId: 'orders_order_week', label: 'Order week' },
                ],
            },
            {
                nodeId: 'weekly_sessions',
                title: 'Weekly sessions',
                exploreName: 'sessions',
                repeatValues: true,
                keyFields: [
                    { fieldId: 'sessions_session_week', label: 'Session week' },
                ],
            },
        ]);
    });

    it('labels a key by its first listed field', () => {
        const summary = summarize(node);
        expect(summary.keys).toEqual([{ name: 'week', label: 'Order week' }]);
        expect(summary.keyLabel).toBe('Order week');
        expect(summary.firstSourceTitle).toBe('Weekly orders');
    });

    it('resolves merged column ids in formulas and sorts to labels', () => {
        const summary = summarize(node);
        expect(summary.calculations[0].formula).toEqual([
            {
                kind: 'column',
                column: {
                    label: 'Total revenue',
                    sourceTitle: 'Weekly orders',
                    sourceNodeId: 'weekly_orders',
                },
            },
            { kind: 'text', text: ' / ' },
            {
                kind: 'column',
                column: {
                    label: 'Sessions',
                    sourceTitle: 'Weekly sessions',
                    sourceNodeId: 'weekly_sessions',
                },
            },
        ]);
        expect(summary.sorts).toEqual([
            {
                column: {
                    label: 'Order week',
                    sourceTitle: null,
                    sourceNodeId: null,
                },
                descending: true,
            },
            {
                column: {
                    label: 'Revenue per session',
                    sourceTitle: null,
                    sourceNodeId: null,
                },
                descending: false,
            },
        ]);
        expect(summary.limit).toBe(500);
    });

    it('resolves the longest matching node id when one prefixes another', () => {
        const summary = summarizeMergeNode(
            {
                ...node,
                sources: [{ nodeId: 'orders' }, { nodeId: 'orders_2' }],
                joinKey: [],
                tableCalculations: [
                    {
                        name: 'diff',
                        displayName: 'Diff',
                        sql: '',
                        formula: 'orders_2_orders_status',
                    },
                ],
                sorts: [],
            },
            {
                orders: { title: 'This year', exploreName: 'orders' },
                orders_2: { title: 'Last year', exploreName: 'orders' },
            },
            (_nodeId, fieldId) => LABELS[fieldId] ?? fieldId,
        );
        expect(summary.calculations[0].formula).toEqual([
            {
                kind: 'column',
                column: {
                    label: 'Status',
                    sourceTitle: 'Last year',
                    sourceNodeId: 'orders_2',
                },
            },
        ]);
    });

    it('falls back to a readable name for a source outside the pipeline', () => {
        const summary = summarizeMergeNode(node, {}, (_id, fieldId) => fieldId);
        expect(summary.sources.map((source) => source.title)).toEqual([
            'Weekly orders',
            'Weekly sessions',
        ]);
    });
});
