import {
    ForbiddenError,
    toolReadPinnedThreadOutputSchema,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { getReadPinnedThread } from './readPinnedThread';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const THREAD_UUID = '2f1c6f4e-0b6a-4d7d-9d0a-1c2b3d4e5f60';

const execute = async (
    tool: ReturnType<typeof getReadPinnedThread>,
    threadUuid: string,
) => {
    if (!tool.execute) throw new Error('readPinnedThread has no execute');
    const output = await tool.execute(
        { threadUuid },
        { messages: [], toolCallId: 'tool-call-1' },
    );
    const parsed = toolReadPinnedThreadOutputSchema.safeParse(output);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw parsed.error;
    return parsed.data;
};

describe('getReadPinnedThread', () => {
    it('renders the transcript as text and as structured content from the same messages', async () => {
        const output = await execute(
            getReadPinnedThread({
                readPinnedThread: vi.fn().mockResolvedValue([
                    {
                        role: 'user',
                        message: 'What were sales last month?',
                        createdAt: '2026-09-01T10:00:00.000Z',
                    },
                    {
                        role: 'assistant',
                        message: 'Sales were 1,200 orders.',
                        createdAt: '2026-09-01T10:00:05.000Z',
                    },
                ]),
            }),
            THREAD_UUID,
        );

        expect(output.metadata).toEqual({
            status: 'success',
            messageCount: 2,
        });
        expect(output.result).toBe(
            [
                `<conversation threadUuid="${THREAD_UUID}">`,
                '  <message role="user" index="0" createdAt="2026-09-01T10:00:00.000Z">What were sales last month?</message>',
                '  <message role="assistant" index="1" createdAt="2026-09-01T10:00:05.000Z">Sales were 1,200 orders.</message>',
                '</conversation>',
            ].join('\n'),
        );
        expect(output.structuredContent).toEqual({
            threadUuid: THREAD_UUID,
            messages: [
                {
                    index: 0,
                    role: 'user',
                    createdAt: '2026-09-01T10:00:00.000Z',
                    message: 'What were sales last month?',
                },
                {
                    index: 1,
                    role: 'assistant',
                    createdAt: '2026-09-01T10:00:05.000Z',
                    message: 'Sales were 1,200 orders.',
                },
            ],
        });
    });

    it('returns an empty transcript when the pinned thread has no messages', async () => {
        const output = await execute(
            getReadPinnedThread({
                readPinnedThread: vi.fn().mockResolvedValue([]),
            }),
            THREAD_UUID,
        );

        expect(output.metadata).toEqual({
            status: 'success',
            messageCount: 0,
        });
        expect(output.result).toBe(
            `<conversation threadUuid="${THREAD_UUID}"/>`,
        );
        expect(output.structuredContent).toEqual({
            threadUuid: THREAD_UUID,
            messages: [],
        });
    });

    it('truncates each message and the whole transcript identically in text and structured content', async () => {
        const output = await execute(
            getReadPinnedThread({
                readPinnedThread: vi.fn().mockResolvedValue(
                    Array.from({ length: 11 }, (_, i) => ({
                        role: i % 2 === 0 ? 'user' : 'assistant',
                        message: 'x'.repeat(5_000),
                        createdAt: `2026-09-01T10:00:${String(i).padStart(
                            2,
                            '0',
                        )}.000Z`,
                    })),
                ),
            }),
            THREAD_UUID,
        );

        if (!('messages' in output.structuredContent)) {
            throw new Error('expected a transcript');
        }
        const lengths = output.structuredContent.messages.map(
            (message) => message.message.length,
        );
        // 10 x 4,000 chars exhaust the 40,000 transcript budget; the 11th is empty.
        expect(lengths).toEqual([...Array(10).fill(4_000), 0]);
        expect(output.metadata).toEqual({
            status: 'success',
            messageCount: 11,
        });
        expect(output.result).toContain(
            `<message role="user" index="0" createdAt="2026-09-01T10:00:00.000Z">${'x'.repeat(
                4_000,
            )}</message>`,
        );
        expect(output.result).toContain(
            '<message role="user" index="10" createdAt="2026-09-01T10:00:10.000Z"/>',
        );
    });

    it('mirrors the error text in structuredContent when the thread is not pinned', async () => {
        const output = await execute(
            getReadPinnedThread({
                readPinnedThread: vi
                    .fn()
                    .mockRejectedValue(
                        new ForbiddenError(
                            'Thread is not pinned as context on this conversation',
                        ),
                    ),
            }),
            THREAD_UUID,
        );

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error reading pinned conversation.');
        expect(output.result).toContain(
            'Thread is not pinned as context on this conversation',
        );
        expect(output.structuredContent).toEqual({ error: output.result });
    });
});
