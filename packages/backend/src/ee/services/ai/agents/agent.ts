import { AnyType, assertUnreachable } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import {
    generateObject,
    generateText,
    NoSuchToolError,
    smoothStream,
    streamText,
} from 'ai';
import type { ZodType } from 'zod';
import Logger from '../../../../logging/logger';
import { getSystemPrompt } from '../prompts/system';
import { getFindExplores } from '../tools/findExplores';
import { getFindFields } from '../tools/findFields';
import { getGenerateBarVizConfig } from '../tools/generateBarVizConfig';
import { getGenerateTableVizConfig } from '../tools/generateTableVizConfig';
import { getGenerateTimeSeriesVizConfig } from '../tools/generateTimeSeriesVizConfig';
import type {
    AiAgentArgs,
    AiAgentDependencies,
    AiStreamAgentResponseArgs,
} from '../types/aiAgent';

const defaultAgentOptions = {
    toolChoice: 'auto',
    maxSteps: 10,
    maxRetries: 3,
    temperature: 0.2,
} as const;

const getAgentTelemetryConfig = (
    functionId: string,
    {
        agentSettings,
        threadUuid,
        promptUuid,
    }: Pick<AiAgentArgs, 'agentSettings' | 'threadUuid' | 'promptUuid'>,
) =>
    ({
        functionId,
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        metadata: {
            agentUuid: agentSettings.uuid,
            threadUuid,
            promptUuid,
        },
    } as const);

const getAgentTools = (
    args: AiAgentArgs,
    dependencies: AiAgentDependencies,
) => {
    if (args.debugLoggingEnabled) {
        Logger.debug(
            `[AiAgent][Agent Tools] Getting agent tools for agent: ${args.agentSettings.name}`,
        );
    }

    const findExplores = getFindExplores({
        findExplores: dependencies.findExplores,
    });

    const findFields = getFindFields({
        findFields: dependencies.findFields,
    });

    const generateBarVizConfig = getGenerateBarVizConfig({
        getExplore: dependencies.getExplore,
        updateProgress: dependencies.updateProgress,
        runMiniMetricQuery: dependencies.runMiniMetricQuery,
        getPrompt: dependencies.getPrompt,
        updatePrompt: dependencies.updatePrompt,
        sendFile: dependencies.sendFile,
        maxLimit: args.maxLimit,
    });

    const generateTimeSeriesVizConfig = getGenerateTimeSeriesVizConfig({
        getExplore: dependencies.getExplore,
        updateProgress: dependencies.updateProgress,
        runMiniMetricQuery: dependencies.runMiniMetricQuery,
        getPrompt: dependencies.getPrompt,
        updatePrompt: dependencies.updatePrompt,
        sendFile: dependencies.sendFile,
        maxLimit: args.maxLimit,
    });

    const generateTableVizConfig = getGenerateTableVizConfig({
        getExplore: dependencies.getExplore,
        updateProgress: dependencies.updateProgress,
        runMiniMetricQuery: dependencies.runMiniMetricQuery,
        getPrompt: dependencies.getPrompt,
        updatePrompt: dependencies.updatePrompt,
        sendFile: dependencies.sendFile,
        maxLimit: args.maxLimit,
    });

    const tools = {
        findExplores,
        findFields,
        generateBarVizConfig,
        generateTimeSeriesVizConfig,
        generateTableVizConfig,
    };

    if (args.debugLoggingEnabled) {
        Logger.debug(
            `[AiAgent][Agent Tools] Successfully retrieved agent tools: ${Object.keys(
                tools,
            ).join(', ')}`,
        );
    }
    return tools;
};

const getAgentMessages = (args: AiAgentArgs) => {
    if (args.debugLoggingEnabled) {
        Logger.debug('[AiAgent][Agent Messages] Getting agent messages.');
    }
    const messages = [
        getSystemPrompt({
            agentName: args.agentSettings.name,
            instructions: args.agentSettings.instruction || undefined,
        }),
        ...args.messageHistory,
    ];

    if (args.debugLoggingEnabled) {
        Logger.debug(
            `[AiAgent][Agent Messages] Retrieved ${messages.length} messages.`,
        );

        for (const msg of messages) {
            switch (msg.role) {
                case 'system':
                    Logger.debug(
                        `[AiAgent][Agent Messages] ${msg.role} message - content skipped`,
                    );
                    break;
                case 'assistant':
                case 'tool':
                case 'user':
                    Logger.debug(
                        `[AiAgent][Agent Messages] ${
                            msg.role
                        } message: ${JSON.stringify(msg.content)}`,
                    );
                    break;
                default:
                    assertUnreachable(msg, 'Unknown message role');
            }
        }
    }
    return messages;
};

