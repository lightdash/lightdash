import {
    addClaudeUsage,
    ClaudeStreamProcessor,
    ZERO_CLAUDE_USAGE,
    type ClaudeGenerationUsage,
} from './ClaudeStreamProcessor';

// Lines are only consumed once a newline arrives, so every fixture ends in \n.
const line = (obj: unknown) => `${JSON.stringify(obj)}\n`;

const resultLine = (overrides: Record<string, unknown> = {}) =>
    line({
        type: 'result',
        subtype: 'success',
        is_error: false,
        duration_ms: 380_000,
        duration_api_ms: 350_000,
        num_turns: 42,
        result: 'Done building the dashboard.',
        total_cost_usd: 1.23,
        usage: {
            input_tokens: 1_000,
            output_tokens: 5_000,
            cache_creation_input_tokens: 2_000,
            cache_read_input_tokens: 40_000,
        },
        ...overrides,
    });

describe('ClaudeStreamProcessor result parsing', () => {
    test('emits a result event with text and captures full usage', () => {
        const processor = new ClaudeStreamProcessor();
        const events = processor.feedChunk(resultLine());

        expect(events).toEqual([
            { kind: 'result', text: 'Done building the dashboard.' },
        ]);
        expect(processor.lastUsage).toEqual({
            inputTokens: 1_000,
            outputTokens: 5_000,
            cacheCreationInputTokens: 2_000,
            cacheReadInputTokens: 40_000,
            numTurns: 42,
            durationApiMs: 350_000,
            costUsd: 1.23,
        });
    });

    test('defaults missing numeric fields to 0 and absent text to empty string', () => {
        const processor = new ClaudeStreamProcessor();
        const events = processor.feedChunk(
            line({ type: 'result', subtype: 'success' }),
        );

        expect(events).toEqual([{ kind: 'result', text: '' }]);
        expect(processor.lastUsage).toEqual(ZERO_CLAUDE_USAGE);
    });

    test('ignores non-JSON and non-result lines, leaving usage null', () => {
        const processor = new ClaudeStreamProcessor();
        expect(processor.feedChunk('not json\n')).toEqual([]);
        expect(processor.feedChunk(line({ type: 'system' }))).toEqual([]);
        expect(processor.lastUsage).toBeNull();
    });

    test('still counts tool_use calls from assistant events', () => {
        const processor = new ClaudeStreamProcessor();
        const events = processor.feedChunk(
            line({
                type: 'assistant',
                message: {
                    content: [
                        {
                            type: 'tool_use',
                            name: 'Write',
                            input: { file_path: '/app/src/App.tsx' },
                        },
                    ],
                },
            }),
        );

        expect(events).toEqual([
            {
                kind: 'tool_use',
                index: 1,
                description: 'Write /app/src/App.tsx',
            },
        ]);
        expect(processor.totalToolCalls).toBe(1);
    });
});

describe('addClaudeUsage', () => {
    const usage = (n: number): ClaudeGenerationUsage => ({
        inputTokens: n,
        outputTokens: n,
        cacheReadInputTokens: n,
        cacheCreationInputTokens: n,
        numTurns: n,
        durationApiMs: n,
        costUsd: n,
    });

    test('sums two usage records field-by-field', () => {
        expect(addClaudeUsage(usage(1), usage(2))).toEqual(usage(3));
    });

    test('treats null as all-zero', () => {
        expect(addClaudeUsage(usage(5), null)).toEqual(usage(5));
        expect(addClaudeUsage(ZERO_CLAUDE_USAGE, null)).toEqual(
            ZERO_CLAUDE_USAGE,
        );
    });
});
