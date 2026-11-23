import { describe, expect, it, vi } from 'vitest';
import { getRead } from './read';

const run = (read: Parameters<typeof getRead>[0]['read'], script = 'x') =>
    getRead({ read }).execute!(
        { script },
        { messages: [], toolCallId: 't', context: {} },
    );

describe('read tool', () => {
    it('says which branch it read and returns what the script printed', async () => {
        const result = await run(
            vi.fn().mockResolvedValue({
                branch: 'studio/orders',
                onPullRequest: true,
                logs: ['a', 'b'],
                error: null,
            }),
        );
        expect(result).toMatchObject({
            result: 'Read the pull request branch studio/orders.\na\nb',
            structuredContent: { branch: 'studio/orders', onPullRequest: true },
        });
    });

    it('gives a script error back to fix', async () => {
        const result = await run(
            vi.fn().mockResolvedValue({
                branch: 'main',
                onPullRequest: false,
                logs: [],
                error: 'x is not defined',
            }),
        );
        expect(result).toMatchObject({
            result: expect.stringContaining(
                'The script failed: x is not defined',
            ),
        });
    });
});