export const generateAgentResponse = async ({
    args,
    dependencies,
}: {
    args: AiAgentArgs;
    dependencies: AiAgentDependencies;
}): Promise<string> => {
    if (args.debugLoggingEnabled) {
        Logger.debug(
            `[AiAgent][Generate Agent Response] Starting generation for prompt UUID: ${args.promptUuid}`,
        );
        Logger.debug(
            `[AiAgent][Generate Agent Response] Agent settings: ${JSON.stringify(
                args.agentSettings,
            )}`,
        );
    }
    const messages = getAgentMessages(args);
    const tools = getAgentTools(args, dependencies);

    try {
        if (args.debugLoggingEnabled) {
            Logger.debug(
                `[AiAgent][Generate Agent Response] Calling generateText with model: ${args.model.modelId}`,
            );
        }
        const result = await generateText({
            ...defaultAgentOptions,
            model: args.model,
            tools,
            messages,
            experimental_repairToolCall: async ({
                messages: conversationHistory,
                error,
                toolCall,
                parameterSchema,
            }) => {
                if (args.debugLoggingEnabled) {
                    Logger.debug(
                        `[AiAgent][Repair Tool Call] Attempting to repair tool call: ${toolCall.toolName}`,
                    );
                    Logger.debug(
                        `[AiAgent][Repair Tool Call] Original tool call arguments: ${JSON.stringify(
                            toolCall.args,
                        )}`,
                    );
                    if (error) {
                        Logger.debug(
                            `[AiAgent][Repair Tool Call] Error encountered: ${error.message}`,
                        );
                    }
                }
                if (NoSuchToolError.isInstance(error)) {
                    if (args.debugLoggingEnabled) {
                        Logger.debug(
                            `[AiAgent][Repair Tool Call] No such tool error for ${toolCall.toolName}. Returning null.`,
                        );
                    }
                    return null;
                }

                const tool = tools[toolCall.toolName as keyof typeof tools];
                if (!tool) {
                    if (args.debugLoggingEnabled) {
                        Logger.warn(
                            `[AiAgent][Repair Tool Call] Tool ${toolCall.toolName} not found in available tools.`,
                        );
                    }
                    return null; // Should ideally not happen if NoSuchToolError is handled
                }

                // TODO: extract this as separate agent
                if (args.debugLoggingEnabled) {
                    Logger.debug(
                        `[AiAgent][Repair Tool Call] Generating repaired object for tool: ${toolCall.toolName}`,
                    );
                }
                const { object: repairedArgs } = await generateObject({
                    model: args.model,
                    schema: tool.parameters as ZodType<AnyType>,
                    messages: [
                        ...conversationHistory,
                        {
                            role: 'system',
                            content: [
                                `The model tried to call the tool "${toolCall.toolName}"` +
                                    ` with the following arguments:`,
                                JSON.stringify(toolCall.args),
                                `The tool accepts the following schema:`,
                                JSON.stringify(parameterSchema(toolCall)),
                                'Please fix the arguments.',
                            ].join('\n'),
                        },
                    ],
                    experimental_telemetry: getAgentTelemetryConfig(
                        'generateAgentResponse/repairToolCall',
                        args,
                    ),
                });

                if (args.debugLoggingEnabled) {
                    Logger.debug(
                        `[AiAgent][Repair Tool Call] Repaired arguments: ${JSON.stringify(
                            repairedArgs,
                        )}`,
                    );
                }
                return { ...toolCall, args: JSON.stringify(repairedArgs) };
            },
            onStepFinish: async (step) => {
                if (args.debugLoggingEnabled) {
                    Logger.debug(
                        `[AiAgent][On Step Finish] Step finished. Type: ${step.stepType}`,
                    );
                }
                if (step.toolCalls && step.toolCalls.length > 0) {
                    if (args.debugLoggingEnabled) {
                        Logger.debug(
                            `[AiAgent][On Step Finish] Storing ${step.toolCalls.length} tool calls.`,
                        );
                    }
                    await Promise.all(
                        step.toolCalls.map(async (toolCall) => {
                            // Store immediately when tool call happens
                            if (args.debugLoggingEnabled) {
                                Logger.debug(
                                    `[AiAgent][On Step Finish] Storing tool call for Prompt UUID ${
                                        args.promptUuid
                                    }: ${toolCall.toolName} (ID: ${
                                        toolCall.toolCallId
                                    }) (ARGS: ${JSON.stringify(
                                        toolCall.args,
                                    )})`,
                                );
                            }
                            await dependencies.storeToolCall({
                                promptUuid: args.promptUuid,
                                toolCallId: toolCall.toolCallId,
                                toolName: toolCall.toolName,
                                toolArgs: toolCall.args,
                            });
                        }),
                    );
                }
                if (step.toolResults && step.toolResults.length > 0) {
                    if (args.debugLoggingEnabled) {
                        Logger.debug(
                            `[AiAgent][On Step Finish] Storing ${step.toolResults.length} tool results.`,
                        );
                    }
                    // Batch store all tool results in a single operation
                    await dependencies.storeToolResults(
                        step.toolResults.map((toolResult) => {
                            if (args.debugLoggingEnabled) {
                                Logger.debug(
                                    `[AiAgent][On Step Finish] Storing tool result for Prompt UUID ${
                                        args.promptUuid
                                    }: ${toolResult.toolName} (ID: ${
                                        toolResult.toolCallId
                                    }) (RESULT: ${JSON.stringify(
                                        toolResult.result,
                                    )})`,
                                );
                            }
                            return {
                                promptUuid: args.promptUuid,
                                toolCallId: toolResult.toolCallId,
                                toolName: toolResult.toolName,
                                result: toolResult.result,
                            };
                        }),
                    );
                }
            },
            experimental_telemetry: getAgentTelemetryConfig(
                'generateAgentResponse',
                args,
            ),
        });

        if (args.debugLoggingEnabled) {
            Logger.debug(
                `[AiAgent][Generate Agent Response] Generation complete. Result text length: ${result.text.length}`,
            );
        }
        return result.text;
    } catch (error) {
        Logger.error(
            `[AiAgent][Generate Agent Response] Error during agent response generation: ${
                error instanceof Error ? error.message : 'Unknown error'
            }`,
        );
        Sentry.captureException(error);
        throw error;
    }
};

