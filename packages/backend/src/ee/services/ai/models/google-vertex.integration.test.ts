import {
    createContentToolDefinition,
    generateVisualizationToolDefinition,
    runQueryFilterExpressionToolDefinition,
    runQueryToolDefinition,
} from '@lightdash/common';
import { generateText, stepCountIs, streamText, tool, type Schema } from 'ai';
import { z } from 'zod';
import { aiCopilotConfigSchema } from '../../../../config/aiConfigSchema';
import { lightdashConfigMock } from '../../../../config/lightdashConfig.mock';
import { getLanguageModelAttribution } from '../utils/aiCallTelemetry';
import { getModel } from './index';

// Schema acceptance checks do not execute application tools or render results.
const schemaOnlyTool = <T>({
    description,
    inputSchema,
}: {
    description: string;
    inputSchema: Schema<T>;
}) => tool({ description, inputSchema });

// Opt-in only: makes billable requests using local Application Default
// Credentials or GOOGLE_VERTEX_API_KEY. Uses synthetic data and no database.
// Run with VERTEX_LIVE_TESTS=true, GOOGLE_VERTEX_PROJECT (for ADC), and
// pnpm -F backend exec vitest run --config vitest.config.vertex.integration.ts
describe.skipIf(process.env.VERTEX_LIVE_TESTS !== 'true')(
    'Vertex live API',
    () => {
        beforeAll(() => {
            // The shared unit-test setup stubs fetch to prevent network access.
            vi.unstubAllGlobals();
        });

        const getConfig = (modelName: string) =>
            aiCopilotConfigSchema.parse({
                ...lightdashConfigMock.ai.copilot,
                defaultProvider: 'vertex',
                providers: {
                    vertex: {
                        auth: process.env.GOOGLE_VERTEX_API_KEY
                            ? {
                                  type: 'api-key',
                                  apiKey: process.env.GOOGLE_VERTEX_API_KEY,
                              }
                            : {
                                  type: 'adc',
                                  project: process.env.GOOGLE_VERTEX_PROJECT,
                                  location:
                                      process.env.GOOGLE_VERTEX_LOCATION ??
                                      'global',
                              },
                        modelName,
                    },
                },
            });

        describe.each([
            {
                name: 'Gemini 3.6 Flash',
                modelName: 'gemini-3.6-flash',
                thinkingLevel: undefined,
            },
            // The customer's "3.6 Thinking" label needs an exact model-ID
            // confirmation. Exercise Flash's documented high-thinking mode.
            {
                name: 'Gemini 3.6 Flash with high thinking',
                modelName: 'gemini-3.6-flash',
                thinkingLevel: 'high' as const,
            },
            {
                name: 'Gemini 3.1 Pro',
                modelName: 'gemini-3.1-pro-preview',
                thinkingLevel: undefined,
            },
        ])('$name', ({ modelName, thinkingLevel }) => {
            const getOptions = () => ({
                ...getModel(getConfig(modelName), { modelName }),
                providerOptions: thinkingLevel
                    ? { vertex: { thinkingConfig: { thinkingLevel } } }
                    : undefined,
                maxRetries: 0,
                abortSignal: AbortSignal.timeout(90_000),
            });

            it('accepts the real query, filter-expression and content schemas', async () => {
                const options = getOptions();
                const result = await generateText({
                    ...options,
                    prompt: 'Reply with exactly: ready',
                    toolChoice: 'none',
                    tools: {
                        runQuery: schemaOnlyTool(
                            runQueryToolDefinition.for('agent'),
                        ),
                        runQueryExpression: schemaOnlyTool(
                            runQueryFilterExpressionToolDefinition.for('agent'),
                        ),
                        generateVisualization: schemaOnlyTool(
                            generateVisualizationToolDefinition.for('agent'),
                        ),
                        createContent: schemaOnlyTool(
                            createContentToolDefinition.for('agent'),
                        ),
                    },
                });
                expect(result.text.toLowerCase()).toContain('ready');
                expect(result.usage.inputTokens).toBeGreaterThan(0);
                expect(result.usage.outputTokens).toBeGreaterThan(0);
                expect(getLanguageModelAttribution(options.model)).toEqual({
                    provider: 'vertex',
                    model: modelName,
                });
            }, 100_000);

            it.each(['generate', 'stream'] as const)(
                'completes a %s tool round trip and a follow-up',
                async (mode) => {
                    const lookup = vi.fn(async () => ({ value: 42 }));
                    const options = {
                        ...getOptions(),
                        prompt: 'Call lookup with filter 7 and groupBy null, then report its returned value.',
                        tools: {
                            lookup: tool({
                                description: 'Look up a synthetic test value.',
                                inputSchema: z.object({
                                    filter: z.union([z.string(), z.number()]),
                                    groupBy: z.array(z.string()).nullable(),
                                }),
                                execute: lookup,
                            }),
                        },
                        stopWhen: stepCountIs(2),
                        prepareStep: ({
                            stepNumber,
                        }: {
                            stepNumber: number;
                        }) => ({
                            toolChoice:
                                stepNumber === 0
                                    ? {
                                          type: 'tool' as const,
                                          toolName: 'lookup' as const,
                                      }
                                    : ('none' as const),
                        }),
                    };
                    const result =
                        mode === 'generate'
                            ? await generateText(options)
                            : streamText(options);
                    expect(await result.text).toContain('42');
                    expect(lookup).toHaveBeenCalledTimes(1);
                    expect(await result.steps).toHaveLength(2);
                    expect(
                        (await result.totalUsage).inputTokens,
                    ).toBeGreaterThan(0);
                    expect(
                        (await result.totalUsage).outputTokens,
                    ).toBeGreaterThan(0);

                    const response = await result.response;
                    const followUp = await generateText({
                        ...getOptions(),
                        tools: options.tools,
                        toolChoice: 'none',
                        messages: [
                            { role: 'user', content: options.prompt },
                            ...response.messages,
                            {
                                role: 'user',
                                content: 'Repeat the value returned by lookup.',
                            },
                        ],
                    });
                    expect(followUp.text).toContain('42');
                },
                200_000,
            );
        });
    },
);
