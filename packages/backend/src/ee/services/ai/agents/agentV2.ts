import {
    AgentToolOutput,
    AnyType,
    assertUnreachable,
    Explore,
} from '@lightdash/common';
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
import { getAnalyzeFieldImpact } from '../tools/analyzeFieldImpact';
import { getCreateContent } from '../tools/createContent';
import { getDescribeWarehouseTable } from '../tools/describeWarehouseTable';
import { getDiscoverRepos } from '../tools/discoverRepos';
import { getEditContent } from '../tools/editContent';
import { getEditDbtProject } from '../tools/editDbtProject';
import { getEditProjectContext } from '../tools/editProjectContext';
import { getExploreRepo } from '../tools/exploreRepo';
import { getFindContent } from '../tools/findContent';
import { getGenerateDashboardV2 } from '../tools/generateDashboardV2';
import { getGenerateHashes } from '../tools/generateHashes';
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
import { getLoadProjectContext } from '../tools/loadProjectContext';
import { getLoadSkill } from '../tools/loadSkill';
import { getReadContent } from '../tools/readContent';
import { getReadPinnedThread } from '../tools/readPinnedThread';
import { getRunContentQuery } from '../tools/runContentQuery';
import { getRunSavedChart } from '../tools/runSavedChart';
import { getRunSql } from '../tools/runSql';
import { getSearchFieldValues } from '../tools/searchFieldValues';
import { getSearchSemanticLayer } from '../tools/searchSemanticLayer';
import { getSetupPreviewDeploy } from '../tools/setupPreviewDeploy';
import { getSyncDbtProject } from '../tools/syncDbtProject';
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
import { summarizeToolCall, summarizeToolResult } from '../utils/toolSummaries';
import { getDiscoverFields } from './discoverFields/tool';
import { getAgentTelemetryConfig, getAiAgentModelName } from './telemetry';

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

/**
 * When forceToolHints is set, force the first hinted tool on the opening step
 * (toolChoice) and release to auto afterwards. Used by the review Build-fix run
 * to guarantee the agent opens a PR via editDbtProject rather than just
 * discussing the fix. No-op if the forced tool isn't in the registered set.
 */
const buildForcedFirstStep = (args: AiAgentArgs, tools: ToolSet) => {
    if (!args.forceToolHints) return undefined;
    const forcedTool = args.toolHints[0];
    if (!forcedTool || !(forcedTool in tools)) return undefined;
    return ({ stepNumber }: { stepNumber: number }) =>
        stepNumber === 0
            ? { toolChoice: { type: 'tool' as const, toolName: forcedTool } }
            : {};
};

