import { AgentToolOutput, assertUnreachable, Explore } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import {
    generateText,
    smoothStream,
    stepCountIs,
    streamText,
    StreamTextResult,
    type ModelMessage,
    type Output,
    type ToolSet,
} from 'ai';
import Logger from '../../../../logging/logger';
import { getSystemPromptV2 } from '../prompts/systemV2';
import { getCreateContent } from '../tools/createContent';
import { getDescribeWarehouseTable } from '../tools/describeWarehouseTable';
import { getEditContent } from '../tools/editContent';
import { getFindContent } from '../tools/findContent';
import { getGenerateDashboardV2 } from '../tools/generateDashboardV2';
import { getGenerateUuids } from '../tools/generateUuids';
import { getGenerateVisualization } from '../tools/generateVisualization';
import { getGetDashboardCharts } from '../tools/getDashboardCharts';
import { getGetKnowledgeDocumentContent } from '../tools/getKnowledgeDocumentContent';
import { getGetProjectInfo } from '../tools/getProjectInfo';
import { getImproveContext } from '../tools/improveContext';
import { getListContent } from '../tools/listContent';
import { getListKnowledgeDocuments } from '../tools/listKnowledgeDocuments';
import { getListProjects } from '../tools/listProjects';
import { getListWarehouseTables } from '../tools/listWarehouseTables';
import { getLoadSkill } from '../tools/loadSkill';
import { getProposeChange } from '../tools/proposeChange';
import { getProposeWriteback } from '../tools/proposeWriteback';
import { getReadContent } from '../tools/readContent';
import { getRunContentQuery } from '../tools/runContentQuery';
import { getRunSavedChart } from '../tools/runSavedChart';
import { getRunSql } from '../tools/runSql';
import { getSearchFieldValues } from '../tools/searchFieldValues';
import { getSetupPreviewDeploy } from '../tools/setupPreviewDeploy';
import type {
    AiAgentArgs,
    AiAgentDependencies,
    AiStreamAgentResponseArgs,
    UnavailableMcpServer,
} from '../types/aiAgent';
import { AgentContext } from '../utils/AgentContext';
import {
    AiAgentStepCapReachedError,
    getUserFacingErrorMessage,
} from '../utils/errorMessages';
import { getDiscoverFields } from './discoverFields/tool';
import { getAgentTelemetryConfig } from './telemetry';

const createAiAgentLogger =
    (debugLoggingEnabled: boolean) => (context: string, message: string) => {
        if (debugLoggingEnabled) {
            Logger.debug(`[AiAgent][${context}] ${message}`);
        }
    };

const STEP_CAP = 40;

const withToolHints = (
    messageHistory: ModelMessage[],
    toolHints: string[],
): ModelMessage[] => {
    if (toolHints.length === 0) return messageHistory;
    const hint = `\n\n(User hinted at using: ${toolHints.join(', ')})`;
    const lastUserIndex = messageHistory.findLastIndex(
        (m) => m.role === 'user',
    );
    if (lastUserIndex === -1) return messageHistory;
    const lastUser = messageHistory[lastUserIndex];
    if (lastUser.role !== 'user') return messageHistory;
    const updatedContent =
        typeof lastUser.content === 'string'
            ? `${lastUser.content}${hint}`
            : [...lastUser.content, { type: 'text' as const, text: hint }];
    return [
        ...messageHistory.slice(0, lastUserIndex),
        { ...lastUser, content: updatedContent } as ModelMessage,
        ...messageHistory.slice(lastUserIndex + 1),
    ];
};

export type AgentMcpToolSetup = {
    tools: ToolSet;
    mcpToolNameToServerUuid: Record<string, string>;
    unavailableMcpServers: UnavailableMcpServer[];
    closeMcpClients: () => Promise<void>;
};

export const normalizeToolOutput = (
    output: unknown,
): { result: string; metadata?: AgentToolOutput['metadata'] } => {
    if (
        output !== null &&
        typeof output === 'object' &&
        'result' in output &&
        typeof output.result === 'string'
    ) {
        const metadata =
            'metadata' in output
                ? (output.metadata as AgentToolOutput['metadata'])
                : undefined;

        return {
            result: output.result,
            metadata,
        };
    }

    if (typeof output === 'string') {
        return { result: output };
    }

    try {
        return { result: JSON.stringify(output) ?? String(output) };
    } catch {
        return { result: String(output) };
    }
};

export const defaultAgentOptions = {
    toolChoice: 'auto' as const,
    stopWhen: stepCountIs(STEP_CAP),
    maxRetries: 6, // Increased for Bedrock rate limits
};

