import { type LanguageModel, type ModelMessage } from 'ai';
import { compactMessagesIfNeeded } from './compactMessages';

// Helper to create a mock model that returns a fixed summary
const createMockSummaryModel = (summaryText: string): LanguageModel =>
    ({
        // The actual model interface is complex, but generateText only needs
        // a model that can be passed to it. We'll mock at the module level.
    }) as unknown as LanguageModel;

// Mock generateText from 'ai' SDK
jest.mock('ai', () => ({
    ...jest.requireActual('ai'),
    generateText: jest.fn().mockResolvedValue({
        text: 'Summary: User asked about orders and customers. 97 completed orders. Top customer had $100.',
    }),
}));

describe('compactMessagesIfNeeded', () => {
    const mockModel = createMockSummaryModel('test');

    it('should not compact when below token threshold', async () => {
        const messages: ModelMessage[] = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
        ];

        const result = await compactMessagesIfNeeded({
            messages,
            summaryModel: mockModel,
        });

        expect(result.compacted).toBe(false);
        expect(result.messages).toBe(messages);
    });

    it('should not compact when message count is below RECENT_MESSAGES_TO_KEEP', async () => {
        // Even with lots of content, if there are fewer than 10 messages, don't compact
        const messages: ModelMessage[] = Array.from({ length: 8 }, (_, i) => ({
            role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
            content: 'x'.repeat(50000), // Lots of content per message
        }));

        const result = await compactMessagesIfNeeded({
            messages,
            summaryModel: mockModel,
        });

        expect(result.compacted).toBe(false);
    });

    it('should compact when both token threshold and message count are exceeded', async () => {
        // Create 20 messages with enough content to exceed 60000 tokens (~240000 chars)
        const messages: ModelMessage[] = Array.from({ length: 20 }, (_, i) => ({
            role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
            content: 'x'.repeat(15000), // 15000 chars * 20 = 300000 chars = ~75000 tokens
        }));

        const result = await compactMessagesIfNeeded({
            messages,
            summaryModel: mockModel,
        });

        expect(result.compacted).toBe(true);
        // Should have 1 summary + 10 recent = 11 messages
        expect(result.messages.length).toBe(11);
        // First message should be the summary
        expect(result.messages[0].role).toBe('user');
        expect(
            typeof result.messages[0].content === 'string' &&
                result.messages[0].content.startsWith(
                    '[Previous conversation summary]',
                ),
        ).toBe(true);
        // Recent messages should be preserved
        expect(result.messages.slice(1)).toEqual(messages.slice(10));
    });

    it('should handle messages with array content (tool calls)', async () => {
        const messages: ModelMessage[] = [
            ...Array.from({ length: 15 }, (_, i) => [
                {
                    role: 'user' as const,
                    content: 'x'.repeat(10000),
                },
                {
                    role: 'assistant' as const,
                    content: [
                        {
                            type: 'tool-call' as const,
                            toolCallId: `call-${i}`,
                            toolName: 'runQuery',
                            input: { query: 'x'.repeat(10000) },
                        },
                    ],
                },
            ]).flat(),
        ];

        const result = await compactMessagesIfNeeded({
            messages,
            summaryModel: mockModel,
        });

        expect(result.compacted).toBe(true);
        expect(result.messages.length).toBe(11);
    });
});
