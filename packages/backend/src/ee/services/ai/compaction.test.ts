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
                steers: [],
                hidden: false,
            },
            {
                role: 'assistant',
                status: 'idle',
                uuid: 'prompt-1',
                threadUuid: 'thread-1',
                message: 'Running checks',
                errorMessage: null,
                interrupted: false,
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

    it('serializes a same-named file and repository as distinct, unambiguous lines', () => {
        const serialized = Compaction.serializeConversation([
            {
                role: 'user',
                uuid: 'prompt-1',
                threadUuid: 'thread-1',
                message: 'Look at hello/world',
                createdAt: new Date().toISOString(),
                user: { uuid: 'user-1', name: 'Test User' },
                context: [
                    { type: 'file', path: 'hello/world' },
                    { type: 'repository', fullName: 'hello/world' },
                ],
                steers: [],
                hidden: false,
            },
        ]);

        // The bare text 'hello/world' is ambiguous, but the pinned context
        // names each one's repo-filesystem mount path so they can't be confused.
        expect(serialized).toContain('file /dbt/hello/world');
        expect(serialized).toContain(
            'repository hello/world (mounted at /hello/world',
        );
    });

    it('preserves the active dashboard tab in compacted context', () => {
        const serialized = Compaction.serializeConversation([
            {
                role: 'user',
                uuid: 'prompt-1',
                threadUuid: 'thread-1',
                message: 'Summarize this dashboard',
                createdAt: new Date().toISOString(),
                user: { uuid: 'user-1', name: 'Test User' },
                context: [
                    {
                        type: 'dashboard',
                        dashboardUuid: 'dashboard-1',
                        dashboardSlug: 'dashboard-1',
                        displayName: 'Executive dashboard',
                        pinnedVersionUuid: null,
                        runtimeOverrides: {
                            activeTab: {
                                uuid: 'tab-1',
                                name: 'Customers',
                            },
                        },
                    },
                ],
                steers: [],
                hidden: false,
            },
        ]);

        expect(serialized).toContain('active tab "Customers"');
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

    describe('isUsableSummary', () => {
        const serializedInputChars = 10000;

        it('rejects empty and whitespace-only summaries', () => {
            expect(
                Compaction.isUsableSummary({
                    summary: '',
                    serializedInputChars,
                }),
            ).toBe(false);
            expect(
                Compaction.isUsableSummary({
                    summary: '   \n\t\n  ',
                    serializedInputChars,
                }),
            ).toBe(false);
        });

        it('rejects placeholder-only summaries', () => {
            expect(
                Compaction.isUsableSummary({
                    summary: '[no further messages]',
                    serializedInputChars,
                }),
            ).toBe(false);
            expect(
                Compaction.isUsableSummary({
                    summary: '[no assistant message]',
                    serializedInputChars,
                }),
            ).toBe(false);
            expect(
                Compaction.isUsableSummary({
                    summary: '  [no content]  \n[none]',
                    serializedInputChars,
                }),
            ).toBe(false);
        });

        it('rejects summaries that are only markdown structure', () => {
            expect(
                Compaction.isUsableSummary({
                    summary:
                        '## Goal\n## Progress\n### Done\n[no further messages]\n## Next Steps',
                    serializedInputChars,
                }),
            ).toBe(false);
        });

        it('rejects trivially short summaries for large inputs', () => {
            expect(
                Compaction.isUsableSummary({
                    summary: '## Goal\nn/a',
                    serializedInputChars: 10000,
                }),
            ).toBe(false);
        });

        it('accepts a short summary when the input is also small', () => {
            expect(
                Compaction.isUsableSummary({
                    summary: 'User said hi.',
                    serializedInputChars: 50,
                }),
            ).toBe(true);
        });

        it('accepts a legitimate structured summary', () => {
            expect(
                Compaction.isUsableSummary({
                    summary: [
                        '## Goal',
                        'Analyze monthly revenue by region for 2025.',
                        '## Progress',
                        '### Done',
                        'Built a bar chart of revenue by region (artifact "Revenue by region").',
                        '## Next Steps',
                        'Add a month-over-month growth metric.',
                    ].join('\n'),
                    serializedInputChars,
                }),
            ).toBe(true);
        });

        it('accepts summaries containing bracketed text within sentences', () => {
            expect(
                Compaction.isUsableSummary({
                    summary:
                        'User pinned chart [Revenue 2025] and asked for a breakdown by country.',
                    serializedInputChars,
                }),
            ).toBe(true);
        });
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