const getAgentTools = (
    args: AiAgentArgs,
    dependencies: AiAgentDependencies,
    availableExplores: Explore[],
    mcpToolSetup: AgentMcpToolSetup,
): ToolSet => {
    const logger = createAiAgentLogger(args.debugLoggingEnabled);
    logger(
        'Agent Tools',
        `Getting agent tools for agent: ${args.agentSettings.name}`,
    );

    const discoverFields = getDiscoverFields(
        {
            model: args.model,
            callOptions: args.callOptions,
            providerOptions: args.providerOptions,
            availableExplores,
            findExploresFieldSearchSize: args.findExploresFieldSearchSize,
            findFieldsPageSize: args.findFieldsPageSize,
            promptUuid: args.promptUuid,
            telemetry: {
                agentSettings: args.agentSettings,
                threadUuid: args.threadUuid,
                promptUuid: args.promptUuid,
                telemetryEnabled: args.telemetryEnabled,
            },
        },
        {
            findExplores: dependencies.findExplores,
            findFields: dependencies.findFields,
            getExplore: dependencies.getExplore,
            updateProgress: dependencies.updateProgress,
            storeToolCall: dependencies.storeToolCall,
            storeToolResults: dependencies.storeToolResults,
        },
    );

    const findContent = getFindContent({
        findContent: dependencies.findContent,
        siteUrl: args.siteUrl,
        trackCoverage: (coverage) => {
            dependencies.trackEvent({
                event: 'ai_agent.find_content_coverage',
                userId: args.userId,
                properties: {
                    organizationId: args.organizationId,
                    projectId: args.agentSettings.projectUuid,
                    aiAgentId: args.agentSettings.uuid,
                    agentName: args.agentSettings.name,
                    threadId: args.threadUuid,
                    promptId: args.promptUuid,
                    searchQuery: coverage.searchQuery,
                    totalResultCount: coverage.totalResultCount,
                    verifiedResultCount: coverage.verifiedResultCount,
                    topResultVerified: coverage.topResultVerified,
                },
            });
        },
    });

    const listContent = getListContent({
        listContent: dependencies.listContent,
    });

    const getDashboardCharts = getGetDashboardCharts({
        getDashboardCharts: dependencies.getDashboardCharts,
        siteUrl: args.siteUrl,
        pageSize: args.getDashboardChartsPageSize,
    });

    const readContent = getReadContent({
        readContent: dependencies.readContent,
    });

    const generateVisualization = getGenerateVisualization({
        updateProgress: dependencies.updateProgress,
        runAsyncQuery: dependencies.runAsyncQuery,
        getPrompt: dependencies.getPrompt,
        sendFile: dependencies.sendFile,
        createOrUpdateArtifact: dependencies.createOrUpdateArtifact,
        maxLimit: args.maxQueryLimit,
        enableDataAccess: args.enableDataAccess,
        enableSelfImprovement: args.enableSelfImprovement,
    });

    const runSavedChart = getRunSavedChart({
        updateProgress: dependencies.updateProgress,
        runAsyncQuery: dependencies.runAsyncQuery,
        getSavedChart: dependencies.getSavedChart,
        maxLimit: args.maxQueryLimit,
        enableDataAccess: args.enableDataAccess,
    });

    const runSql = args.canRunSql
        ? getRunSql({
              updateProgress: dependencies.updateProgress,
              runSqlJob: dependencies.runSqlJob,
              getPrompt: dependencies.getPrompt,
              sendFile: dependencies.sendFile,
              updateSlackMessage: dependencies.updateSlackMessage,
              siteUrl: args.siteUrl,
              waitForSqlApproval: dependencies.waitForSqlApproval,
              recordSqlApproval: dependencies.recordSqlApproval,
              maxQueryLimit: args.runSqlMaxLimit,
          })
        : null;

    const listWarehouseTables = args.canRunSql
        ? getListWarehouseTables({
              listWarehouseTables: dependencies.listWarehouseTables,
          })
        : null;

    const describeWarehouseTable = args.canRunSql
        ? getDescribeWarehouseTable({
              describeWarehouseTable: dependencies.describeWarehouseTable,
          })
        : null;

    const generateDashboard = getGenerateDashboardV2({
        getPrompt: dependencies.getPrompt,
        createOrUpdateArtifact: dependencies.createOrUpdateArtifact,
    });

    const improveContext = getImproveContext();
    const editContent = getEditContent({
        editContent: dependencies.editContent,
    });
    const createContent = getCreateContent({
        createContent: dependencies.createContent,
    });
    const runContentQuery = getRunContentQuery({
        updateProgress: dependencies.updateProgress,
        runAsyncQuery: dependencies.runAsyncQuery,
        runSavedChartQuery: dependencies.runSavedChartQuery,
        getSavedChart: dependencies.getSavedChart,
        validateContent: dependencies.validateContent,
        maxLimit: args.maxQueryLimit,
        enableDataAccess: args.enableDataAccess,
    });

    const proposeChange = getProposeChange({
        createChange: dependencies.createChange,
        getExploreCompiler: dependencies.getExploreCompiler,
    });

    const proposeWriteback = args.enableAiWriteback
        ? getProposeWriteback({
              proposeWriteback: dependencies.proposeWriteback,
          })
        : null;

    const setupPreviewDeploy = args.enablePreviewDeploySetup
        ? getSetupPreviewDeploy({
              setupPreviewDeploy: dependencies.setupPreviewDeploy,
          })
        : null;

    const searchFieldValues = getSearchFieldValues({
        searchFieldValues: dependencies.searchFieldValues,
    });

    const listKnowledgeDocuments = getListKnowledgeDocuments({
        listKnowledgeDocuments: dependencies.listKnowledgeDocuments,
    });

    const getKnowledgeDocumentContent = getGetKnowledgeDocumentContent({
        getKnowledgeDocumentContent: dependencies.getKnowledgeDocumentContent,
    });

    const loadSkill =
        args.availableSkills.length > 0
            ? getLoadSkill({
                  loadSkill: dependencies.loadSkill,
              })
            : null;
    const generateUuids = getGenerateUuids();

    const listProjects = getListProjects({
        listProjects: dependencies.listProjects,
    });

    const getProjectInfo = getGetProjectInfo({
        getProjectInfo: dependencies.getProjectInfo,
    });

    const tools: ToolSet = {
        findContent,
        discoverFields,
        listProjects,
        getProjectInfo,
        listKnowledgeDocuments,
        getKnowledgeDocumentContent,
        ...(args.enableAgentRevamp && args.enableContentTools
            ? {
                  readContent,
                  editContent,
                  listContent,
                  createContent,
                  runContentQuery,
              }
            : {
                  getDashboardCharts,
                  generateDashboard,
              }),
        generateVisualization,
        runSavedChart,
        generateUuids,
        ...(args.canManageAgent ? { improveContext } : {}),
        ...(args.enableSelfImprovement && args.canManageAgent
            ? { proposeChange }
            : {}),
        ...(proposeWriteback ? { proposeWriteback } : {}),
        ...(setupPreviewDeploy ? { setupPreviewDeploy } : {}),
        ...(args.enableDataAccess ? { searchFieldValues } : {}),
        ...(runSql ? { runSql } : {}),
        ...(listWarehouseTables ? { listWarehouseTables } : {}),
        ...(describeWarehouseTable ? { describeWarehouseTable } : {}),
        ...(loadSkill ? { loadSkill } : {}),
    };

    const mergedTools = { ...tools, ...mcpToolSetup.tools };

    logger(
        'Agent Tools',
        `Successfully retrieved agent tools: ${Object.keys(mergedTools).join(', ')}`,
    );
    return mergedTools;
};

