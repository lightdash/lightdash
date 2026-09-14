import { APICallError } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { getAiCallTelemetry } from '../ai/utils/aiCallTelemetry';
import { runAutopilotAgent } from './AutopilotAgentRunner';
import { renderAutopilotAgent } from './config/agent';

const usage = {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 5, text: 5, reasoning: 0 },
    totalTokens: 15,
};

type DoGenerateOptions = Parameters<MockLanguageModelV3['doGenerate']>[0];

type MockTurn =
    | { toolName: string; input: Record<string, unknown> }
    | { text: string };

const toolCallTurn = (toolName: string, input: Record<string, unknown>) => ({
    content: [
        {
            type: 'tool-call' as const,
            toolCallId: `call-${toolName}`,
            toolName,
            input: JSON.stringify(input),
        },
    ],
    finishReason: { unified: 'tool-calls' as const, raw: undefined },
    usage,
    warnings: [],
});

const textTurn = (text: string) => ({
    content: [{ type: 'text' as const, text }],
    finishReason: { unified: 'stop' as const, raw: undefined },
    usage,
    warnings: [],
});

// Replays scripted turns; the last turn repeats so step caps can be exercised.
const buildScriptedModel = (turns: MockTurn[]) => {
    const calls: DoGenerateOptions[] = [];
    const model = new MockLanguageModelV3({
        modelId: 'mock-autopilot-model',
        doGenerate: async (options) => {
            calls.push(options);
            const turn = turns[Math.min(calls.length - 1, turns.length - 1)];
            return 'text' in turn
                ? textTurn(turn.text)
                : toolCallTurn(turn.toolName, turn.input);
        },
    });
    return { model, calls };
};

const telemetry = getAiCallTelemetry({
    functionId: 'test',
    feature: 'managed-agent',
    keyManagement: null,
});

const agent = renderAutopilotAgent({ runtime: 'ai-sdk' });

const baseArgs = {
    callOptions: {},
    providerOptions: undefined,
    agent,
    dataTools: {},
    availableExplores: [],
    projectName: 'Jaffle shop',
    maxSteps: 10,
    timeoutMs: 5_000,
    telemetry,
};

