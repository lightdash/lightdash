import { describe, expect, it } from 'vitest';
import { emptyChatMessage, type ChatMessage } from './chatMessage';
import { getHistoryLiveBuild } from './historyLiveBuild';

const message = (role: ChatMessage['role'], content: string): ChatMessage => ({
    ...emptyChatMessage(),
    role,
    content,
    timestamp: new Date('2026-01-01T00:00:00Z'),
});

describe('getHistoryLiveBuild', () => {
    it('is null when no version is awaited, whatever is queued locally', () => {
        expect(
            getHistoryLiveBuild([message('user', 'add a chart')], false),
        ).toBe(null);
    });

    it('carries the newest local prompt while the server has not claimed a version', () => {
        expect(
            getHistoryLiveBuild(
                [
                    message('user', 'first'),
                    message('assistant', 'done'),
                    message('user', 'second'),
                ],
                true,
            ),
        ).toEqual({ claimedVersion: null, pendingPrompt: 'second' });
    });

    it('has no prompt when nothing is queued locally', () => {
        expect(getHistoryLiveBuild([], true)).toEqual({
            claimedVersion: null,
            pendingPrompt: null,
        });
    });
});
