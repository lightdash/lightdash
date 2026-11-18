import { toolListWorkstreamsOutputSchema } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getListWorkstreams } from './listWorkstreams';

const pr = (prNumber: number, summary: string | null) => ({
    repository: 'acme/analytics',
    provider: 'github',
    prUrl: `https://github.com/acme/analytics/pull/${prNumber}`,
    prNumber,
    summary,
});

const run = async (
    listed: Parameters<typeof getListWorkstreams>[0]['listWorkstreams'],
) =>
    toolListWorkstreamsOutputSchema.parse(
        await getListWorkstreams({ listWorkstreams: listed }).execute!(
            { repoTarget: null },
            { toolCallId: 'call', messages: [], context: {} },
        ),
    );

describe('listWorkstreams tool', () => {
    it('reports a change still being opened instead of "none" while a run is pending', async () => {
        const result = await run(async () => ({
            workstreams: [],
            pendingStartedAt: [new Date(Date.now() - 2 * 60_000)],
            otherThreads: [],
        }));
        expect(result).toMatchObject({
            result: '1 change started 2 minutes ago is still being opened; the pull request will appear here when done.',
            structuredContent: {
                repoTarget: null,
                workstreams: [],
                pendingChanges: [{ startedMinutesAgo: 2 }],
                otherConversations: [],
            },
        });
        expect(result.result).not.toContain('has not opened');
    });

    it('lists pull requests from other conversations on the project', async () => {
        const result = await run(async () => ({
            workstreams: [],
            pendingStartedAt: [],
            otherThreads: [pr(12, 'Add orders_count')],
        }));
        expect(result.result).toBe(
            [
                'This conversation has not opened any pull requests yet.',
                '1 pull request opened by other conversations on this project. Continue one with `prUrl` when the change belongs to it:',
                '• acme/analytics #12 — https://github.com/acme/analytics/pull/12',
                '  Add orders_count',
            ].join('\n'),
        );
        expect(result.structuredContent).toMatchObject({
            otherConversations: [{ prNumber: 12, prUrl: pr(12, null).prUrl }],
        });
    });

    it("lists this conversation's pull requests first", async () => {
        const result = await run(async () => ({
            workstreams: [pr(7, null)],
            pendingStartedAt: [],
            otherThreads: [],
        }));
        expect(result.result).toContain(
            '1 pull request opened in this conversation.',
        );
        expect(result.result).toContain('#7 —');
        expect(result.structuredContent).toMatchObject({
            workstreams: [{ prNumber: 7, summary: null }],
            pendingChanges: [],
        });
    });
});
