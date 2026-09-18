import { generateText, stepCountIs, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';
import type { AiAgentArgs } from '../types/aiAgent';
import {
    CODE_MODE_TOOL_NAME,
    getAgentToolRouting,
    TOOL_SEARCH_TOOL_NAME,
    withToolSearch,
} from './agentToolRouting';

type DoGenerateOptions = Parameters<MockLanguageModelV4['doGenerate']>[0];
type GenerateResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>;

const usage: GenerateResult['usage'] = {
    inputTokens: {
        total: 1,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
    },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const toolCallResponse = (toolName: string, input: object): GenerateResult => ({
    content: [
        {
            type: 'tool-call',
            toolCallId: `${toolName}-call`,
            toolName,
            input: JSON.stringify(input),
        },
    ],
    finishReason: { unified: 'tool-calls', raw: undefined },
    usage,
    warnings: [],
});

const textResponse = (text: string): GenerateResult => ({
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: undefined },
    usage,
    warnings: [],
});

const toolNames = (options: DoGenerateOptions) =>
    (options.tools ?? []).map((sdkTool) => sdkTool.name).sort();

const userMessageTexts = (options: DoGenerateOptions) =>
    options.prompt.flatMap((message) =>
        message.role === 'user'
            ? message.content.flatMap((part) =>
                  part.type === 'text' ? [part.text] : [],
              )
            : [],
    );

const standardExecution: AiAgentArgs['execution'] = {
    mode: 'standard',
    maxSteps: 10,
};

const stubTool = (execute: (input: { q: string }) => unknown) =>
    tool({
        description: 'stub tool',
        inputSchema: z.object({ q: z.string() }),
        execute: async (input) => execute(input),
    });

describe('agent tool routing through the AI SDK', () => {
    it('hides deferred tools until the model searches for them', async () => {
        const createScheduledDelivery = vi.fn(() => ({
            result: 'scheduled',
            metadata: { status: 'success' },
        }));
        const tools = withToolSearch({
            tools: {
                grepFields: stubTool(() => ({
                    result: 'fields',
                    metadata: { status: 'success' },
                })),
                createScheduledDelivery: stubTool(createScheduledDelivery),
            },
            toolHints: [],
            messageHistory: [],
            mcpToolNames: [],
        });
        const providerToolNames: string[][] = [];
        const model = new MockLanguageModelV4({
            doGenerate: async (options) => {
                providerToolNames.push(toolNames(options));
                switch (providerToolNames.length) {
                    case 1:
                        return toolCallResponse(TOOL_SEARCH_TOOL_NAME, {
                            query: 'scheduled delivery',
                        });
                    case 2:
                        return toolCallResponse('createScheduledDelivery', {
                            q: 'weekly',
                        });
                    default:
                        return textResponse('done');
                }
            },
        });

        const result = await generateText({
            model,
            tools,
            stopWhen: stepCountIs(5),
            prompt: 'schedule the report',
        });

        expect(providerToolNames).toEqual([
            ['grepFields', TOOL_SEARCH_TOOL_NAME],
            ['createScheduledDelivery', 'grepFields', TOOL_SEARCH_TOOL_NAME],
            ['createScheduledDelivery', 'grepFields', TOOL_SEARCH_TOOL_NAME],
        ]);
        expect(createScheduledDelivery).toHaveBeenCalledWith({ q: 'weekly' });
        expect(result.text).toBe('done');
    });

    it('runs a program that calls a routed tool from the sandbox', async () => {
        const grepFields = vi.fn(() => ({
            result: 'fields',
            metadata: { status: 'success' },
        }));
        const routing = getAgentToolRouting(
            { grepFields: stubTool(grepFields) },
            { enableCodeMode: true, execution: standardExecution },
        );
        const calls: DoGenerateOptions[] = [];
        const model = new MockLanguageModelV4({
            doGenerate: async (options) => {
                calls.push(options);
                return calls.length === 1
                    ? toolCallResponse(CODE_MODE_TOOL_NAME, {
                          js: "const found = await tools.grepFields({ q: 'revenue' }); return { got: found.result };",
                      })
                    : textResponse('done');
            },
        });

        const result = await generateText({
            model,
            tools: routing.tools,
            experimental_toolCallers: routing.toolCallers,
            stopWhen: stepCountIs(5),
            prompt: 'combine the results',
        });

        expect(toolNames(calls[0])).toEqual([
            'grepFields',
            CODE_MODE_TOOL_NAME,
        ]);
        // 'conversation' discovery announces the catalog in a user message.
        expect(
            userMessageTexts(calls[0]).some((text) =>
                text.includes('grepFields'),
            ),
        ).toBe(true);
        expect(grepFields).toHaveBeenCalledWith({ q: 'revenue' });
        expect(result.steps[0].toolResults[0].output).toEqual({
            got: 'fields',
        });
        expect(result.text).toBe('done');
    });
});
