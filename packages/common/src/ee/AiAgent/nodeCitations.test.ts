import { describe, expect, it } from 'vitest';
import {
    getNodeCitationNodeId,
    hasNodeCitations,
    stripNodeCitations,
} from './nodeCitations';

describe('node citations', () => {
    it('reads the node id from a citation href and rejects malformed ones', () => {
        expect(getNodeCitationNodeId('#query-node-monthly_revenue')).toBe(
            'monthly_revenue',
        );
        expect(getNodeCitationNodeId('#query-node-1bad')).toBeNull();
        expect(getNodeCitationNodeId('#query-node-')).toBeNull();
        expect(getNodeCitationNodeId('/other#query-node-x')).toBeNull();
    });

    it('detects citations outside code only', () => {
        expect(hasNodeCitations('Revenue [rev](#query-node-rev).')).toBe(true);
        expect(hasNodeCitations('`[rev](#query-node-rev)`')).toBe(false);
        expect(hasNodeCitations('```\n[rev](#query-node-rev)\n```')).toBe(
            false,
        );
        expect(hasNodeCitations('[docs](https://example.com)')).toBe(false);
    });

    it('strips the whole link, its label and the space before it', () => {
        expect(
            stripNodeCitations(
                'Revenue was $404 [completed revenue](#query-node-rev), 12 orders [count [all]](#query-node-orders).',
            ),
        ).toBe('Revenue was $404, 12 orders.');
    });

    it('leaves other links and code untouched', () => {
        expect(
            stripNodeCitations(
                'See [docs](https://example.com) and `[a](#query-node-a)`\n```\n[b](#query-node-b)\n```',
            ),
        ).toBe(
            'See [docs](https://example.com) and `[a](#query-node-a)`\n```\n[b](#query-node-b)\n```',
        );
    });
});