describe('runAutopilotAgent', () => {
    it('runs the tool loop until the model ends its turn and captures the Slack summary', async () => {
        const { model, calls } = buildScriptedModel([
            { toolName: 'get_recent_actions', input: { limit: 5 } },
            {
                toolName: 'write_slack_summary',
                input: { summary: 'Nothing to report.' },
            },
            { text: 'Done.' },
        ]);
        const executeTool = vi.fn().mockResolvedValue('{"actions":[]}');

        const result = await runAutopilotAgent({
            ...baseArgs,
            model,
            executeTool,
        });

        expect(executeTool).toHaveBeenCalledTimes(1);
        expect(executeTool).toHaveBeenCalledWith(
            'get_recent_actions',
            { limit: 5 },
            expect.any(AbortSignal),
        );
        expect(result).toMatchObject({
            slackSummary: 'Nothing to report.',
            stepCount: 3,
            stopReason: 'end_turn',
        });
        expect(calls[0].prompt[0]).toMatchObject({
            role: 'system',
            content: expect.stringContaining('You are Autopilot'),
        });
        const kickoff = JSON.stringify(calls[0].prompt[1]);
        expect(kickoff).toContain('Analyze project');
        expect(kickoff).toContain('Jaffle shop');
    });

    it('stops at the step cap while the model still wants tools', async () => {
        const { model } = buildScriptedModel([
            { toolName: 'get_stale_charts', input: {} },
        ]);

        const result = await runAutopilotAgent({
            ...baseArgs,
            model,
            maxSteps: 2,
            executeTool: vi.fn().mockResolvedValue('[]'),
        });

        expect(result).toMatchObject({
            slackSummary: null,
            stepCount: 2,
            stopReason: 'step_cap',
        });
    });

    it('feeds a failing tool handler back to the model and keeps going', async () => {
        const { model, calls } = buildScriptedModel([
            { toolName: 'get_broken_content', input: {} },
            { text: 'Could not load broken content.' },
        ]);

        const result = await runAutopilotAgent({
            ...baseArgs,
            model,
            executeTool: vi.fn().mockRejectedValue(new Error('db down')),
        });

        expect(result.stopReason).toBe('end_turn');
        expect(JSON.stringify(calls[1].prompt)).toContain('db down');
    });

    it('reports a timeout and keeps what was captured before it', async () => {
        const executeTool = vi.fn().mockResolvedValue('[]');
        let generateCount = 0;
        const model = new MockLanguageModelV3({
            modelId: 'mock-autopilot-model',
            doGenerate: async ({ abortSignal }) => {
                generateCount += 1;
                if (generateCount === 1) {
                    return toolCallTurn('write_slack_summary', {
                        summary: 'Partial run.',
                    });
                }
                return new Promise((_, reject) => {
                    abortSignal?.addEventListener('abort', () =>
                        reject(abortSignal.reason),
                    );
                });
            },
        });

        const result = await runAutopilotAgent({
            ...baseArgs,
            model,
            timeoutMs: 50,
            executeTool,
        });

        expect(result).toMatchObject({
            slackSummary: 'Partial run.',
            stepCount: 1,
            stopReason: 'timeout',
        });
    });

    it('records provider errors that are not a timeout', async () => {
        const model = new MockLanguageModelV3({
            modelId: 'mock-autopilot-model',
            doGenerate: async () => {
                throw new Error('invalid api key');
            },
        });

        await expect(
            runAutopilotAgent({
                ...baseArgs,
                model,
                callOptions: { maxRetries: 0 },
                executeTool: vi.fn(),
            }),
        ).resolves.toMatchObject({
            stopReason: 'error',
            error: 'invalid api key',
        });
    });
    it('serializes same-step actions so the last deletion slot cannot be spent twice', async () => {
        let count = 24;
        const first = toolCallTurn('soft_delete_content', {
            target_uuid: 'first',
        });
        const second = toolCallTurn('soft_delete_content', {
            target_uuid: 'second',
        });
        const model = new MockLanguageModelV3({
            doGenerate: async () => ({
                ...first,
                content: [
                    first.content[0],
                    { ...second.content[0], toolCallId: 'second' },
                ],
            }),
        });
        await runAutopilotAgent({
            ...baseArgs,
            model,
            maxSteps: 1,
            executeTool: async () => {
                const previousCount = count;
                await new Promise((resolve) => {
                    setTimeout(resolve, 5);
                });
                if (previousCount < 25) count += 1;
                return '{}';
            },
        });
        expect(count).toBe(25);
    });

    it('drains an active action on timeout and never starts queued actions', async () => {
        let effectFinished = false;
        const first = toolCallTurn('get_recent_actions', {});
        const second = toolCallTurn('get_stale_charts', {});
        const model = new MockLanguageModelV3({
            doGenerate: async () => ({
                ...first,
                content: [first.content[0], second.content[0]],
            }),
        });
        const executeTool = vi.fn().mockImplementation(async () => {
            await new Promise((resolve) => {
                setTimeout(resolve, 60);
            });
            effectFinished = true;
            return '{}';
        });
        const result = await runAutopilotAgent({
            ...baseArgs,
            model,
            maxSteps: 1,
            timeoutMs: 20,
            executeTool,
        });
        expect(executeTool).toHaveBeenCalledTimes(1);
        expect(effectFinished).toBe(true);
        expect(result.stopReason).toBe('timeout');
    });

    it.each(['length', 'content-filter', 'error', 'other'] as const)(
        'records %s termination as an incomplete run',
        async (reason) => {
            const model = new MockLanguageModelV3({
                doGenerate: async () => ({
                    ...textTurn('Partial run'),
                    finishReason: { unified: reason, raw: undefined },
                }),
            });
            const result = await runAutopilotAgent({
                ...baseArgs,
                model,
                executeTool: vi.fn(),
            });
            expect(result.stopReason).not.toBe('end_turn');
            expect(result).toHaveProperty('error', expect.any(String));
        },
    );

    it('ends once on context overflow and retains completed actions and summary', async () => {
        const actions: string[] = [];
        let calls = 0;
        const model = new MockLanguageModelV3({
            doGenerate: async () => {
                calls += 1;
                if (calls === 1)
                    return toolCallTurn('log_insight', {
                        title: 'Backlog',
                        description: '350 broken charts',
                    });
                if (calls === 2)
                    return toolCallTurn('write_slack_summary', {
                        summary: 'Backlog recorded; remaining work incomplete.',
                    });
                throw new APICallError({
                    message: 'maximum context length exceeded',
                    url: 'https://provider.invalid/messages',
                    requestBodyValues: {},
                    statusCode: 400,
                    isRetryable: false,
                });
            },
        });
        const result = await runAutopilotAgent({
            ...baseArgs,
            model,
            executeTool: async (name) => {
                actions.push(name);
                return '{"ok":true}';
            },
        });
        expect(result).toMatchObject({
            stopReason: 'error',
            stepCount: 2,
            error: 'maximum context length exceeded',
            slackSummary: 'Backlog recorded; remaining work incomplete.',
        });
        expect(calls).toBe(3);
        expect(actions).toEqual(['log_insight']);
    });

    it('keeps the summary when the next provider call fails', async () => {
        let turn = 0;
        const model = new MockLanguageModelV3({
            doGenerate: async () => {
                turn += 1;
                if (turn === 1)
                    return toolCallTurn('write_slack_summary', {
                        summary: 'Partial run.',
                    });
                throw new Error('provider failed');
            },
        });
        await expect(
            runAutopilotAgent({ ...baseArgs, model, executeTool: vi.fn() }),
        ).resolves.toMatchObject({
            slackSummary: 'Partial run.',
            stepCount: 1,
            stopReason: 'error',
            error: 'provider failed',
        });
    });
});
