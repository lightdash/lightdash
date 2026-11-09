import {
    QuerySourceType,
    type ThreadComposerQueryNode,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildNodeCitationPipeline } from './nodeCitationPipeline';

const orders: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    title: 'Orders by month',
    exploreName: 'orders',
    dimensions: ['orders_month'],
    metrics: ['orders_count'],
};
const refunds: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.SQL,
    nodeId: 'refunds',
    sql: 'select 1',
};
const net: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'net',
    title: 'Net orders',
    sql: 'select 1',
    references: ['orders', 'refunds'],
};
const netShare: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'net_share',
    title: 'Share of net orders',
    sql: 'select 1',
    references: ['net'],
};

const threadNodes = [orders, refunds, net, netShare];

describe('buildNodeCitationPipeline', () => {
    it('returns the cited node and everything it reads, the cited node last', () => {
        expect(
            buildNodeCitationPipeline({ nodeId: 'net_share', threadNodes }),
        ).toEqual({
            nodeId: 'net_share',
            title: 'Share of net orders',
            nodes: [orders, refunds, net, netShare],
        });
    });

    it('excludes nodes downstream of the cited node', () => {
        expect(
            buildNodeCitationPipeline({ nodeId: 'net', threadNodes })?.nodes,
        ).toEqual([orders, refunds, net]);
        expect(
            buildNodeCitationPipeline({ nodeId: 'orders', threadNodes })?.nodes,
        ).toEqual([orders]);
    });

    it('returns a null title for an untitled node rather than its id', () => {
        expect(
            buildNodeCitationPipeline({ nodeId: 'refunds', threadNodes })
                ?.title,
        ).toBeNull();
    });

    it('returns null for a node outside the thread', () => {
        expect(
            buildNodeCitationPipeline({ nodeId: 'unknown', threadNodes }),
        ).toBeNull();
    });
});