const getAgentMessages = (args: AiAgentArgs, availableExplores: Explore[]) => {
    const logger = createAiAgentLogger(args.debugLoggingEnabled);
    logger('Agent Messages', 'Getting agent messages.');

    const messageHistory = withToolHints(args.messageHistory, args.toolHints);

    const messages = [
        getSystemPromptV2({
            agentName: args.agentSettings.name,
            instructions: args.agentSettings.instruction || undefined,
            availableExplores,
            availableSkills: args.availableSkills,
            knowledgeDocuments: args.knowledgeDocuments,
            enableDataAccess: args.enableDataAccess,
            enableSelfImprovement: args.enableSelfImprovement,
            enableAiWriteback: args.enableAiWriteback,
            enableContentTools:
                args.enableAgentRevamp && args.enableContentTools,
            canRunSql: args.canRunSql,
            warehouseType: args.warehouseType,
            warehouseSchema: args.warehouseSchema,
        }),
        ...messageHistory,
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
    mcpToolSetup,
}: {
    args: AiAgentArgs;
    dependencies: AiAgentDependencies;
    mcpToolSetup: AgentMcpToolSetup;
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
    const startTime = Date.now();
    const modelName = args.model.modelId;

    try {
        const availableExplores = await dependencies.listExplores();
        const tools = getAgentTools(
            args,
            dependencies,
            availableExplores,
            mcpToolSetup,
        );
        const messages = getAgentMessages(args, availableExplores);
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
            experimental_context: new AgentContext(availableExplores),
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
                                    }) (ARGS: ${JSON.stringify(toolCall.input)})`,
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
                                    mcpServerUuid:
                                        mcpToolSetup.mcpToolNameToServerUuid[
                                            toolCall.toolName
                                        ] ?? null,
                                    parentToolCallId: null,
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
                                    }) (RESULT: ${JSON.stringify(toolResult.output)})`,
                                );
                                const output = normalizeToolOutput(
                                    toolResult.output,
                                );
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
            `Generation complete. Result text length: ${result.text.length}, finishReason: ${result.finishReason}`,
        );

        if (result.steps.length >= STEP_CAP && !result.text) {
            throw new AiAgentStepCapReachedError(result.steps.length);
        }

        await dependencies.updatePrompt({
            promptUuid: args.promptUuid,
            response: result.text,
            tokenUsage: {
                totalTokens: result.usage.totalTokens ?? 0,
            },
        });

        const totalTime = Date.now() - startTime;
        dependencies.perf.measureGenerateResponseTime(totalTime);
        dependencies.perf.measureTTFT(totalTime, modelName, 'generate');

        return result.text;
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';

        Logger.error(
            `[AiAgent][Generate Agent Response] Error during agent response generation: ${errorMessage}`,
        );
        Sentry.captureException(error);

        const userFacingMessage = getUserFacingErrorMessage(
            error,
            'Something went wrong while generating the response. Please try again.',
        );

        await dependencies.updatePrompt({
            promptUuid: args.promptUuid,
            errorMessage: userFacingMessage,
        });

        throw error;
    } finally {
        await mcpToolSetup.closeMcpClients();
    }
};

