import { AgentToolOutput, assertUnreachable } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import {
    generateObject,
    generateText,
    NoSuchToolError,
    smoothStream,
    stepCountIs,
    streamText,
    ToolCallRepairFunction,
    ToolSet,
} from 'ai';
import Logger from '../../../../logging/logger';
import { getSystemPromptV2 } from '../prompts/systemV2';
import { getFindContent } from '../tools/findContent';
import { getFindExplores } from '../tools/findExplores';
import { getFindFields } from '../tools/findFields';
import { getGenerateDashboardV2 } from '../tools/generateDashboardV2';
import { getImproveContext } from '../tools/improveContext';
import { getProposeChange } from '../tools/proposeChange';
import { getRunQuery } from '../tools/runQuery';
import { getSearchFieldValues } from '../tools/searchFieldValues';
import type {
    AiAgentArgs,
    AiAgentDependencies,
    AiStreamAgentResponseArgs,
} from '../types/aiAgent';

const createAiAgentLogger =
    (debugLoggingEnabled: boolean) => (context: string, message: string) => {
        if (debugLoggingEnabled) {
            Logger.debug(`[AiAgent][${context}] ${message}`);
        }
    };

export const defaultAgentOptions = {
    toolChoice: 'auto' as const,
    stopWhen: stepCountIs(20),
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
        const logger = createAiAgentLogger(args.debugLoggingEnabled);
        logger(
            'Repair Tool Call',
            `Attempting to repair tool call: ${toolCall.toolName}`,
        );
        logger(
            'Repair Tool Call',
            `Original tool call arguments: ${JSON.stringify(toolCall.input)}`,
        );
        if (error) {
            logger('Repair Tool Call', `Error encountered: ${error.message}`);
        }
        if (NoSuchToolError.isInstance(error)) {
            logger(
                'Repair Tool Call',
                `No such tool error for ${toolCall.toolName}. Returning null.`,
            );
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
        logger(
            'Repair Tool Call',
            `Generating repaired object for tool: ${toolCall.toolName}`,
        );
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

        logger(
            'Repair Tool Call',
            `Repaired arguments: ${JSON.stringify(repairedArgs)}`,
        );
        return { ...toolCall, args: JSON.stringify(repairedArgs) };
    };

const getAgentTools = (
    args: AiAgentArgs,
    dependencies: AiAgentDependencies,
) => {
    const logger = createAiAgentLogger(args.debugLoggingEnabled);
    logger(
        'Agent Tools',
        `Getting agent tools for agent: ${args.agentSettings.name}`,
    );

    const findExplores = getFindExplores({
        fieldSearchSize: args.findExploresFieldSearchSize,
        findExplores: dependencies.findExplores,
    });

    const findFields = getFindFields({
        findFields: dependencies.findFields,
        pageSize: args.findFieldsPageSize,
    });

    const findContent = getFindContent({
        findContent: dependencies.findContent,
        siteUrl: args.siteUrl,
    });

    const runQuery = getRunQuery({
        getExplore: dependencies.getExplore,
        updateProgress: dependencies.updateProgress,
        runMiniMetricQuery: dependencies.runMiniMetricQuery,
        getPrompt: dependencies.getPrompt,
        sendFile: dependencies.sendFile,
        createOrUpdateArtifact: dependencies.createOrUpdateArtifact,
        maxLimit: args.maxQueryLimit,
        enableDataAccess: args.enableDataAccess,
        enableSelfImprovement: args.enableSelfImprovement,
    });

    const generateDashboard = getGenerateDashboardV2({
        getExplore: dependencies.getExplore,
        getPrompt: dependencies.getPrompt,
        createOrUpdateArtifact: dependencies.createOrUpdateArtifact,
    });

    const improveContext = getImproveContext();

    const proposeChange = getProposeChange({
        createChange: dependencies.createChange,
        getExplore: dependencies.getExplore,
        getExploreCompiler: dependencies.getExploreCompiler,
    });

    const searchFieldValues = getSearchFieldValues({
        searchFieldValues: dependencies.searchFieldValues,
    });

    const tools = {
        findContent,
        findExplores,
        findFields,
        runQuery,
        generateDashboard,
        ...(args.canManageAgent ? { improveContext } : {}),
        ...(args.enableSelfImprovement && args.canManageAgent
            ? { proposeChange }
            : {}),
        ...(args.enableDataAccess ? { searchFieldValues } : {}),
    };

    logger(
        'Agent Tools',
        `Successfully retrieved agent tools: ${Object.keys(tools).join(', ')}`,
    );
    return tools;
};

const getAgentMessages = async (
    args: AiAgentArgs,
    dependencies: AiAgentDependencies,
) => {
    const logger = createAiAgentLogger(args.debugLoggingEnabled);
    logger('Agent Messages', 'Getting agent messages.');

    const availableExplores = await dependencies.listExplores();

    const messages = [
        getSystemPromptV2({
            agentName: args.agentSettings.name,
            instructions: args.agentSettings.instruction || undefined,
            availableExplores,
            enableDataAccess: args.enableDataAccess,
            enableSelfImprovement: args.enableSelfImprovement,
        }),
        ...args.messageHistory,
    ];

    logger('Agent Messages', `Retrieved ${messages.length} messages.`);

    if (args.debugLoggingEnabled) {
        for (const msg of messages) {
            switch (msg.role) {
                case 'system':
                    logger(
                        'Agent Messages',
                        `${msg.role} message - content skipped`,
                    );
                    break;
                case 'assistant':
                case 'tool':
                case 'user':
                    logger(
                        'Agent Messages',
                        `${msg.role} message: ${JSON.stringify(msg.content)}`,
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
    const logger = createAiAgentLogger(args.debugLoggingEnabled);
    logger(
        'Generate Agent Response',
        `Starting generation for prompt UUID: ${args.promptUuid}`,
    );
    logger(
        'Generate Agent Response',
        `Agent settings: ${JSON.stringify(args.agentSettings)}`,
    );
    const messages = await getAgentMessages(args, dependencies);
    const tools = getAgentTools(args, dependencies);

    const startTime = Date.now();
    const modelName = args.model.modelId;

    try {
        logger(
            'Generate Agent Response',
            `Calling generateText with model: ${modelName}`,
        );
        const result = await generateText({
            ...defaultAgentOptions,
            ...args.callOptions,
            providerOptions: args.providerOptions,
            model: args.model,
            tools,
            messages,
            experimental_repairToolCall: getRepairToolCall(args, tools),
            onStepFinish: async (step) => {
                for (const toolCall of step.toolCalls) {
                    if (toolCall) {
                        logger(
                            'On Step Finish',
                            `Step finished. Tool call: ${toolCall.toolName}`,
                        );
                    }
                }
                if (step.toolCalls && step.toolCalls.length > 0) {
                    logger(
                        'On Step Finish',
                        `Storing ${step.toolCalls.length} tool calls.`,
                    );
                    await Promise.all(
                        step.toolCalls.map(async (toolCall) => {
                            // Store immediately when tool call happens
                            if (toolCall) {
                                logger(
                                    'On Step Finish',
                                    `Storing tool call for Prompt UUID ${
                                        args.promptUuid
                                    }: ${toolCall.toolName} (ID: ${
                                        toolCall.toolCallId
                                    }) (ARGS: ${JSON.stringify(
                                        toolCall.input,
                                    )})`,
                                );

                                dependencies.trackEvent({
                                    event: 'ai_agent_tool_call',
                                    userId: args.userId,
                                    properties: {
                                        organizationId: args.organizationId,
                                        projectId:
                                            args.agentSettings.projectUuid,
                                        aiAgentId: args.agentSettings.uuid,
                                        agentName: args.agentSettings.name,
                                        toolName: toolCall.toolName,
                                        threadId: args.threadUuid,
                                        promptId: args.promptUuid,
                                    },
                                });

                                await dependencies.storeToolCall({
                                    promptUuid: args.promptUuid,
                                    toolCallId: toolCall.toolCallId,
                                    toolName: toolCall.toolName,
                                    toolArgs: toolCall.input as object,
                                });
                            }
                        }),
                    );
                }
                if (step.toolResults && step.toolResults.length > 0) {
                    logger(
                        'On Step Finish',
                        `Storing ${step.toolResults.length} tool results.`,
                    );

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
                                logger(
                                    'On Step Finish',
                                    `Storing tool result for Prompt UUID ${
                                        args.promptUuid
                                    }: ${toolResult.toolName} (ID: ${
                                        toolResult.toolCallId
                                    }) (RESULT: ${JSON.stringify(
                                        toolResult.output,
                                    )})`,
                                );
                                const output =
                                    toolResult.output as AgentToolOutput;
                                return {
                                    promptUuid: args.promptUuid,
                                    toolCallId: toolResult.toolCallId,
                                    toolName: toolResult.toolName,
                                    result: output.result,
                                    metadata: output.metadata,
                                };
                            }),
                    );
                }

                void dependencies.updatePrompt({
                    response: step.text,
                    promptUuid: args.promptUuid,
                });
            },
            experimental_telemetry: getAgentTelemetryConfig(
                'generateAgentResponse',
                args,
            ),
        });

        logger(
            'Generate Agent Response',
            `Generation complete. Result text length: ${result.text.length}`,
        );

        dependencies.perf.measureGenerateResponseTime(Date.now() - startTime);

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
    const logger = createAiAgentLogger(args.debugLoggingEnabled);
    logger(
        'Stream Agent Response',
        `Starting stream generation for prompt UUID: ${args.promptUuid}`,
    );
    logger(
        'Stream Agent Response',
        `Agent settings: ${JSON.stringify(args.agentSettings)}`,
    );
    const messages = await getAgentMessages(args, dependencies);
    const tools = getAgentTools(args, dependencies);

    const startTime = Date.now();
    const modelName =
        typeof args.model === 'string' ? args.model : args.model.modelId;

    try {
        logger(
            'Stream Agent Response',
            `Calling streamText with model: ${modelName}`,
        );
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
                    case 'tool-call': {
                        logger(
                            'Chunk Tool Call',
                            `Storing tool call for Prompt UUID ${
                                args.promptUuid
                            }: ${event.chunk.toolName} (ID: ${
                                event.chunk.toolCallId
                            }) (ARGS: ${JSON.stringify(event.chunk.input)})`,
                        );

                        // Track tool call analytics
                        dependencies.trackEvent({
                            event: 'ai_agent_tool_call',
                            userId: args.userId,
                            properties: {
                                organizationId: args.organizationId,
                                projectId: args.agentSettings.projectUuid,
                                aiAgentId: args.agentSettings.uuid,
                                agentName: args.agentSettings.name,
                                toolName: event.chunk.toolName,
                                threadId: args.threadUuid,
                                promptId: args.promptUuid,
                            },
                        });

                        void dependencies
                            .storeToolCall({
                                promptUuid: args.promptUuid,
                                toolCallId: event.chunk.toolCallId,
                                toolName: event.chunk.toolName,
                                toolArgs: event.chunk.input as object,
                            })
                            .catch((error) => {
                                Logger.error(
                                    '[AiAgent][Chunk Tool Call] Failed to store tool call',
                                    error,
                                );
                                Sentry.captureException(error);
                            });
                        break;
                    }
                    case 'tool-result': {
                        logger(
                            'Chunk Tool Result',
                            `Storing tool result for Prompt UUID ${
                                args.promptUuid
                            }: ${event.chunk.toolName} (ID: ${
                                event.chunk.toolCallId
                            }) (RESULT: ${JSON.stringify(event.chunk.output)})`,
                        );
                        void dependencies
                            .storeToolResults([
                                {
                                    promptUuid: args.promptUuid,
                                    toolCallId: event.chunk.toolCallId,
                                    toolName: event.chunk.toolName,
                                    result: (
                                        event.chunk.output as AgentToolOutput
                                    ).result,
                                    metadata: (
                                        event.chunk.output as AgentToolOutput
                                    ).metadata,
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
                    }
                    case 'text-delta': {
                        logger(
                            'Chunk Text Delta',
                            `Received text chunk: ${event.chunk.text}`,
                        );
                        break;
                    }
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
                logger(
                    'On Finish',
                    'Stream finished. Updating prompt with response.',
                );

                // Extract complete response from all steps instead of just the last text
                const completeResponse = steps
                    .flatMap((step) => step.text || [])
                    .join('\n');

                void dependencies.updatePrompt({
                    response: completeResponse,
                    promptUuid: args.promptUuid,
                });

                logger(
                    'On Finish',
                    "Tracking event 'ai_agent.response_streamed'.",
                );
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
                logger(
                    'On Finish',
                    `Total tokens used: ${usage.totalTokens}, steps: ${steps.length}`,
                );

                dependencies.perf.measureStreamResponseTime(
                    Date.now() - startTime,
                );
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
        logger('Stream Agent Response', 'Returning stream result.');
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
