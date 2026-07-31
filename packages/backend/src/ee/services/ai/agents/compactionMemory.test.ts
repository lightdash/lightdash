import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, type ModelMessage } from 'ai';
import { buildAgentMessages } from './agentV2';

const systemPrompt: ModelMessage = {
    role: 'system',
    content: 'You are Aurora.',
};

const history: ModelMessage[] = [
    { role: 'user', content: "who's using the metrics explorer?" },
    { role: 'assistant', content: 'Here you go.' },
    { role: 'user', content: 'always filter out Lightdash Internal' },
];

const offlineRequestError = 'offline Anthropic request reached';

const streamErrors = async (messages: ModelMessage[]): Promise<string[]> => {
    const anthropic = createAnthropic({
        apiKey: 'test-key',
        fetch: async () => {
            throw new Error(offlineRequestError);
        },
    });
    const result = streamText({
        model: anthropic('claude-sonnet-5'),
        messages,
    });
    const errors: string[] = [];
    // eslint-disable-next-line no-restricted-syntax
    for await (const part of result.fullStream) {
        if (part.type === 'error') {
            errors.push(String((part.error as Error)?.message ?? part.error));
        }
    }
    return errors;
};

describe('compaction and memory block ordering', () => {
    it('keeps the compaction summary before the memory block for Anthropic', async () => {
        const messages = buildAgentMessages({
            systemPrompt,
            compactionSummary: 'earlier summary',
            messageHistory: history,
            memoryBlock: '## Memories\n- user prefers org-level breakdowns',
        });

        expect(messages.map((m) => m.role)).toEqual([
            'system',
            'system',
            'user',
            'user',
            'assistant',
            'user',
        ]);

        const errors = await streamErrors(messages);
        expect(errors.join('\n')).toContain(offlineRequestError);
        expect(errors.join('\n')).not.toMatch(/Multiple system messages/);
    });

    it('does not throw when memory is disabled', async () => {
        const messages = buildAgentMessages({
            systemPrompt,
            compactionSummary: 'earlier summary',
            messageHistory: history,
            memoryBlock: null,
        });

        const errors = await streamErrors(messages);
        expect(errors.join('\n')).toContain(offlineRequestError);
        expect(errors.join('\n')).not.toMatch(/Multiple system messages/);
    });
});