export const streamAgentResponse = async ({
    args,
    dependencies,
    mcpToolSetup,
}: {
    args: AiStreamAgentResponseArgs;
    dependencies: AiAgentDependencies;
    mcpToolSetup: AgentMcpToolSetup;
}): Promise<StreamTextResult<ToolSet, Output.Output>> => {
    const logger = createAiAgentLogger(args.debugLoggingEnabled);
    logger(
        'Stream Agent Response',
        `Starting stream generation for prompt UUID: ${args.promptUuid}`,
    );
    logger(
        'Stream Agent Response',
        `Agent settings: ${JSON.stringify(args.agentSettings)}`,
    );

    const startTime = Date.now();
    let firstChunkTime: number | null = null;
    let firstTextTime: number | null = null;
    let mcpClientsClosed = false;
    const modelName =
        typeof args.model === 'string' ? args.model : args.model.modelId;

    const cleanupMcpClients = async () => {
        if (mcpClientsClosed) {
            return;
        }

        mcpClientsClosed = true;
        await mcpToolSetup.closeMcpClients();
    };

    try {
        const availableExplores = await dependencies.listExplores();
        const tools = getAgentTools(
            args,
            dependencies,
            availableExplores,
            mcpToolSetup,
        );
        const messages = getAgentMessages(args, availableExplores);
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
            experimental_context: new AgentContext(availableExplores),
            onChunk: (event) => {
                // Track time to first chunk (any type) - only once
                if (firstChunkTime === null) {
                    firstChunkTime = Date.now();
                    const ttfc = firstChunkTime - startTime;
                    logger(
                        'First Chunk',
                        `Time to first chunk (${event.chunk.type}): ${ttfc}ms`,
                    );
                    dependencies.perf.measureStreamFirstChunk(ttfc);
                }

                switch (event.chunk.type) {
                    case 'tool-call':
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

                        if (event.chunk.invalid) {
                            Sentry.captureException(event.chunk.error, {
                                tags: {
                                    errorType: 'AiAgentToolCallInvalid',
                                },
                            });
                            break;
                        }

                        void dependencies
                            .storeToolCall({
                                promptUuid: args.promptUuid,
                                toolCallId: event.chunk.toolCallId,
                                toolName: event.chunk.toolName,
                                toolArgs: event.chunk.input as object,
                                mcpServerUuid:
                                    mcpToolSetup.mcpToolNameToServerUuid[
                                        event.chunk.toolName
                                    ] ?? null,
                                parentToolCallId: null,
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
                        // The discoverFields tool emits preliminary
                        // tool-result chunks as it streams subagent progress.
                        // Only persist the final, non-preliminary one — N
                        // intermediate rows for the same toolCallId would be
                        // wasteful and the intermediate output shapes carry
                        // streaming state, not the parent-facing result.
                        if (event.chunk.preliminary) {
                            break;
                        }
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
                                    ...normalizeToolOutput(event.chunk.output),
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
                        // Track time to first text token (TTFT) - only once
                        if (firstTextTime === null) {
                            firstTextTime = Date.now();
                            const ttft = firstTextTime - startTime;
                            logger(
                                'Chunk Text Delta',
                                `Time to first text token (TTFT): ${ttft}ms`,
                            );
                            dependencies.perf.measureTTFT(
                                ttft,
                                modelName,
                                'stream',
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
            onStepFinish: (step) => {
                if (step.reasoningText && step.reasoningText.length > 0) {
                    logger(
                        'On Step Finish',
                        `Storing reasoning text for Prompt UUID ${args.promptUuid}`,
                    );
                    void dependencies
                        .storeReasoning(args.promptUuid, [
                            {
                                // TODO :: this works for now, but we need to find a better way to capture the reasoning id from `providerMetadata`
                                reasoningId: crypto.randomUUID(),
                                text: step.reasoningText,
                            },
                        ])
                        .catch((error) => {
                            Logger.error(
                                'On Step Finish',
                                `Failed to store reasoning: ${error}`,
                            );
                            Sentry.captureException(error);
                        });
                }
            },
            onFinish: async ({ usage, steps, reasoning, finishReason }) => {
                logger(
                    'On Finish',
                    `Stream finished. Updating prompt with response. finishReason: ${finishReason}, steps: ${steps.length}`,
                );

                // Extract complete response from all steps instead of just the last text
                const completeResponse = steps
                    .flatMap((step) => step.text || [])
                    .join('\n');

                const stepCapReached = steps.length >= STEP_CAP;

                if (stepCapReached && !completeResponse) {
                    void dependencies.updatePrompt({
                        promptUuid: args.promptUuid,
                        errorMessage: getUserFacingErrorMessage(
                            new AiAgentStepCapReachedError(steps.length),
                        ),
                        tokenUsage: {
                            totalTokens: usage.totalTokens ?? 0,
                        },
                    });
                } else {
                    void dependencies.updatePrompt({
                        response: completeResponse,
                        promptUuid: args.promptUuid,
                        tokenUsage: {
                            totalTokens: usage.totalTokens ?? 0,
                        },
                    });
                }

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
                        finishReason,
                        stepCapReached,
                    },
                });
                logger(
                    'On Finish',
                    `Usage: ${JSON.stringify(usage)}, step length: ${
                        steps.length
                    }, reasoning length: ${reasoning.length}`,
                );

                dependencies.perf.measureStreamResponseTime(
                    Date.now() - startTime,
                );

                await cleanupMcpClients();
            },
            experimental_transform: smoothStream({
                delayInMs: 20,
                chunking: 'word',
            }),
            onError: ({ error }) => {
                console.error(error);
                const errorMessage =
                    error instanceof Error ? error.message : 'Unknown error';

                Logger.error(
                    `[AiAgent][Stream Agent Response] Error during streaming: ${errorMessage}`,
                );
                Sentry.captureException(error, {
                    tags: {
                        errorType: 'AiAgentStreamError',
                    },
                });

                const userFacingMessage = getUserFacingErrorMessage(
                    error,
                    'Something went wrong while streaming the response. Please try again.',
                );

                void dependencies.updatePrompt({
                    promptUuid: args.promptUuid,
                    errorMessage: userFacingMessage,
                });

                void cleanupMcpClients();
            },
            experimental_telemetry: getAgentTelemetryConfig(
                'streamAgentResponse',
                args,
            ),
        });

        logger('Stream Agent Response', 'Returning stream result.');
        return result;
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';

        Logger.error(
            `[AiAgent][Stream Agent Response] Fatal error before stream could start: ${errorMessage}`,
        );
        Sentry.captureException(error, {
            tags: {
                errorType: 'AiAgentStreamError',
            },
        });

        const userFacingMessage = getUserFacingErrorMessage(
            error,
            'Something went wrong while processing your request. Please try again.',
        );

        await dependencies.updatePrompt({
            promptUuid: args.promptUuid,
            errorMessage: userFacingMessage,
        });

        await cleanupMcpClients();
        throw error;
    }
};
