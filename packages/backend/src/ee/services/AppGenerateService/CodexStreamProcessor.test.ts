import { CodexStreamProcessor } from './CodexStreamProcessor';

const line = (value: unknown) => `${JSON.stringify(value)}\n`;

describe('CodexStreamProcessor', () => {
    test('maps reasoning, commands, the final message, and usage', () => {
        const processor = new CodexStreamProcessor();
        const events = processor.feedChunk(
            line({ type: 'turn.started' }) +
                line({
                    type: 'item.completed',
                    item: {
                        id: 'reasoning-1',
                        type: 'reasoning',
                        text: 'I will inspect the existing app first.',
                    },
                }) +
                line({
                    type: 'item.started',
                    item: {
                        id: 'command-1',
                        type: 'command_execution',
                        command: 'sed -n 1,120p App.tsx',
                    },
                }) +
                line({
                    type: 'item.completed',
                    item: {
                        id: 'command-1',
                        type: 'command_execution',
                        command: 'sed -n 1,120p App.tsx',
                    },
                }) +
                line({
                    type: 'item.completed',
                    item: {
                        id: 'message-1',
                        type: 'agent_message',
                        text: '{"fields":[]}',
                    },
                }) +
                line({
                    type: 'turn.completed',
                    usage: {
                        input_tokens: 1_000,
                        cached_input_tokens: 700,
                        output_tokens: 250,
                    },
                }),
        );

        expect(events).toEqual([
            { kind: 'thinking_started', turn: 1 },
            {
                kind: 'thinking_snippet',
                snippet: 'I will inspect the existing app first.',
            },
            {
                kind: 'tool_use',
                index: 1,
                description: 'Command sed -n 1,120p App.tsx',
            },
            {
                kind: 'result',
                text: '{"fields":[]}',
                structuredOutput: null,
            },
        ]);
        expect(processor.totalToolCalls).toBe(1);
        expect(processor.lastUsage).toEqual({
            inputTokens: 300,
            outputTokens: 250,
            cacheReadInputTokens: 700,
            cacheCreationInputTokens: 0,
            numTurns: 1,
            durationApiMs: 0,
            costUsd: 0,
        });
    });

    test('measures first-item latency and turn duration across chunks', () => {
        const clock = { now: 0 };
        const processor = new CodexStreamProcessor(() => clock.now);
        clock.now = 10;
        processor.feedChunk(line({ type: 'turn.started' }));
        clock.now = 50;
        processor.feedChunk(
            line({
                type: 'item.started',
                item: { id: 'cmd', type: 'command_execution', command: 'ls' },
            }),
        );
        clock.now = 110;
        processor.feedChunk(line({ type: 'turn.completed', usage: {} }));

        expect(processor.timeToFirstTokenMs).toBe(50);
        expect(processor.turnDurationsMs).toEqual([100]);
    });

    test('maps file change paths from the Codex changes array', () => {
        const processor = new CodexStreamProcessor();
        const events = processor.feedChunk(
            line({
                type: 'item.started',
                item: {
                    id: 'change-1',
                    type: 'file_change',
                    changes: [
                        { path: 'src/App.tsx', kind: 'update' },
                        { path: 'src/index.css', kind: 'update' },
                    ],
                    status: 'in_progress',
                },
            }) +
                line({
                    type: 'item.completed',
                    item: {
                        id: 'change-1',
                        type: 'file_change',
                        changes: [
                            { path: 'src/App.tsx', kind: 'update' },
                            { path: 'src/index.css', kind: 'update' },
                        ],
                        status: 'completed',
                    },
                }),
        );

        expect(events).toEqual([
            {
                kind: 'tool_use',
                index: 1,
                description: 'Edit src/App.tsx, src/index.css',
            },
        ]);
        expect(processor.totalToolCalls).toBe(1);
    });
});
