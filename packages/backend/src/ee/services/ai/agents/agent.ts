import { assertUnreachable } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import {
    generateObject,
    generateText,
    NoSuchToolError,
    smoothStream,
    stepCountIs,
    streamText,
    Tool,
    ToolCallRepairFunction,
    ToolSet,
} from 'ai';
import Logger from '../../../../logging/logger';
import { getSystemPrompt } from '../prompts/system';
import { getFindCharts } from '../tools/findCharts';
import { getFindDashboards } from '../tools/findDashboards';
// eslint-disable-next-line import/extensions
import { getFindExplores } from '../tools/findExplores';
import { getFindFields } from '../tools/findFields';
import { getGenerateBarVizConfig } from '../tools/generateBarVizConfig';
import { getGenerateDashboard } from '../tools/generateDashboard';
import { getGenerateTableVizConfig } from '../tools/generateTableVizConfig';
import { getGenerateTimeSeriesVizConfig } from '../tools/generateTimeSeriesVizConfig';
import { getImproveContext } from '../tools/improveContext';
import type {
    AiAgentArgs,
    AiAgentDependencies,
    AiStreamAgentResponseArgs,
} from '../types/aiAgent';

export const defaultAgentOptions = {
    toolChoice: 'auto' as const,
    stopWhen: stepCountIs(10),
    maxRetries: 3,
};

const getAgentTelemetryConfig = (
    functionId: string,
    {
        agentSettings,
        threadUuid,
        promptUuid,
        telemetryEnabled,
    }: Pick<
        AiAgentArgs,
        'agentSettings' | 'threadUuid' | 'promptUuid' | 'telemetryEnabled'
    >,
) =>
    ({
        functionId,
        isEnabled: true,
        recordInputs: telemetryEnabled,
        recordOutputs: telemetryEnabled,
        metadata: {
            agentUuid: agentSettings.uuid,
            threadUuid,
            promptUuid,
        },
    } as const);