const buildPrepareStep = ({
    args,
    dependencies,
    tools,
    logger,
}: {
    args: AiAgentArgs;
    dependencies: AiAgentDependencies;
    tools: ToolSet;
    logger: ReturnType<typeof createAiAgentLogger>;
}) => {
    const forcedFirstStep = buildForcedFirstStep(args, tools);

    return async ({
        stepNumber,
        messages,
    }: {
        stepNumber: number;
        messages: ModelMessage[];
    }) => {
        const forced = forcedFirstStep?.({ stepNumber }) ?? {};
        const steers = await dependencies.consumePromptSteers({
            promptUuid: args.promptUuid,
            stepNumber,
        });

        if (steers.length === 0) return forced;

        logger(
            'Prepare Step',
            `Injecting ${steers.length} steer(s) for prompt UUID: ${args.promptUuid}`,
        );

        return {
            ...forced,
            messages: [
                ...messages,
                {
                    role: 'user' as const,
                    content: [
                        'Additional guidance from the user while you were working:',
                        ...steers.map((steer) => `- ${steer.message}`),
                    ].join('\n'),
                },
            ],
        };
    };
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
            toolDescriptionMaxChars: args.toolDescriptionMaxChars,
            promptUuid: args.promptUuid,
            telemetry: {
                agentSettings: args.agentSettings,
                threadUuid: args.threadUuid,
                promptUuid: args.promptUuid,
                organizationId: args.organizationId,
                userId: args.userId,
                telemetryEnabled: args.telemetryEnabled,
                model: args.model,
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
        toolDescriptionMaxChars: args.toolDescriptionMaxChars,
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
              storeToolResults: dependencies.storeToolResults,
              maxQueryLimit: args.runSqlMaxLimit,
              autoApproveSql: args.autoApproveSql,
              autoApproveSqlUserUuid: args.autoApproveSqlUserUuid,
              useSlackStreamCard: args.useSlackStreamCard,
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

    const editDbtProject = args.enableAiWriteback
        ? getEditDbtProject({
              editDbtProject: dependencies.editDbtProject,
          })
        : null;

    // Only present in review-remediation work threads, where the user can
    // rebuild/change the project_context PR conversationally.
    const editProjectContext = args.enableEditProjectContext
        ? getEditProjectContext({
              editProjectContext: dependencies.editProjectContext,
          })
        : null;

    const syncDbtProject = args.enableAiWriteback
        ? getSyncDbtProject({
              syncDbtProject: dependencies.syncDbtProject,
              updateProgress: dependencies.updateProgress,
          })
        : null;

    const setupPreviewDeploy = args.enablePreviewDeploySetup
        ? getSetupPreviewDeploy({
              setupPreviewDeploy: dependencies.setupPreviewDeploy,
          })
        : null;

    const exploreRepo = args.enableRepoDiscovery
        ? getExploreRepo({
              exploreRepo: dependencies.exploreRepo,
          })
        : null;

    const discoverRepos = args.enableRepoDiscovery
        ? getDiscoverRepos({
              discoverRepos: dependencies.discoverRepos,
          })
        : null;

    const searchFieldValues = getSearchFieldValues({
        searchFieldValues: dependencies.searchFieldValues,
    });

    const analyzeFieldImpact = getAnalyzeFieldImpact({
        analyzeFieldImpact: dependencies.analyzeFieldImpact,
        updateProgress: dependencies.updateProgress,
    });

    const searchSemanticLayer = getSearchSemanticLayer({
        searchSemanticLayer: dependencies.searchSemanticLayer,
        updateProgress: dependencies.updateProgress,
        // The agent chooses pageSize per task; cap it so one call can't pull an
        // unbounded payload while still letting an audit grab the inventory in
        // one or two round-trips.
        maxPageSize: 500,
        toolDescriptionMaxChars: args.toolDescriptionMaxChars,
    });

    const listKnowledgeDocuments = getListKnowledgeDocuments({
        listKnowledgeDocuments: dependencies.listKnowledgeDocuments,
    });

    const getKnowledgeDocumentContent = getGetKnowledgeDocumentContent({
        getKnowledgeDocumentContent: dependencies.getKnowledgeDocumentContent,
    });

    const readPinnedThread = getReadPinnedThread({
        readPinnedThread: dependencies.readPinnedThread,
    });

    const loadSkill =
        args.availableSkills.length > 0
            ? getLoadSkill({
                  loadSkill: dependencies.loadSkill,
              })
            : null;
    const generateHashes = getGenerateHashes();
    const generateUuids = getGenerateUuids();

    const listProjects = getListProjects({
        listProjects: dependencies.listProjects,
    });

    const getProjectInfo = getGetProjectInfo({
        getProjectInfo: dependencies.getProjectInfo,
    });

    const loadProjectContext = args.projectContextEnabled
        ? getLoadProjectContext({
              getDocument: dependencies.getProjectContextDocument,
          })
        : null;

    const enableContentTools =
        args.enableAgentRevamp &&
        args.enableDataAccess &&
        args.enableContentTools;

    const tools: ToolSet = {
        findContent,
        discoverFields,
        analyzeFieldImpact,
        ...(args.enableSearchSemanticLayer ? { searchSemanticLayer } : {}),
        listProjects,
        getProjectInfo,
        listKnowledgeDocuments,
        getKnowledgeDocumentContent,
        readPinnedThread,
        ...(enableContentTools
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
        generateHashes,
        generateUuids,
        ...(args.canManageAgent ? { improveContext } : {}),
        ...(editDbtProject ? { editDbtProject } : {}),
        ...(editProjectContext ? { editProjectContext } : {}),
        ...(syncDbtProject ? { syncDbtProject } : {}),
        ...(setupPreviewDeploy ? { setupPreviewDeploy } : {}),
        ...(exploreRepo ? { exploreRepo } : {}),
        ...(discoverRepos ? { discoverRepos } : {}),
        ...(args.enableDataAccess ? { searchFieldValues } : {}),
        ...(runSql ? { runSql } : {}),
        ...(listWarehouseTables ? { listWarehouseTables } : {}),
        ...(describeWarehouseTable ? { describeWarehouseTable } : {}),
        ...(loadSkill ? { loadSkill } : {}),
        ...(loadProjectContext ? { loadProjectContext } : {}),
    };

    const mergedTools = { ...tools, ...mcpToolSetup.tools };

    logger(
        'Agent Tools',
        `Successfully retrieved agent tools: ${Object.keys(mergedTools).join(', ')}`,
    );
    return mergedTools;
};

// Fires an `in_progress` task update the moment a tool's execute() runs — i.e. as
// soon as the model emits the call, before the (possibly slow) tool finishes.
// generateText() only surfaces tool progress in onStepFinish, which lands after
// the tool already returned, so without this the Slack/UI card stays empty until
// the first tool completes. The streaming path emits this from its 'tool-call'
// chunk instead, so this wrap is only applied in the non-streaming path.
const withEarlyToolProgress = (
    tools: ToolSet,
    updateProgress: AiAgentDependencies['updateProgress'],
): ToolSet =>
    Object.fromEntries(
        Object.entries(tools).map(([toolName, toolDef]) => {
            const originalExecute = toolDef.execute;
            if (typeof originalExecute !== 'function') {
                return [toolName, toolDef];
            }
            return [
                toolName,
                {
                    ...toolDef,
                    execute: (input: AnyType, options: AnyType) => {
                        void updateProgress(
                            summarizeToolCall(toolName, input) ??
                                `Running ${toolName}...`,
                            toolName,
                            options?.toolCallId,
                            'in_progress',
                        ).catch((error) => {
                            Logger.debug(
                                '[AiAgent] Failed to emit early tool progress:',
                                error,
                            );
                        });
                        return originalExecute(input, options);
                    },
                },
            ];
        }),
    ) as ToolSet;

const getUnauthenticatedMcpServerNames = (
    args: AiAgentArgs,
    mcpToolSetup: AgentMcpToolSetup,
) => {
    const oauthServerUuids = new Set(
        args.mcpServers
            .filter((server) => server.authType === 'oauth')
            .map((server) => server.uuid),
    );

    return mcpToolSetup.unavailableMcpServers
        .filter(
            (server) =>
                server.status === 'not_connected' &&
                oauthServerUuids.has(server.serverUuid),
        )
        .map((server) => server.serverName);
};

const getAgentMessages = (
    args: AiAgentArgs,
    availableExplores: Explore[],
    mcpToolSetup: AgentMcpToolSetup,
) => {
    const logger = createAiAgentLogger(args.debugLoggingEnabled);
    logger('Agent Messages', 'Getting agent messages.');

    const messageHistory = withToolHints(args.messageHistory, args.toolHints);

    // Project context is loaded on demand via the loadProjectContext tool; the
    // system prompt only advertises that it exists (when enabled + non-empty).
    const hasProjectContext =
        args.projectContextEnabled && args.projectContext.length > 0;

    const messages = [
        getSystemPromptV2({
            agentName: args.agentSettings.name,
            instructions: args.agentSettings.instruction || undefined,
            availableExplores,
            availableSkills: args.availableSkills,
            knowledgeDocuments: args.knowledgeDocuments,
            hasProjectContext,
            enableDataAccess: args.enableDataAccess,
            enableSearchSemanticLayer: args.enableSearchSemanticLayer,
            enableAiWriteback: args.enableAiWriteback,
            writebackAttribution: args.writebackAttribution,
            siteUrl: args.siteUrl,
            enableRepoDiscovery: args.enableRepoDiscovery,
            repoFsRoot: args.repoFsRoot,
            repoFsSupportsCodeSearch: args.repoFsSupportsCodeSearch,
            enableContentTools:
                args.enableAgentRevamp &&
                args.enableDataAccess &&
                args.enableContentTools,
            canRunSql: args.canRunSql,
            warehouseType: args.warehouseType,
            warehouseSchema: args.warehouseSchema,
            unauthenticatedMcpServerNames: getUnauthenticatedMcpServerNames(
                args,
                mcpToolSetup,
            ),
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
    const modelName = getAiAgentModelName(args.model);

    try {
        const availableExplores = await dependencies.listExplores();
        const tools = withEarlyToolProgress(
            getAgentTools(args, dependencies, availableExplores, mcpToolSetup),
            dependencies.updateProgress,
        );
        const messages = getAgentMessages(
            args,
            availableExplores,
            mcpToolSetup,
        );
        logger(
            'Generate Agent Response',
            `Calling generateText with model: ${modelName}`,
        );
        const prepareStep = buildPrepareStep({
            args,
            dependencies,
            tools,
            logger,
        });
        const result = await generateText({
            ...defaultAgentOptions,
            ...args.callOptions,
            prepareStep,
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

                                // in_progress is emitted at execute start by withEarlyToolProgress; re-emitting here double-sends it.

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
                                void dependencies
                                    .updateProgress(
                                        summarizeToolResult(
                                            toolResult.toolName,
                                            toolResult.output as AnyType,
                                        ),
                                        toolResult.toolName,
                                        toolResult.toolCallId,
                                        'complete',
                                    )
                                    .catch((error) => {
                                        Logger.debug(
                                            '[AiAgent][On Step Finish] Failed to update tool progress:',
                                            error,
                                        );
                                    });
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
        Sentry.captureException(error, {
            tags: {
                'ai.model': modelName,
            },
        });

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
    const modelName = getAiAgentModelName(args.model);

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
        const messages = getAgentMessages(
            args,
            availableExplores,
            mcpToolSetup,
        );
        logger(
            'Stream Agent Response',
            `Calling streamText with model: ${modelName}`,
        );
        const prepareStep = buildPrepareStep({
            args,
            dependencies,
            tools,
            logger,
        });
        const stopWhenPromptInterrupted = async () => {
            const interrupted = await dependencies.isPromptInterrupted(
                args.promptUuid,
            );
            if (interrupted) {
                logger(
                    'Stream Agent Response',
                    `Stopping stream for interrupted prompt UUID: ${args.promptUuid}`,
                );
            }
            return interrupted;
        };
        const result = streamText({
            ...defaultAgentOptions,
            ...args.callOptions,
            prepareStep,
            stopWhen: [stepCountIs(STEP_CAP), stopWhenPromptInterrupted],
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
                                    'ai.model': modelName,
                                },
                            });
                            break;
                        }

                        void dependencies
                            .updateProgress(
                                summarizeToolCall(
                                    event.chunk.toolName,
                                    event.chunk.input as AnyType,
                                ) ?? `Running ${event.chunk.toolName}...`,
                                event.chunk.toolName,
                                event.chunk.toolCallId,
                                'in_progress',
                            )
                            .catch((error) => {
                                Logger.debug(
                                    '[AiAgent][Chunk Tool Call] Failed to update tool progress:',
                                    error,
                                );
                            });

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
                                Sentry.captureException(error, {
                                    tags: {
                                        'ai.model': modelName,
                                    },
                                });
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
                            .updateProgress(
                                summarizeToolResult(
                                    event.chunk.toolName,
                                    event.chunk.output as AnyType,
                                ),
                                event.chunk.toolName,
                                event.chunk.toolCallId,
                                'complete',
                            )
                            .catch((error) => {
                                Logger.debug(
                                    '[AiAgent][Chunk Tool Result] Failed to update tool progress:',
                                    error,
                                );
                            });
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
                                Sentry.captureException(error, {
                                    tags: {
                                        'ai.model': modelName,
                                    },
                                });
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
                            Sentry.captureException(error, {
                                tags: {
                                    'ai.model': modelName,
                                },
                            });
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
                        'ai.model': modelName,
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
                'ai.model': modelName,
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