export const streamAgentResponse = async ({
    args,
    dependencies,
}: {
    args: AiStreamAgentResponseArgs;
    dependencies: AiAgentDependencies;
}) => {
    if (args.debugLoggingEnabled) {
        Logger.debug(
            `[AiAgent][Stream Agent Response] Starting stream generation for prompt UUID: ${args.promptUuid}`,
        );
        Logger.debug(
            `[AiAgent][Stream Agent Response] Agent settings: ${JSON.stringify(
                args.agentSettings,
            )}`,
        );
    }
    const messages = getAgentMessages(args);
    const tools = getAgentTools(args, dependencies);

    try {
        if (args.debugLoggingEnabled) {
            Logger.debug(
                `[AiAgent][Stream Agent Response] Calling streamText with model: ${args.model.modelId}`,
            );
        }
        const result = streamText({
            ...defaultAgentOptions,
            model: args.model,
            tools,
            messages,
            experimental_repairToolCall: async ({
                messages: conversationHistory,
                error,
                toolCall,
                parameterSchema,
            }) => {
                if (args.debugLoggingEnabled) {
                    Logger.debug(
                        `[AiAgent][Stream Repair Tool Call] Attempting to repair tool call: ${toolCall.toolName}`,
                    );
                    Logger.debug(
                        `[AiAgent][Stream Repair Tool Call] Original tool call arguments: ${JSON.stringify(
                            toolCall.args,
                        )}`,
                    );
                    if (error) {
                        Logger.debug(
                            `[AiAgent][Stream Repair Tool Call] Error encountered: ${error.message}`,
                        );
                    }
                }
                if (NoSuchToolError.isInstance(error)) {
                    if (args.debugLoggingEnabled) {
                        Logger.debug(
                            `[AiAgent][Stream Repair Tool Call] No such tool error for ${toolCall.toolName}. Returning null.`,
                        );
                    }
                    return null;
                }

                const tool = tools[toolCall.toolName as keyof typeof tools];
                if (!tool) {
                    if (args.debugLoggingEnabled) {
                        Logger.warn(
                            `[AiAgent][Stream Repair Tool Call] Tool ${toolCall.toolName} not found in available tools.`,
                        );
                    }
                    return null;
                }

                if (args.debugLoggingEnabled) {
                    Logger.debug(
                        `[AiAgent][Stream Repair Tool Call] Generating repaired object for tool: ${toolCall.toolName}`,
                    );
                }

                // TODO: extract this as separate agent
                const { object: repairedArgs } = await generateObject({
                    model: args.model,
                    schema: tool.parameters as ZodType<AnyType>,
                    messages: [
                        ...conversationHistory,
                        {
                            role: 'system',
                            content: [
                                `The model tried to call the tool "${toolCall.toolName}"` +
                                    ` with the following arguments:`,
                                JSON.stringify(toolCall.args),
                                `The tool accepts the following schema:`,
                                JSON.stringify(parameterSchema(toolCall)),
                                'Please fix the arguments.',
                            ].join('\n'),
                        },
                    ],
                    experimental_telemetry: getAgentTelemetryConfig(
                        'streamAgentResponse/repairToolCall',
                        args,
                    ),
                });

                if (args.debugLoggingEnabled) {
                    Logger.debug(
                        `[AiAgent][Stream Repair Tool Call] Repaired arguments: ${JSON.stringify(
                            repairedArgs,
                        )}`,
                    );
                }
                return { ...toolCall, args: JSON.stringify(repairedArgs) };
            },
            onChunk: (event) => {
                if (event.chunk.type === 'tool-call') {
                    if (args.debugLoggingEnabled) {
                        Logger.debug(
                            `[AiAgent][Chunk Tool Call] Storing tool call for Prompt UUID ${
                                args.promptUuid
                            }: ${event.chunk.toolName} (ID: ${
                                event.chunk.toolCallId
                            }) (ARGS: ${JSON.stringify(event.chunk.args)})`,
                        );
                    }
                    void dependencies
                        .storeToolCall({
                            promptUuid: args.promptUuid,
                            toolCallId: event.chunk.toolCallId,
                            toolName: event.chunk.toolName,
                            toolArgs: event.chunk.args,
                        })
                        .catch((error) => {
                            Logger.error(
                                '[AiAgent][Chunk Tool Call] Failed to store tool call',
                                error,
                            );
                            Sentry.captureException(error);
                        });
                }
                if (event.chunk.type === 'tool-result') {
                    if (args.debugLoggingEnabled) {
                        Logger.debug(
                            `[AiAgent][Chunk Tool Result] Storing tool result for Prompt UUID ${
                                args.promptUuid
                            }: ${event.chunk.toolName} (ID: ${
                                event.chunk.toolCallId
                            }) (RESULT: ${JSON.stringify(event.chunk.result)})`,
                        );
                    }
                    void dependencies
                        .storeToolResults([
                            {
                                promptUuid: args.promptUuid,
                                toolCallId: event.chunk.toolCallId,
                                toolName: event.chunk.toolName,
                                result: event.chunk.result,
                            },
                        ])
                        .catch((error) => {
                            Logger.error(
                                '[AiAgent][Chunk Tool Result] Failed to store tool result',
                                error,
                            );
                            Sentry.captureException(error);
                        });
                }
                if (event.chunk.type === 'text-delta') {
                    if (args.debugLoggingEnabled) {
                        Logger.debug(
                            `[AiAgent][Chunk Text Delta] Received text chunk: ${event.chunk.textDelta}`,
                        );
                    }
                }
            },
            onFinish: ({ text, usage, steps }) => {
                if (args.debugLoggingEnabled) {
                    Logger.debug(
                        '[AiAgent][On Finish] Stream finished. Updating prompt with response.',
                    );
                }
                void dependencies.updatePrompt({
                    response: text,
                    promptUuid: args.promptUuid,
                });

                if (args.debugLoggingEnabled) {
                    Logger.debug(
                        `[AiAgent][On Finish] Tracking event 'ai_agent.response_streamed'.`,
                    );
                }
                dependencies.trackEvent({
                    event: 'ai_agent.response_streamed',
                    userId: args.userId,
                    properties: {
                        organizationId: args.organizationId,
                        projectId: args.agentSettings.projectUuid,
                        aiAgentId: args.agentSettings.uuid,
                        agentName: args.agentSettings.name,
                        usageTokensCount: usage.totalTokens,
                        stepsCount: steps.length,
                        model: args.model.modelId,
                    },
                });
                if (args.debugLoggingEnabled) {
                    Logger.debug(
                        `[AiAgent][On Finish] Total tokens used: ${usage.totalTokens}, steps: ${steps.length}`,
                    );
                }
            },
            experimental_transform: smoothStream({
                delayInMs: 20,
                chunking: 'line',
            }),
            toolCallStreaming: true,
            onError: (error) => {
                Logger.error(
                    `[AiAgent][Stream Agent Response] Error during streaming: ${
                        error instanceof Error ? error.message : 'Unknown error'
                    }`,
                );
                Sentry.captureException(error);
            },
            experimental_telemetry: getAgentTelemetryConfig(
                'streamAgentResponse',
                args,
            ),
        });
        if (args.debugLoggingEnabled) {
            Logger.debug(
                '[AiAgent][Stream Agent Response] Returning stream result.',
            );
        }
        return result;
    } catch (error) {
        Logger.error(
            `[AiAgent][Stream Agent Response] Fatal error before stream could start: ${
                error instanceof Error ? error.message : 'Unknown error'
            }`,
        );
        Sentry.captureException(error);
        throw error;
    }
};
