import { type AiAgentArgs } from '../types/aiAgent';
import {
    getAgentDecisionContext,
    getAgentRetrievalContext,
} from './agentQuestion';

const args = (messageHistory: AiAgentArgs['messageHistory']) => ({
    messageHistory,
    agentSettings: {
        instruction: 'Use calendar quarters.',
    } as AiAgentArgs['agentSettings'],
    compactionSummary: null,
});

describe('decision conversation context', () => {
    it('retains prior user scope and current pinned runtime overrides as separate messages', () => {
        const history: AiAgentArgs['messageHistory'] = [
            { role: 'user', content: 'Revenue for January 2024.' },
            { role: 'assistant', content: 'Revenue was 20.' },
            { role: 'user', content: 'Now split that by region.' },
            {
                role: 'user',
                content:
                    'Pinned chart: revenue. Date zoom: {"start":"2024-01-01","end":"2024-01-31"}',
            },
        ];
        const result = getAgentDecisionContext(args(history));
        expect(result.messages.map((message) => message.text)).toEqual(
            history.map((message) => message.content),
        );
        expect(result.instruction).toBe('Use calendar quarters.');
        expect(result.incomplete).toBe(false);
    });

    it('does not copy tool payloads or tool-call inputs into decisions', () => {
        const result = getAgentDecisionContext(
            args([
                { role: 'user', content: [{ type: 'text', text: 'Revenue' }] },
                {
                    role: 'assistant',
                    content: [
                        {
                            type: 'tool-call',
                            toolCallId: 'call',
                            toolName: 'getMetadata',
                            input: { secret: 'private-value' },
                        },
                    ],
                },
                {
                    role: 'tool',
                    content: [
                        {
                            type: 'tool-result',
                            toolCallId: 'call',
                            toolName: 'getMetadata',
                            output: { type: 'text', value: 'private-result' },
                        },
                    ],
                },
            ]),
        );
        expect(result.messages).toEqual([{ role: 'user', text: 'Revenue' }]);
        expect(JSON.stringify(result)).not.toContain('private-');
    });

    it('bounds whole messages and marks omitted evidence instead of silently truncating it', () => {
        const result = getAgentDecisionContext({
            ...args([
                { role: 'user', content: 'Earlier scope' },
                { role: 'user', content: 'x'.repeat(12_001) },
                { role: 'user', content: 'Same period, by region' },
            ]),
            compactionSummary: 's'.repeat(4_001),
        });
        expect(result.messages).toEqual([
            { role: 'user', text: 'Earlier scope' },
            { role: 'user', text: 'Same period, by region' },
        ]);
        expect(result.compactionSummary).toBeNull();
        expect(result.incomplete).toBe(true);
    });

    it('marks older excluded turns as incomplete context', () => {
        const result = getAgentDecisionContext(
            args(
                Array.from({ length: 12 }, (_, i) => ({
                    role: 'user',
                    content: `Turn ${i}`,
                })),
            ),
        );
        expect(result.messages).toHaveLength(8);
        expect(result.messages[0].text).toBe('Turn 4');
        expect(result.incomplete).toBe(true);
    });

    it('includes available project defaults, respecting runtime restrictions', () => {
        const input = {
            ...args([{ role: 'user' as const, content: 'Sales recently' }]),
            projectContextEnabled: true,
            projectContext: [
                {
                    id: 'recent',
                    kind: 'context' as const,
                    content: 'Recently means the last 30 completed days.',
                    terms: [],
                    objects: [],
                },
            ],
        };
        expect(getAgentDecisionContext(input).references).toEqual([
            {
                label: 'Project context: recent',
                content: 'Recently means the last 30 completed days.',
            },
        ]);
        expect(
            getAgentDecisionContext({ ...input, projectContextEnabled: false })
                .references,
        ).toEqual([]);
        expect(
            getAgentDecisionContext({
                ...input,
                execution: {
                    mode: 'standard',
                    maxSteps: 10,
                    toolAllowlist: new Set(['grepFields']),
                },
            }).references,
        ).toEqual([]);
    });

    it('uses already loaded document content and marks an oversized reference as incomplete', () => {
        const input = {
            ...args([{ role: 'user' as const, content: 'Sales recently' }]),
            knowledgeDocuments: [
                { name: 'Dates', content: 'Recently means the last 30 days.' },
                { name: 'Unloaded document', content: null },
                { name: 'Large reference', content: 'x'.repeat(8_001) },
            ],
        } as Parameters<typeof getAgentDecisionContext>[0];
        const result = getAgentDecisionContext(input);
        expect(result.references).toEqual([
            {
                label: 'Document: Dates',
                content: 'Recently means the last 30 days.',
            },
        ]);
        expect(result.incomplete).toBe(true);
    });
});

describe('retrieval conversation context', () => {
    it('retains prior subject, instructions and pinned scope without duplicating the current question', () => {
        const input = {
            ...args([
                {
                    role: 'user' as const,
                    content: 'Explain annual recurring revenue.',
                },
                {
                    role: 'assistant' as const,
                    content: 'ARR excludes one-off fees.',
                },
                {
                    role: 'user' as const,
                    content: 'Apply those rules to FY2027.',
                },
                {
                    role: 'user' as const,
                    content: 'Pinned chart scope: region = Europe.',
                },
            ]),
            userQuestion: 'Apply those rules to FY2027.',
        };
        const context = getAgentRetrievalContext(input);
        expect(context.messages.map(({ text }) => text)).toEqual([
            'Explain annual recurring revenue.',
            'ARR excludes one-off fees.',
            'Pinned chart scope: region = Europe.',
        ]);
        expect(context.instruction).toBe('Use calendar quarters.');
        expect(context.incomplete).toBe(false);
        expect(context).not.toHaveProperty('references');
    });

    it('bounds serialized multilingual history without cutting rules or exceptions', () => {
        const large = `${'規則'.repeat(1900)} EXCEPTION`;
        const context = getAgentRetrievalContext({
            ...args([
                { role: 'user' as const, content: large },
                {
                    role: 'assistant' as const,
                    content: 'Complete recent definition.',
                },
                { role: 'user' as const, content: 'And the fiscal dates?' },
            ]),
            userQuestion: 'And the fiscal dates?',
            compactionSummary: large,
        });
        expect(Buffer.byteLength(JSON.stringify(context))).toBeLessThanOrEqual(
            8000,
        );
        expect(context.incomplete).toBe(true);
        expect(context.messages).toEqual([
            { role: 'assistant', text: 'Complete recent definition.' },
        ]);
        expect(context.compactionSummary).toBeNull();
        expect(JSON.stringify(context)).not.toContain('規則');
    });
});