const getRepairToolCall =
    (args: AiAgentArgs, tools: ToolSet): ToolCallRepairFunction<typeof tools> =>
    async ({ messages: conversationHistory, error, toolCall, inputSchema }) => {
        if (args.debugLoggingEnabled) {
            Logger.debug(
                `[AiAgent][Repair Tool Call] Attempting to repair tool call: ${toolCall.toolName}`,
            );
            Logger.debug(
                `[AiAgent][Repair Tool Call] Original tool call arguments: ${JSON.stringify(
                    toolCall.input,
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
            schema: tool.inputSchema,
            messages: [
                ...conversationHistory,
                {
                    role: 'system',
                    content: [
                        `The model tried to call the tool "${toolCall.toolName}"` +
                            ` with the following arguments:`,
                        JSON.stringify(toolCall.input),
                        `The tool accepts the following schema:`,
                        JSON.stringify(inputSchema(toolCall)),
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
    };

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
        maxDescriptionLength: args.findExploresMaxDescriptionLength,
        pageSize: args.findExploresPageSize,
        fieldSearchSize: args.findExploresFieldSearchSize,
        fieldOverviewSearchSize: args.findExploresFieldOverviewSearchSize,
        findExplores: dependencies.findExplores,
    });

    const findFields = getFindFields({
        findFields: dependencies.findFields,
        pageSize: args.findFieldsPageSize,
    });

    const findDashboards = getFindDashboards({
        findDashboards: dependencies.findDashboards,
        pageSize: args.findDashboardsPageSize,
        siteUrl: args.siteUrl,
    });

    const findCharts = getFindCharts({
        findCharts: dependencies.findCharts,
        pageSize: args.findChartsPageSize,
        siteUrl: args.siteUrl,
    });

    const generateBarVizConfig = getGenerateBarVizConfig({
        getExplore: dependencies.getExplore,
        updateProgress: dependencies.updateProgress,
        runMiniMetricQuery: dependencies.runMiniMetricQuery,
        getPrompt: dependencies.getPrompt,
        sendFile: dependencies.sendFile,
        createOrUpdateArtifact: dependencies.createOrUpdateArtifact,
        maxLimit: args.maxQueryLimit,
        enableDataAccess: args.enableDataAccess,
    });

    const generateTimeSeriesVizConfig = getGenerateTimeSeriesVizConfig({
        getExplore: dependencies.getExplore,
        updateProgress: dependencies.updateProgress,
        runMiniMetricQuery: dependencies.runMiniMetricQuery,
        getPrompt: dependencies.getPrompt,
        sendFile: dependencies.sendFile,
        createOrUpdateArtifact: dependencies.createOrUpdateArtifact,
        maxLimit: args.maxQueryLimit,
        enableDataAccess: args.enableDataAccess,
    });

    const generateTableVizConfig = getGenerateTableVizConfig({
        getExplore: dependencies.getExplore,
        updateProgress: dependencies.updateProgress,
        runMiniMetricQuery: dependencies.runMiniMetricQuery,
        getPrompt: dependencies.getPrompt,
        sendFile: dependencies.sendFile,
        createOrUpdateArtifact: dependencies.createOrUpdateArtifact,
        maxLimit: args.maxQueryLimit,
        enableDataAccess: args.enableDataAccess,
    });

    const generateDashboard = getGenerateDashboard({
        getExplore: dependencies.getExplore,
        updateProgress: dependencies.updateProgress,
        runMiniMetricQuery: dependencies.runMiniMetricQuery,
        getPrompt: dependencies.getPrompt,
        updatePrompt: dependencies.updatePrompt,
        sendFile: dependencies.sendFile,
        createOrUpdateArtifact: dependencies.createOrUpdateArtifact,
        maxLimit: args.maxQueryLimit,
    });

    const improveContext = getImproveContext({
        appendInstruction: dependencies.appendInstruction,
        projectUuid: args.agentSettings.projectUuid,
        agentUuid: args.agentSettings.uuid,
        userId: args.userId,
        organizationId: args.organizationId,
    });

    const tools = {
        findCharts,
        findDashboards,
        findExplores,
        findFields,
        generateBarVizConfig,
        generateDashboard,
        generateTimeSeriesVizConfig,
        generateTableVizConfig,
        ...(args.canManageAgent ? { improveContext } : {}),
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

const getAgentMessages = async (
    args: AiAgentArgs,
    dependencies: AiAgentDependencies,
) => {
    if (args.debugLoggingEnabled) {
        Logger.debug('[AiAgent][Agent Messages] Getting agent messages.');
    }

    const availableExplores = await dependencies.findExplores({
        page: 1,
        pageSize: args.availableExploresPageSize,
        tableName: null,
        includeFields: false,
    });

    const messages = [
        getSystemPrompt({
            agentName: args.agentSettings.name,
            instructions: args.agentSettings.instruction || undefined,
            availableExplores: availableExplores.tablesWithFields.map(
                (table) => table.table.name,
            ),
            enableDataAccess: args.enableDataAccess,
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
    const messages = await getAgentMessages(args, dependencies);
    const tools = getAgentTools(args, dependencies);

    try {
        if (args.debugLoggingEnabled) {
            Logger.debug(
                `[AiAgent][Generate Agent Response] Calling generateText with model: ${
                    typeof args.model === 'string'
                        ? args.model
                        : args.model.modelId
                }`,
            );
        }
        const result = await generateText({
            ...defaultAgentOptions,
            ...args.callOptions,
            providerOptions: args.providerOptions,
            model: args.model,
            tools,
            messages,
            experimental_repairToolCall: getRepairToolCall(args, tools),
            onStepFinish: async (step) => {
                if (args.debugLoggingEnabled) {
                    for (const toolCall of step.toolCalls) {
                        if (toolCall) {
                            Logger.debug(
                                `[AiAgent][On Step Finish] Step finished. Tool call: ${toolCall.toolName}`,
                            );
                        }
                    }
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
                            if (args.debugLoggingEnabled && toolCall) {
                                Logger.debug(
                                    `[AiAgent][On Step Finish] Storing tool call for Prompt UUID ${
                                        args.promptUuid
                                    }: ${toolCall.toolName} (ID: ${
                                        toolCall.toolCallId
                                    }) (ARGS: ${JSON.stringify(
                                        toolCall.input,
                                    )})`,
                                );
                            }
                            if (toolCall) {
                                await dependencies.storeToolCall({
                                    promptUuid: args.promptUuid,
                                    toolCallId: toolCall.toolCallId,
                                    toolName: toolCall.toolName,
                                    toolArgs: toolCall.input,
                                });
                            }
                        }),
                    );
                }
                if (step.toolResults && step.toolResults.length > 0) {
                    if (args.debugLoggingEnabled) {
                        Logger.debug(
                            `[AiAgent][On Step Finish] Storing ${step.toolResults.length} tool results.`,
                        );
                    }

                    await dependencies.storeToolResults(
                        step.toolResults
                            .filter(
                                (
                                    toolResult,
                                ): toolResult is NonNullable<
                                    typeof toolResult
                                > => toolResult !== null,
                            )
                            .map((toolResult) => {
                                if (args.debugLoggingEnabled) {
                                    Logger.debug(
                                        `[AiAgent][On Step Finish] Storing tool result for Prompt UUID ${
                                            args.promptUuid
                                        }: ${toolResult.toolName} (ID: ${
                                            toolResult.toolCallId
                                        }) (RESULT: ${JSON.stringify(
                                            toolResult.output,
                                        )})`,
                                    );
                                }
                                return {
                                    promptUuid: args.promptUuid,
                                    toolCallId: toolResult.toolCallId,
                                    toolName: toolResult.toolName,
                                    result: toolResult.output,
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
    const messages = await getAgentMessages(args, dependencies);
    const tools = getAgentTools(args, dependencies);

    try {
        if (args.debugLoggingEnabled) {
            Logger.debug(
                `[AiAgent][Stream Agent Response] Calling streamText with model: ${
                    typeof args.model === 'string'
                        ? args.model
                        : args.model.modelId
                }`,
            );
        }
        const result = streamText({
            ...defaultAgentOptions,
            ...args.callOptions,
            providerOptions: args.providerOptions,
            model: args.model,
            tools,
            messages,
            experimental_repairToolCall: getRepairToolCall(args, tools),
            onChunk: (event) => {
                switch (event.chunk.type) {
                    case 'tool-call':
                        if (args.debugLoggingEnabled) {
                            Logger.debug(
                                `[AiAgent][Chunk Tool Call] Storing tool call for Prompt UUID ${
                                    args.promptUuid
                                }: ${event.chunk.toolName} (ID: ${
                                    event.chunk.toolCallId
                                }) (ARGS: ${JSON.stringify(
                                    event.chunk.input,
                                )})`,
                            );
                        }
                        void dependencies
                            .storeToolCall({
                                promptUuid: args.promptUuid,
                                toolCallId: event.chunk.toolCallId,
                                toolName: event.chunk.toolName,
                                toolArgs: event.chunk.input,
                            })
                            .catch((error) => {
                                Logger.error(
                                    '[AiAgent][Chunk Tool Call] Failed to store tool call',
                                    error,
                                );
                                Sentry.captureException(error);
                            });
                        break;
                    case 'tool-result':
                        if (args.debugLoggingEnabled) {
                            Logger.debug(
                                `[AiAgent][Chunk Tool Result] Storing tool result for Prompt UUID ${
                                    args.promptUuid
                                }: ${event.chunk.toolName} (ID: ${
                                    event.chunk.toolCallId
                                }) (RESULT: ${JSON.stringify(
                                    event.chunk.output,
                                )})`,
                            );
                        }
                        void dependencies
                            .storeToolResults([
                                {
                                    promptUuid: args.promptUuid,
                                    toolCallId: event.chunk.toolCallId,
                                    toolName: event.chunk.toolName,
                                    result: event.chunk.output,
                                },
                            ])
                            .catch((error) => {
                                Logger.error(
                                    '[AiAgent][Chunk Tool Result] Failed to store tool result',
                                    error,
                                );
                                Sentry.captureException(error);
                            });
                        break;
                    case 'text-delta':
                        if (args.debugLoggingEnabled) {
                            Logger.debug(
                                `[AiAgent][Chunk Text Delta] Received text chunk: ${event.chunk.text}`,
                            );
                        }
                        break;
                    case 'raw':
                    case 'reasoning-delta':
                    case 'source':
                    case 'tool-input-delta':
                    case 'tool-input-start':
                        // not implemented
                        break;
                    default:
                        assertUnreachable(event.chunk, 'Unknown chunk type');
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
                        usageTokensCount: usage.totalTokens ?? 0,
                        stepsCount: steps.length,
                        model:
                            typeof args.model === 'string'
                                ? args.model
                                : args.model.modelId,
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
