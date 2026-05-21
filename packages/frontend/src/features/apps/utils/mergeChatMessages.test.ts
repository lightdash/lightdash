import { describe, expect, it } from 'vitest';
import { mergeChatMessages, type ChatMessage } from './mergeChatMessages';

const baseMessage: ChatMessage = {
    role: 'user',
    content: '',
    imagePreviewUrls: [],
    imageResourceIds: [],
    charts: [],
    dashboardName: null,
    clarifications: [],
    appUuid: null,
    version: null,
    timestamp: new Date('2026-05-15T10:00:00Z'),
    userName: 'Test User',
};

describe('mergeChatMessages', () => {
    it('returns history alone when local is empty', () => {
        const history: ChatMessage[] = [
            { ...baseMessage, content: 'prompt v1' },
        ];
        expect(mergeChatMessages(history, [], 1)).toEqual(history);
    });

    it('appends local entries when no version overlap with history', () => {
        const history: ChatMessage[] = [
            { ...baseMessage, content: 'old prompt' },
            {
                ...baseMessage,
                role: 'assistant',
                content: 'old reply',
                version: 5,
            },
        ];
        const local: ChatMessage[] = [
            { ...baseMessage, content: 'new prompt', submittedAtVersion: 5 },
        ];
        // Server hasn't produced v6 yet — maxHistoryVersion still 5 — so the
        // optimistic bubble must remain visible during the build.
        const merged = mergeChatMessages(history, local, 5);
        expect(merged).toHaveLength(3);
        expect(merged[2].content).toBe('new prompt');
    });

    it('drops the optimistic user bubble once a higher version exists in history', () => {
        // This is the duplicate-prompt bug: history has the just-built v10
        // containing the user's prompt, AND localMessages still has the
        // optimistic bubble for the same prompt. Without dedup, the chat
        // renders the prompt twice.
        const history: ChatMessage[] = [
            { ...baseMessage, content: 'asdf' },
            {
                ...baseMessage,
                role: 'assistant',
                content: 'Server reply',
                version: 10,
            },
        ];
        const local: ChatMessage[] = [
            { ...baseMessage, content: 'asdf', submittedAtVersion: 9 },
        ];
        const merged = mergeChatMessages(history, local, 10);
        const userBubbles = merged.filter((m) => m.role === 'user');
        expect(userBubbles).toHaveLength(1);
        // The kept user bubble should be the server-sourced one (no
        // submittedAtVersion marker), not the optimistic local copy.
        expect(userBubbles[0].submittedAtVersion).toBeUndefined();
    });

    it('keeps the optimistic bubble across a same-prompt resubmit', () => {
        // After v10 (built from "asdf") finishes, the user re-submits "asdf"
        // again. The new optimistic bubble has submittedAtVersion=10, which
        // equals (not less than) maxHistoryVersion=10 — so it stays visible
        // until v11 arrives.
        const history: ChatMessage[] = [
            { ...baseMessage, content: 'asdf' },
            {
                ...baseMessage,
                role: 'assistant',
                content: 'Server reply for v10',
                version: 10,
            },
        ];
        const local: ChatMessage[] = [
            { ...baseMessage, content: 'asdf', submittedAtVersion: 10 },
        ];
        const merged = mergeChatMessages(history, local, 10);
        expect(merged.filter((m) => m.role === 'user')).toHaveLength(2);
    });

    it('drops the resubmit bubble once v11 has built', () => {
        const history: ChatMessage[] = [
            { ...baseMessage, content: 'asdf' },
            {
                ...baseMessage,
                role: 'assistant',
                content: 'Reply v10',
                version: 10,
            },
            { ...baseMessage, content: 'asdf' },
            {
                ...baseMessage,
                role: 'assistant',
                content: 'Reply v11',
                version: 11,
            },
        ];
        const local: ChatMessage[] = [
            { ...baseMessage, content: 'asdf', submittedAtVersion: 10 },
        ];
        const merged = mergeChatMessages(history, local, 11);
        expect(merged.filter((m) => m.role === 'user')).toHaveLength(2);
    });

    it('never drops local assistant messages (error fallback bubbles)', () => {
        // onError pushes an assistant error message into localMessages.
        // It has no submittedAtVersion and must always survive the merge.
        const history: ChatMessage[] = [
            { ...baseMessage, content: 'asdf' },
            {
                ...baseMessage,
                role: 'assistant',
                content: 'Reply',
                version: 10,
            },
        ];
        const local: ChatMessage[] = [
            {
                ...baseMessage,
                role: 'assistant',
                content: 'Failed to generate app',
            },
        ];
        const merged = mergeChatMessages(history, local, 10);
        expect(merged).toContain(local[0]);
    });

    it('keeps optimistic bubbles that have no submittedAtVersion (legacy / mid-flight)', () => {
        // submittedAtVersion is optional. If absent, the bubble is treated as
        // un-acknowledged and kept — matches the pre-fix behaviour for
        // anything authored before the field existed.
        const history: ChatMessage[] = [
            {
                ...baseMessage,
                role: 'assistant',
                content: 'Reply',
                version: 10,
            },
        ];
        const local: ChatMessage[] = [
            { ...baseMessage, content: 'legacy bubble' },
        ];
        const merged = mergeChatMessages(history, local, 10);
        expect(merged).toContain(local[0]);
    });
});
