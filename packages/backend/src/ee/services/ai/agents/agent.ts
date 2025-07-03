import { AnyType } from '@lightdash/common';
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
import { getGenerateOneLineResult } from '../tools/generateOneLineResult';
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
    const findExplores = getFindExplores({
        getExplores: dependencies.getExplores,
    });

    const findFields = getFindFields({
        getExplore: dependencies.getExplore,
        searchFields: dependencies.searchFields,
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

    const generateOneLineResult = getGenerateOneLineResult({
        getExplore: dependencies.getExplore,
        updateProgress: dependencies.updateProgress,
        runMiniMetricQuery: dependencies.runMiniMetricQuery,
        getPrompt: dependencies.getPrompt,
        updatePrompt: dependencies.updatePrompt,
    });

    const tools = {
        findExplores,
        findFields,
        generateBarVizConfig,
        generateTimeSeriesVizConfig,
        generateTableVizConfig,
        generateOneLineResult,
    };

    return tools;
};

const getAgentMessages = (args: AiAgentArgs) => [
    getSystemPrompt({
        agentName: args.agentSettings.name,
        instructions: args.agentSettings.instruction || undefined,
    }),
    ...args.messageHistory,
];

export const generateAgentResponse = async ({
    args,
    dependencies,
}: {
    args: AiAgentArgs;
    dependencies: AiAgentDependencies;
}): Promise<string> => {
    const messages = getAgentMessages(args);
    const tools = getAgentTools(args, dependencies);

    try {
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
                if (NoSuchToolError.isInstance(error)) {
                    return null;
                }

                const tool = tools[toolCall.toolName as keyof typeof tools];

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
                        'generateAgentResponse/repairToolCall',
                        args,
                    ),
                });

                return { ...toolCall, args: JSON.stringify(repairedArgs) };
            },
            onStepFinish: async (step) => {
                if (step.toolCalls && step.toolCalls.length > 0) {
                    await Promise.all(
                        step.toolCalls.map(async (toolCall) => {
                            // Store immediately when tool call happens
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
                    // Batch store all tool results in a single operation
                    await dependencies.storeToolResults(
                        step.toolResults.map((toolResult) => ({
                            promptUuid: args.promptUuid,
                            toolCallId: toolResult.toolCallId,
                            toolName: toolResult.toolName,
                            result: toolResult.result,
                        })),
                    );
                }
            },
            experimental_telemetry: getAgentTelemetryConfig(
                'generateAgentResponse',
                args,
            ),
        });

        return result.text;
    } catch (error) {
        Logger.error(error);
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
    const messages = getAgentMessages(args);
    const tools = getAgentTools(args, dependencies);

    try {
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
                if (NoSuchToolError.isInstance(error)) {
                    return null;
                }

                const tool = tools[toolCall.toolName as keyof typeof tools];

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

                return { ...toolCall, args: JSON.stringify(repairedArgs) };
            },
            onChunk: (event) => {
                if (event.chunk.type === 'tool-call') {
                    void dependencies
                        .storeToolCall({
                            promptUuid: args.promptUuid,
                            toolCallId: event.chunk.toolCallId,
                            toolName: event.chunk.toolName,
                            toolArgs: event.chunk.args,
                        })
                        .catch((error) => {
                            Logger.error('Failed to store tool call', error);
                            Sentry.captureException(error);
                        });
                }
                if (event.chunk.type === 'tool-result') {
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
                            Logger.error('Failed to store tool result', error);
                            Sentry.captureException(error);
                        });
                }
            },
            onFinish: ({ text, usage, steps }) => {
                void dependencies.updatePrompt({
                    response: text,
                    promptUuid: args.promptUuid,
                });

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
            },
            experimental_transform: smoothStream({
                delayInMs: 20,
                chunking: 'line',
            }),
            toolCallStreaming: true,
            onError: (error) => {
                Logger.error(error);
                Sentry.captureException(error);
            },
            experimental_telemetry: getAgentTelemetryConfig(
                'streamAgentResponse',
                args,
            ),
        });
        return result;
    } catch (error) {
        Logger.error(error);
        Sentry.captureException(error);
        throw error;
    }
};
