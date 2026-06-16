import { type AiAgentToolResult } from '@lightdash/common';
import { Compaction } from './compaction';

describe('AI context compaction helpers', () => {
    it('triggers compaction when total tokens exceed the reserved budget', () => {
        expect(
            Compaction.shouldCompactPrompt({
                totalTokens: 184000,
                contextWindowTokens: 200000,
                reserveTokens: 16384,
            }),
        ).toBe(true);

        expect(
            Compaction.shouldCompactPrompt({
                totalTokens: 180000,
                contextWindowTokens: 200000,
                reserveTokens: 30000,
            }),
        ).toBe(true);

        expect(
            Compaction.shouldCompactPrompt({
                totalTokens: 150000,
                contextWindowTokens: 200000,
                reserveTokens: 16384,
            }),
        ).toBe(false);
    });

    it('serializes messages and truncates large tool results', () => {
        const serialized = Compaction.serializeConversation([
            {
                role: 'user',
                uuid: 'prompt-1',
                threadUuid: 'thread-1',
                message: 'Summarize this thread',
                createdAt: new Date().toISOString(),
                user: { uuid: 'user-1', name: 'Test User' },
                context: [
                    {
                        type: 'chart',
                        chartUuid: 'chart-1',
                        chartSlug: null,
                        displayName: 'Revenue',
                        pinnedVersionUuid: null,
                        runtimeOverrides: null,
                        chartKind: null,
                    },
                ],
                hidden: false,
            },
            {
                role: 'assistant',
                status: 'idle',
                uuid: 'prompt-1',
                threadUuid: 'thread-1',
                message: 'Running checks',
                errorMessage: null,
                createdAt: new Date().toISOString(),
                humanScore: null,
                toolCalls: [
                    {
                        uuid: 'tool-call-row-1',
                        promptUuid: 'prompt-1',
                        toolCallId: 'tool-1',
                        parentToolCallId: null,
                        createdAt: new Date(),
                        toolType: 'built-in',
                        toolName: 'findContent',
                        toolArgs: { query: 'revenue' },
                    },
                ],
                toolResults: [
                    {
                        uuid: 'tool-result-row-1',
                        promptUuid: 'prompt-1',
                        toolCallId: 'tool-1',
                        createdAt: new Date(),
                        toolType: 'built-in',
                        toolName: 'findContent',
                        result: 'x'.repeat(2500),
                        metadata: null,
                    } as unknown as AiAgentToolResult,
                ],
                reasoning: [],
                savedQueryUuid: null,
                artifacts: null,
                referencedArtifacts: null,
                modelConfig: null,
                tokenUsage: null,
            },
        ]);

        expect(serialized).toContain('[User]: Summarize this thread');
        expect(serialized).toContain('[Pinned context]:');
        expect(serialized).toContain('[Assistant tool calls]:');
        expect(serialized).toContain('[Tool result: findContent]:');
        expect(serialized).toContain('[truncated 500 chars]');
    });

    it('filters raw prompt rows after the latest compaction boundary', () => {
        const filtered = Compaction.filterThreadMessagesAfterCompaction(
            [
                { ai_prompt_uuid: 'prompt-1' },
                { ai_prompt_uuid: 'prompt-2' },
                { ai_prompt_uuid: 'prompt-3' },
            ],
            'prompt-2',
        );

        expect(filtered).toEqual([{ ai_prompt_uuid: 'prompt-3' }]);
    });

    it('selects the raw message range to compact', () => {
        const messagesToCompact = Compaction.getMessagesToCompact(
            [{ uuid: 'prompt-1' }, { uuid: 'prompt-2' }, { uuid: 'prompt-3' }],
            {
                compactedThroughPromptUuid: 'prompt-1',
                compactThroughPromptUuid: 'prompt-3',
            },
        );

        expect(messagesToCompact).toEqual([
            { uuid: 'prompt-2' },
            { uuid: 'prompt-3' },
        ]);
    });

    it('matches the triggering prompt for compaction UI events', () => {
        expect(
            Compaction.isCompactionPrompt(
                { triggering_ai_prompt_uuid: 'prompt-2' },
                { promptUuid: 'prompt-2' },
            ),
        ).toBe(true);

        expect(
            Compaction.isCompactionPrompt(
                { triggering_ai_prompt_uuid: 'prompt-2' },
                { promptUuid: 'prompt-3' },
            ),
        ).toBe(false);
    });
});
