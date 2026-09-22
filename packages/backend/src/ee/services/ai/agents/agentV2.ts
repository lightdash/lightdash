import {
    AgentToolOutput,
    AI_DEEP_RESEARCH_WORKER_FINDINGS_TOOL_NAME,
    AnyType,
    assertUnreachable,
    Explore,
    getErrorMessage,
    type AiDeepResearchBudget,
    type AiDeepResearchExecutionContextSnapshot,
    type CustomChartTypeLibrary,
    type ParameterDefinitions,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import {
    generateText,
    smoothStream,
    stepCountIs,
    streamText,
    StreamTextResult,
    type LanguageModelUsage,
    type ModelMessage,
    type OnToolCallFinishEvent,
    type Output,
    type TextStreamPart,
    type ToolCallPart,
    type ToolSet,
} from 'ai';
import {
    emitAiUsage,
    languageModelUsageToTokens,
} from '../../../../analytics/aiUsage';
import Logger from '../../../../logging/logger';
import {
    getAiDeepResearchCoordinatorInstructions,
    getAiDeepResearchWorkerInstructions,
} from '../../AiDeepResearchService/AiDeepResearchAgent';
import {
    isDeepResearchRawSqlMcpTool,
    isDeepResearchWarehouseMcpTool,
} from '../../AiDeepResearchService/toolClassification';
import { MCP_UNTRUSTED_OUTPUT_NOTICE } from '../AiAgentMcpRuntimeClient';
import { Compaction } from '../compaction';
import {
    getAgentDecisionContext,
    getAgentQuestion,
} from '../decisions/agentQuestion';
import { AnswerClaimVerifier } from '../decisions/answerClaims';
import {
    withAnswerEvidence,
    type AnswerEvidence,
} from '../decisions/answerEvidence';
import { prepareCatalogMetadata } from '../decisions/catalogMetadata';
import {
    CATALOG_AMBIGUITY_GUIDANCE,
    CATALOG_TIME_AMBIGUITY_GUIDANCE,
    rankCatalog,
} from '../decisions/catalogRanking';
import {
    prepareRelevantContext,
    type PreparedContext,
    type TurnIntent,
} from '../decisions/prepareContext';
import { queryErrorOverride } from '../decisions/queryErrors';
import { createQueryReviewer } from '../decisions/queryReview';
import { AI_DEEP_RESEARCH_INSTRUCTIONS } from '../prompts/deepResearch';
import { getSystemPromptV2 } from '../prompts/systemV2';
import {
    accumulatePromptTokenUsage,
    completedPromptTokenUsage,
    initialPromptTokenUsage,
} from '../promptTokenUsage';
import { getAnalyzeFieldImpact } from '../tools/analyzeFieldImpact';
import { getClosePullRequest } from '../tools/closePullRequest';
import { getCreateContent } from '../tools/createContent';
import { getCreateScheduledDelivery } from '../tools/createScheduledDelivery';
import { getDelegateResearchTask } from '../tools/delegateResearchTask';
import { getDescribeWarehouseTable } from '../tools/describeWarehouseTable';
import { getDiscoverRepos } from '../tools/discoverRepos';
import { getEditContent } from '../tools/editContent';
import { getEditDbtProject } from '../tools/editDbtProject';
import { getEditProjectContext } from '../tools/editProjectContext';
import { getEditRepo } from '../tools/editRepo';
import { getExploreRepo } from '../tools/exploreRepo';
import { getExportChartAsCode } from '../tools/exportChartAsCode';
import { getFindContent } from '../tools/findContent';
import { getFindCustomChartTypes } from '../tools/findCustomChartTypes';
import { getGenerateDashboardV2 } from '../tools/generateDashboardV2';
import { getGenerateDataApp } from '../tools/generateDataApp';
import { getGenerateHashes } from '../tools/generateHashes';
import { getGenerateUuids } from '../tools/generateUuids';
import { getGetDashboardCharts } from '../tools/getDashboardCharts';
import { getGetKnowledgeDocumentContent } from '../tools/getKnowledgeDocumentContent';
import { getGetMetadata } from '../tools/getMetadata';
import { getGetProjectInfo } from '../tools/getProjectInfo';
import { getGetPullRequestDiff } from '../tools/getPullRequestDiff';
import { getGrepFields } from '../tools/grepFields';
import {
    extractKeywords,
    getCachedFieldIndex,
    renderCandidateBlock,
    selectCandidateFields,
} from '../tools/grepFieldsIndex';
import { getIterateDataApp } from '../tools/iterateDataApp';
import { getListContent } from '../tools/listContent';
import { getListDataAppThemes } from '../tools/listDataAppThemes';
import { getListKnowledgeDocuments } from '../tools/listKnowledgeDocuments';
import { getListProjects } from '../tools/listProjects';
import { getListWarehouseTables } from '../tools/listWarehouseTables';
import { getListWorkstreams } from '../tools/listWorkstreams';
import { getLoadAgentTools } from '../tools/loadAgentTools';
import { getLoadMcpTools } from '../tools/loadMcpTools';
import { getLoadProjectContext } from '../tools/loadProjectContext';
import { getLoadSkill } from '../tools/loadSkill';
import { getProjectContextSearchEntries } from '../tools/memoryProjectContext';
import { getReadContent } from '../tools/readContent';
import { getReadPinnedThread } from '../tools/readPinnedThread';
import { getResolveUrl } from '../tools/resolveUrl';
import { getRunComposerQueries } from '../tools/runComposerQueries';
import { getRunContentQuery } from '../tools/runContentQuery';
import { getRunQuery } from '../tools/runQuery';
import { getRunSavedChart } from '../tools/runSavedChart';
import { getRunSql } from '../tools/runSql';
import { getSearchFieldValues } from '../tools/searchFieldValues';
import { getSearchSemanticLayer } from '../tools/searchSemanticLayer';
import { getSetupPreviewDeploy } from '../tools/setupPreviewDeploy';
import { getSubmitWorkerFindings } from '../tools/submitWorkerFindings';
import { getSyncDbtProject } from '../tools/syncDbtProject';
import { getUpdateUserName } from '../tools/updateUserName';
import type {
    AiAgentArgs,
    AiAgentDependencies,
    AiStreamAgentResponseArgs,
    UnavailableMcpServer,
} from '../types/aiAgent';
import { AgentContext } from '../utils/AgentContext';
import {
    AiAgentEmptyResponseError,
    AiAgentStepCapReachedError,
    createUserFacingErrorResolver,
    getUserFacingErrorMessage,
} from '../utils/errorMessages';
import {
    generatedResponseTransform,
    syntheticTextTransform,
} from '../utils/GeneratedResponseBlocks';
import { renderMemoryBlock } from '../utils/memoryBlock';
import {
    isErrorToolResult,
    isPendingToolResult,
    summarizeToolCall,
    summarizeToolResult,
} from '../utils/toolSummaries';
import { getMcpActiveTools } from './mcpToolGating';
import { compactChartDiscovery, getPreviousQueryUuid } from './previousQuery';
import { buildQueryRetryStepOverride } from './queryRetryCap';
import { repairQueryToolCall } from './queryToolCallRepair';
import {
    createIntentToolGate,
    type IntentToolGate,
} from './referenceToolGating';
import { getAgentTelemetryConfig, getAiAgentModelName } from './telemetry';
import {
    TurnTimingTracker,
    withNonStreamingProviderTiming,
    type StepTiming,
} from './turnTiming';

const createAiAgentLogger =
    (debugLoggingEnabled: boolean) => (context: string, message: string) => {
        if (debugLoggingEnabled) {
            Logger.debug(`[AiAgent][${context}] ${message}`);
        }
    };

const FAST_INTENT_TOOLS: Partial<Record<TurnIntent, string>> = {
    chart_from_previous: 'generateVisualization',
    chart_export: 'exportChartAsCode',
};

const getFastIntentTool = (
    turnIntent: TurnIntent | null | undefined,
    preloadedMcpToolNames: string[] = [],
): string | null =>
    // A relevant external tool may supply data required before the local action.
    turnIntent && preloadedMcpToolNames.length === 0
        ? (FAST_INTENT_TOOLS[turnIntent] ?? null)
        : null;

const isFastToolCallStep = (
    args: AiAgentArgs,
    turnIntent: TurnIntent | null | undefined,
    step: {
        toolCalls?: ReadonlyArray<{ toolName: string }>;
    },
    isFirstStep: boolean,
    preloadedMcpToolNames?: string[],
) => {
    if (!args.toolCallModel || !isFirstStep) return false;
    const expectedTool = getFastIntentTool(turnIntent, preloadedMcpToolNames);
    return (
        expectedTool !== null &&
        !!step.toolCalls?.some(({ toolName }) => toolName === expectedTool)
    );
};

export const recordAgentStepUsage = async ({
    usage,
    telemetry,
    execution,
}: {
    usage: LanguageModelUsage;
    telemetry: ReturnType<typeof getAgentTelemetryConfig>;
    execution: AiAgentArgs['execution'];
}) => {
    const tokens = languageModelUsageToTokens(usage);
    emitAiUsage(telemetry, tokens);
    if (execution.mode === 'deep_research') {
        await execution.onStepUsage?.({
            runUuid: execution.runUuid,
            phase: execution.phase,
            tokens,
        });
    }
    return tokens;
};

const createAgentStepUsageRecorder = ({
    args,
    turnIntent,
    preloadedMcpToolNames,
    functionId,
    feature,
}: {
    args: AiAgentArgs;
    turnIntent: TurnIntent | null | undefined;
    preloadedMcpToolNames?: string[];
    functionId: string;
    feature?: Parameters<typeof getAgentTelemetryConfig>[2];
}) => {
    const telemetry = getAgentTelemetryConfig(functionId, args, feature);
    const fastToolTelemetry = args.toolCallModel
        ? getAgentTelemetryConfig(
              `${functionId}.fastToolStep`,
              {
                  ...args,
                  model: args.toolCallModel.model,
                  keyManagement: args.toolCallModel.keyManagement,
              },
              'agent',
          )
        : null;
    let isFirstStep = true;

    const record = async (step: {
        usage: LanguageModelUsage;
        toolCalls?: ReadonlyArray<{ toolName: string }>;
    }) => {
        const tokens = await recordAgentStepUsage({
            usage: step.usage,
            telemetry:
                fastToolTelemetry &&
                isFastToolCallStep(
                    args,
                    turnIntent,
                    step,
                    isFirstStep,
                    preloadedMcpToolNames,
                )
                    ? fastToolTelemetry
                    : telemetry,
            execution: args.execution,
        });
        isFirstStep = false;
        return tokens;
    };

    return { record, telemetry };
};

/**
 * Separate from `recordAgentStepUsage`: that reports billing tokens exactly
 * once per model call, this is the latency grain.
 */
const trackAgentStep = (
    args: AiAgentArgs,
    dependencies: AiAgentDependencies,
    timing: StepTiming,
    usage: LanguageModelUsage | undefined,
) => {
    const tokens = usage
        ? languageModelUsageToTokens(usage)
        : {
              inputTokens: null,
              outputTokens: null,
              cacheReadTokens: null,
              cacheWriteTokens: null,
              reasoningTokens: null,
              totalTokens: null,
          };

    dependencies.trackEvent({
        event: 'ai_agent.step_completed',
        userId: args.userId,
        properties: {
            organizationId: args.organizationId,
            projectId: args.agentSettings.projectUuid,
            aiAgentId: args.agentSettings.uuid,
            promptId: args.promptUuid,
            threadId: args.threadUuid,
            stepIndex: timing.stepIndex,
            model: getAiAgentModelName(args.model),
            modelProvider:
                typeof args.model === 'string' ? null : args.model.provider,
            stepOffsetMs: timing.stepOffsetMs,
            stepTotalMs: timing.stepTotalMs,
            inferenceMs: timing.inferenceMs,
            toolWallMs: timing.toolWallMs,
            ttftMs: timing.ttftMs,
            toolCallCount: timing.toolCallCount,
            reasoningChars: timing.reasoningChars,
            ...tokens,
        },
    });
};

export const DEFAULT_AGENT_MAX_STEPS = 40;

export const AGENT_WRAP_UP_STEPS = 5;

export const AGENT_WRAP_UP_INSTRUCTION =
    'You are running out of steps. Stop expanding the scope. Use tools only if essential, then finish with the best answer you can. If you cannot fully complete the request, explain what you found and what prevented completion.';

export const AGENT_FINAL_STEP_INSTRUCTION =
    'This is your final step. Do not call any tools. Respond to the user now with the best answer you can, including any limitations or reasons the request could not be fully completed.';

/**
 * A deep-research worker only ever answers one narrow data question, so it gets
 * field discovery and query execution and nothing else — no content, repo,
 * memory, delegation, or reporting tools.
 */
/**
 * Read-only tools a data-app investigation may use: semantic-layer lookups
 * and queries, saved content reads, and project knowledge. No raw SQL, no
 * writes, no external actions.
 */
export const DATA_APP_INVESTIGATE_TOOL_NAMES: ReadonlySet<string> = new Set([
    'findContent',
    'generateVisualization',
    'getDashboardCharts',
    'getKnowledgeDocumentContent',
    'getMetadata',
    'getProjectInfo',
    'grepFields',
    'listContent',
    'listKnowledgeDocuments',
    'loadProjectContext',
    'readContent',
    'runContentQuery',
    'runSavedChart',
    'searchFieldValues',
    'searchSemanticLayer',
]);

export const DEEP_RESEARCH_WORKER_TOOL_NAMES = new Set([
    'describeWarehouseTable',
    'generateVisualization',
    'getMetadata',
    'grepFields',
    'listWarehouseTables',
    'runSql',
    'searchFieldValues',
    'searchSemanticLayer',
]);

export const DEEP_RESEARCH_COORDINATOR_TOOL_NAMES = new Set([
    'analyzeFieldImpact',
    'describeWarehouseTable',
    'findContent',
    'generateVisualization',
    'getDashboardCharts',
    'getKnowledgeDocumentContent',
    'getMetadata',
    'getProjectInfo',
    'grepFields',
    'listContent',
    'listKnowledgeDocuments',
    'listProjects',
    'listWarehouseTables',
    'loadProjectContext',
    'readContent',
    'readPinnedThread',
    'resolveUrl',
    'runContentQuery',
    'runSavedChart',
    'runSql',
    'searchFieldValues',
    'searchSemanticLayer',
]);

const getTrustedDeepResearchMcpToolNames = (
    args: AiAgentArgs,
    mcpToolSetup: AgentMcpToolSetup,
): Set<string> => {
    const expectedUrl = new URL(
        `/api/v1/mcp/projects/${args.agentSettings.projectUuid}`,
        args.siteUrl,
    );
    const trustedServerUuids = new Set(
        (args.mcpServers ?? [])
            .filter((server) => {
                try {
                    const serverUrl = new URL(server.url);
                    return (
                        serverUrl.origin === expectedUrl.origin &&
                        serverUrl.pathname.replace(/\/$/, '') ===
                            expectedUrl.pathname.replace(/\/$/, '')
                    );
                } catch {
                    return false;
                }
            })
            .map((server) => server.uuid),
    );

    return new Set(
        Object.entries(mcpToolSetup.mcpToolNameToServerUuid)
            .filter(
                ([toolName, serverUuid]) =>
                    trustedServerUuids.has(serverUuid) &&
                    isDeepResearchWarehouseMcpTool(toolName),
            )
            .map(([toolName]) => toolName),
    );
};

const PERSIST_TIMEOUT_MS = 10_000;

/**
 * Decorates updatePrompt with the stream-close contract: awaiting it never
 * throws and never holds the HTTP stream open past PERSIST_TIMEOUT_MS (the
 * write continues in the background on timeout). If persisting a response
 * fails outright, the update degrades to an error marker so a later page load
 * shows a retry card instead of a silently vanished answer.
 */
const makeStreamSafePersist = (
    updatePrompt: AiAgentDependencies['updatePrompt'],
    modelName: string,
) => {
    const report = (error: unknown) => {
        Logger.error('[AiAgent][Persist] Failed to persist prompt', error);
        Sentry.captureException(error, {
            tags: { 'ai.model': modelName },
        });
    };

    const bounded = async (
        update: Parameters<AiAgentDependencies['updatePrompt']>[0],
    ): Promise<'persisted' | 'timeout' | 'failed'> => {
        let timer: NodeJS.Timeout | undefined;
        try {
            const persist = updatePrompt(update);
            const outcome = await Promise.race([
                persist.then(() => 'persisted' as const),
                new Promise<'timeout'>((resolve) => {
                    timer = setTimeout(
                        () => resolve('timeout'),
                        PERSIST_TIMEOUT_MS,
                    );
                }),
            ]);
            if (outcome === 'timeout') {
                Logger.warn(
                    `[AiAgent][Persist] Persist exceeded ${PERSIST_TIMEOUT_MS}ms, continuing in background`,
                );
                persist.catch(report);
            }
            return outcome;
        } catch (error) {
            report(error);
            return 'failed';
        } finally {
            clearTimeout(timer);
        }
    };

    return async (
        update: Parameters<AiAgentDependencies['updatePrompt']>[0],
    ): Promise<void> => {
        const outcome = await bounded(update);
        if (outcome === 'failed' && update.response !== undefined) {
            await bounded({
                promptUuid: update.promptUuid,
                errorMessage:
                    'Something went wrong while saving the response. Please try again.',
            });
        }
    };
};

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

/**
 * Zero-LLM discovery seed: deterministically grep the catalog for the latest
 * user question's keywords and append the candidate fields to that message, so
 * the agent often has the right fields on its first turn and can skip the
 * discovery round-trip. Advisory only — the agent still verifies and can grep
 * for itself. Appended to the (uncached) user message, never the system prompt.
 */
const withPreGrepCandidates = (
    messageHistory: ModelMessage[],
    availableExplores: Explore[],
    verifiedFieldUsage: Map<string, number>,
    preparedSeed?: string,
): ModelMessage[] => {
    const lastUserIndex = messageHistory.findLastIndex(
        (m) => m.role === 'user',
    );
    if (lastUserIndex === -1) return messageHistory;
    const lastUser = messageHistory[lastUserIndex];
    if (lastUser.role !== 'user') return messageHistory;
    const userText =
        typeof lastUser.content === 'string'
            ? lastUser.content
            : lastUser.content
                  .map((part) => (part.type === 'text' ? part.text : ''))
                  .join(' ');
    let candidateBlock = preparedSeed;
    if (candidateBlock === undefined) {
        const keywords = extractKeywords(userText);
        if (keywords.length === 0) return messageHistory;
        const candidates = selectCandidateFields(
            getCachedFieldIndex(availableExplores, verifiedFieldUsage),
            keywords,
        );
        if (candidates.length === 0) return messageHistory;
        candidateBlock = renderCandidateBlock(candidates);
    }
    if (!candidateBlock) return messageHistory;
    const seed = `\n\n${candidateBlock}`;
    const updatedContent =
        typeof lastUser.content === 'string'
            ? `${lastUser.content}${seed}`
            : [...lastUser.content, { type: 'text' as const, text: seed }];
    return [
        ...messageHistory.slice(0, lastUserIndex),
        { ...lastUser, content: updatedContent } as ModelMessage,
        ...messageHistory.slice(lastUserIndex + 1),
    ];
};

const QUERY_TOOL_NAMES = new Set([
    'runQuery',
    'generateVisualization',
    'runMetricQuery',
    'runSavedChart',
    'runContentQuery',
]);

const FIELD_ID_KEYS = new Set([
    'fieldId',
    'xAxisDimension',
    'yAxisMetrics',
    'secondaryYAxisMetric',
    'metrics',
    'dimensions',
]);

export const getRecentQueryFieldIds = (
    messageHistory: ModelMessage[],
): string[] => {
    const latestUserIndex = messageHistory.findLastIndex(
        (message) => message.role === 'user',
    );
    const found = new Set<string>();
    const collect = (value: unknown, parentKey?: string) => {
        if (typeof value === 'string') {
            if (parentKey && FIELD_ID_KEYS.has(parentKey)) found.add(value);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach((entry) => collect(entry, parentKey));
            return;
        }
        if (!value || typeof value !== 'object') return;
        Object.entries(value).forEach(([key, entry]) => collect(entry, key));
    };

    const successfulCallIds = new Set<string>();
    for (let index = latestUserIndex - 1; index >= 0; index -= 1) {
        const message = messageHistory[index];
        if (message.role === 'user') break;
        if (message.role === 'tool') {
            for (const part of message.content) {
                if (
                    part.type === 'tool-result' &&
                    part.output.type === 'json' &&
                    part.output.value &&
                    typeof part.output.value === 'object' &&
                    'status' in part.output.value &&
                    part.output.value.status === 'success'
                ) {
                    successfulCallIds.add(part.toolCallId);
                }
            }
        }
        if (
            message.role === 'assistant' &&
            typeof message.content !== 'string'
        ) {
            const call = message.content.findLast(
                (part): part is ToolCallPart =>
                    part.type === 'tool-call' &&
                    QUERY_TOOL_NAMES.has(part.toolName),
            );
            if (call) {
                if (!successfulCallIds.has(call.toolCallId)) return [];
                collect(call.input);
                return [...found].slice(0, 12);
            }
        }
    }
    return [...found].slice(0, 12);
};

export const getCandidateSearchTerms = (
    query: string,
    recentQueryFields: string[],
): string[] =>
    [...new Set([...extractKeywords(query), ...recentQueryFields])].slice(
        0,
        12,
    );

const getChartMutationFieldIds = (args: AiAgentArgs): string[] => {
    const config = args.chartMutationContext?.config;
    if (!config) return [];
    return [
        ...config.queryConfig.dimensions,
        ...config.queryConfig.metrics,
        ...config.queryConfig.sorts.map(({ fieldId }) => fieldId),
    ].filter((fieldId, index, fields) => fields.indexOf(fieldId) === index);
};

const prepareCandidateSeed = async (
    args: AiAgentArgs,
    explores: Explore[],
    verifiedFieldUsage: Map<string, number>,
    projectParameterDefinitions: ParameterDefinitions,
): Promise<string | undefined> => {
    if (!args.decisions || args.execution.mode !== 'standard') return undefined;
    const query = getAgentQuestion(args);
    const recentQueryFields = getRecentQueryFieldIds(args.messageHistory);
    const carriedFields = recentQueryFields.length
        ? recentQueryFields
        : getChartMutationFieldIds(args);
    const candidates = selectCandidateFields(
        getCachedFieldIndex(explores, verifiedFieldUsage),
        getCandidateSearchTerms(query, carriedFields),
    );
    const ranked = await rankCatalog({
        decisions: args.decisions,
        query,
        conversation: getAgentDecisionContext(args),
        fields: candidates,
        explores,
    });
    if (
        !ranked.ranked &&
        ranked.ambiguous !== true &&
        ranked.timeAmbiguous !== true &&
        recentQueryFields.length === 0
    )
        return undefined;
    const metadata = prepareCatalogMetadata(
        ranked.fields,
        ranked.explores,
        projectParameterDefinitions,
        ranked.fieldRanks,
        ranked.exploreRanks,
    );
    let carriedFieldContext: string | null = null;
    if (args.chartMutationContext) {
        carriedFieldContext = `The active chart below is authoritative. Mutate its query and visualization, preserving everything the user did not ask to change. A response claiming a change is only valid after generateVisualization succeeds.\n${JSON.stringify(args.chartMutationContext.config)}`;
    } else if (carriedFields.length > 0) {
        carriedFieldContext = `The preceding successful query already established these field IDs: ${recentQueryFields.join(', ')}. For a follow-up, reuse its tool input and preserve its measure, filters and scope. Change only the requested grain or presentation; skip field discovery when the candidates below cover it.`;
    }
    return [
        carriedFieldContext,
        ranked.exploresRanked
            ? `Relevant explores, ordered by entity and grain fit: ${ranked.explores
                  .slice(0, 5)
                  .map(
                      (explore) =>
                          `${explore.name} (base: ${explore.baseTable})`,
                  )
                  .join(
                      ', ',
                  )}. Check the preloaded metadata or getMetadata for joins and required filters.`
            : null,
        ranked.fields.length > 0
            ? renderCandidateBlock(
                  ranked.fields,
                  ranked.exploreRanks ?? undefined,
                  ranked.ranked,
                  metadata !== null,
              )
            : null,
        metadata,
        ranked.ambiguous ? CATALOG_AMBIGUITY_GUIDANCE : null,
        ranked.timeAmbiguous ? CATALOG_TIME_AMBIGUITY_GUIDANCE : null,
    ]
        .filter(Boolean)
        .join('\n');
};

export type AgentMcpToolSetup = {
    tools: ToolSet;
    mcpToolNameToServerUuid: Record<string, string>;
    unavailableMcpServers: UnavailableMcpServer[];
    closeMcpClients: () => Promise<void>;
};

export const buildDeepResearchExecutionContextSnapshot = (
    args: AiAgentArgs,
    tools: ToolSet,
    mcpToolSetup: AgentMcpToolSetup,
): AiDeepResearchExecutionContextSnapshot => ({
    schemaVersion: 1,
    resolutionStage: 'execution',
    capturedAt: new Date().toISOString(),
    agent: {
        uuid: args.agentSettings.uuid,
        name: args.agentSettings.name,
        version: args.agentSettings.version,
        updatedAt: args.agentSettings.updatedAt.toISOString(),
        hasInstruction: Boolean(args.agentSettings.instruction),
        tags: args.agentSettings.tags,
        spaceAccess: args.agentSettings.spaceAccess,
        enableDataAccess: args.agentSettings.enableDataAccess,
        enableSelfImprovement: args.agentSettings.enableSelfImprovement,
        enableContentTools: args.agentSettings.enableContentTools,
        enableUserContext: args.agentSettings.enableUserContext,
    },
    model: {
        provider: args.model.provider,
        modelName: getAiAgentModelName(args.model),
        reasoningEnabled: args.modelReasoningEnabled,
        keyManagement: args.keyManagement,
    },
    tools: {
        availableToolNames: Object.keys(tools).sort(),
        attachedMcpServers: args.mcpServers.map((server) => ({
            uuid: server.uuid,
            name: server.name,
            enabledToolNames: Object.entries(
                mcpToolSetup.mcpToolNameToServerUuid,
            )
                .filter(
                    ([toolName, serverUuid]) =>
                        toolName in tools && serverUuid === server.uuid,
                )
                .map(([toolName]) => toolName)
                .sort(),
        })),
    },
    knowledgeDocuments: args.knowledgeDocuments.map((document) => ({
        uuid: document.uuid,
        name: document.name,
        updatedAt: document.updatedAt.toISOString(),
        alwaysIncludeInContext: document.alwaysIncludeInContext,
    })),
    repository: {
        projectContextEnabled: args.projectContextEnabled,
        aiWritebackEnabled: args.enableAiWriteback,
        codingAgentEnabled: args.enableCodingAgent,
        previewDeploySetupEnabled: args.enablePreviewDeploySetup,
        repoDiscoveryEnabled: args.enableRepoDiscovery,
        repoFsRoot: args.repoFsRoot,
        repoFsSupportsCodeSearch: args.repoFsSupportsCodeSearch,
        availableSkillNames: args.availableSkills
            .map((skill) => skill.name)
            .sort(),
    },
    effectivePermissions: {
        canManageAgent: args.canManageAgent,
        canRunSql:
            args.execution.mode === 'deep_research'
                ? args.execution.canUseRawSql
                : args.canRunSql,
        canUseDataTools: args.enableDataAccess,
        canUseContentTools: args.enableDataAccess && args.enableContentTools,
        canUseSelfImprovementTools: args.canManageAgent,
        autoApproveSql: args.autoApproveSql,
    },
});

const persistDeepResearchExecutionContext = async (
    args: AiAgentArgs,
    tools: ToolSet,
    mcpToolSetup: AgentMcpToolSetup,
): Promise<void> => {
    if (args.execution.mode !== 'deep_research') {
        return;
    }
    await args.execution.onExecutionContextResolved?.(
        buildDeepResearchExecutionContextSnapshot(args, tools, mcpToolSetup),
    );
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

const isQueryCacheHit = (output: unknown): boolean =>
    !!output &&
    typeof output === 'object' &&
    'metadata' in output &&
    !!output.metadata &&
    typeof output.metadata === 'object' &&
    'queryCacheHit' in output.metadata &&
    output.metadata.queryCacheHit === true;

const isQueryReuseHit = (output: unknown): boolean =>
    !!output &&
    typeof output === 'object' &&
    'metadata' in output &&
    !!output.metadata &&
    typeof output.metadata === 'object' &&
    'queryReuseHit' in output.metadata &&
    output.metadata.queryReuseHit === true;

const trackFailedToolResult = (
    dependencies: Pick<AiAgentDependencies, 'trackEvent'>,
    args: AiAgentArgs,
    toolName: string,
    output: unknown,
) => {
    if (!isErrorToolResult(output)) return;
    dependencies.trackEvent({
        event: 'ai_agent_tool_call_failed',
        userId: args.userId,
        properties: {
            organizationId: args.organizationId,
            projectId: args.agentSettings.projectUuid,
            aiAgentId: args.agentSettings.uuid,
            agentName: args.agentSettings.name,
            toolName,
            threadId: args.threadUuid,
            promptId: args.promptUuid,
        },
    });
};

const getMcpToolResultErrorText = (output: unknown): string | null => {
    if (!output || typeof output !== 'object' || !('isError' in output)) {
        return null;
    }
    if (output.isError !== true) {
        return null;
    }
    const content = 'content' in output ? output.content : undefined;
    // hardenMcpOutput prepends the untrusted-output notice as the first item
    const text = Array.isArray(content)
        ? content.find(
              (item) =>
                  item?.type === 'text' &&
                  item.text !== MCP_UNTRUSTED_OUTPUT_NOTICE,
          )?.text
        : undefined;
    return typeof text === 'string' ? text.slice(0, 500) : 'MCP tool error';
};

// Mirrors McpService.recordToolCall for the opposite direction: a Lightdash
// agent calling a connected external MCP server
const recordExternalMcpToolCall = (
    dependencies: Pick<AiAgentDependencies, 'recordMcpToolCall'>,
    mcpToolSetup: AgentMcpToolSetup,
    event: OnToolCallFinishEvent,
) => {
    const mcpServerUuid =
        mcpToolSetup.mcpToolNameToServerUuid[event.toolCall.toolName];
    if (!mcpServerUuid) {
        return;
    }
    const errorMessage =
        event.toolOutput.type === 'tool-result'
            ? getMcpToolResultErrorText(event.toolOutput.output)
            : getErrorMessage(event.toolOutput.error);
    void dependencies
        .recordMcpToolCall({
            toolCallId: event.toolCall.toolCallId,
            toolName: event.toolCall.toolName,
            toolArgs: (event.toolCall.input ?? {}) as object,
            mcpServerUuid,
            status: errorMessage === null ? 'success' : 'error',
            errorMessage,
            // The SDK measures with performance.now(); the column is integer ms
            durationMs: Math.round(event.toolExecutionMs),
        })
        .catch((error) => {
            Logger.warn(
                `[AiAgent][MCP] Failed to record external MCP tool call: ${getErrorMessage(
                    error,
                )}`,
            );
        });
};

type FastChartStep = {
    toolCalls: ReadonlyArray<{
        toolCallId: string;
        toolName: string;
        input: unknown;
    }>;
    toolResults: ReadonlyArray<{
        toolCallId: string;
        toolName: string;
        output: unknown;
    }>;
};

export const getChartFollowupFastResponse = (
    steps: ReadonlyArray<FastChartStep>,
): string | null => {
    const successfulCallIds = new Set(
        steps.flatMap((step) =>
            step.toolResults
                .filter(
                    (result) =>
                        result.toolName === 'generateVisualization' &&
                        !isErrorToolResult(result.output) &&
                        result.output !== null &&
                        typeof result.output === 'object' &&
                        'metadata' in result.output &&
                        result.output.metadata !== null &&
                        typeof result.output.metadata === 'object' &&
                        'artifactVersionUuid' in result.output.metadata &&
                        typeof result.output.metadata.artifactVersionUuid ===
                            'string',
                )
                .map((result) => result.toolCallId),
        ),
    );
    const call = steps
        .flatMap((step) => step.toolCalls)
        .findLast(
            (candidate) =>
                candidate.toolName === 'generateVisualization' &&
                successfulCallIds.has(candidate.toolCallId),
        );
    if (!call) return null;
    const title =
        call.input &&
        typeof call.input === 'object' &&
        'title' in call.input &&
        typeof call.input.title === 'string'
            ? call.input.title.trim()
            : '';
    return title
        ? `Created **${title}** using the preceding query's measure, filters and scope.`
        : "Created the requested chart using the preceding query's measure, filters and scope.";
};

export const getChartExportFastResponse = (
    steps: ReadonlyArray<FastChartStep>,
): string | null => {
    const output = steps
        .flatMap((step) => step.toolResults)
        .findLast(
            (result) =>
                result.toolName === 'exportChartAsCode' &&
                !isErrorToolResult(result.output),
        )?.output;
    if (!output || typeof output !== 'object' || !('metadata' in output))
        return null;
    const { metadata } = output;
    if (!metadata || typeof metadata !== 'object') return null;
    if (
        !('deliveryToken' in metadata) ||
        typeof metadata.deliveryToken !== 'string'
    )
        return null;
    return metadata.deliveryToken.trim() || null;
};

export const getDataAppBuildFastResponse = (
    steps: ReadonlyArray<FastChartStep>,
): string | null => {
    const output = steps
        .flatMap((step) => step.toolResults)
        .findLast(
            (result) =>
                (result.toolName === 'generateDataApp' ||
                    result.toolName === 'iterateDataApp') &&
                !isErrorToolResult(result.output),
        )?.output;
    if (!output || typeof output !== 'object' || !('metadata' in output))
        return null;
    const { metadata } = output;
    if (
        !metadata ||
        typeof metadata !== 'object' ||
        !('status' in metadata) ||
        metadata.status !== 'pending'
    )
        return null;
    return 'Started the data app build. It will take a few minutes.';
};

export const getDataAnswerFastResponse = (
    steps: ReadonlyArray<FastChartStep>,
): string | null => {
    const results = steps.flatMap((step) => step.toolResults);
    if (results.some((result) => isErrorToolResult(result.output))) return null;

    const queryResults = results.filter(
        (result) => result.toolName === 'runQuery',
    );
    if (queryResults.length !== 1) return null;
    const [{ output }] = queryResults;
    if (!output || typeof output !== 'object' || !('metadata' in output))
        return null;
    const { metadata } = output;
    if (!metadata || typeof metadata !== 'object') return null;
    if (
        !('status' in metadata) ||
        metadata.status !== 'success' ||
        !('fastResponse' in metadata) ||
        typeof metadata.fastResponse !== 'string'
    )
        return null;
    return metadata.fastResponse.trim() || null;
};

const getTurnFastResponse = (
    enableDataAnswerFastResponse: boolean,
    turnIntent: TurnIntent | null | undefined,
    steps: ReadonlyArray<FastChartStep>,
) => {
    if (enableDataAnswerFastResponse && turnIntent === 'data_answer')
        return getDataAnswerFastResponse(steps);
    if (turnIntent === 'chart_from_previous')
        return getChartFollowupFastResponse(steps);
    if (turnIntent === 'chart_export') return getChartExportFastResponse(steps);
    if (turnIntent === 'data_app_create' || turnIntent === 'data_app_iterate')
        return getDataAppBuildFastResponse(steps);
    return null;
};

// Raw args of an invalid tool call: may be a parsed object or, when JSON
// parsing itself failed, the raw string the model produced.
const serializeRawToolArgs = (input: unknown): string | null => {
    if (input === undefined) return null;
    if (typeof input === 'string') return input;
    try {
        return JSON.stringify(input) ?? null;
    } catch {
        return String(input);
    }
};

export const storeInvalidAgentToolCall = async ({
    storeToolCallError,
    promptUuid,
    toolCall,
    executionMode,
}: {
    storeToolCallError: AiAgentDependencies['storeToolCallError'];
    promptUuid: string;
    toolCall: {
        toolCallId: string;
        toolName: string;
        input: unknown;
        error?: unknown;
    };
    executionMode: AiAgentArgs['execution']['mode'];
}) => {
    const storeError = storeToolCallError({
        promptUuid,
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        errorMessage:
            toolCall.error instanceof Error
                ? toolCall.error.message
                : String(toolCall.error),
        rawArgs: serializeRawToolArgs(toolCall.input),
    });
    if (executionMode === 'deep_research') {
        await storeError;
    } else {
        void storeError.catch((error) => {
            Logger.error(
                '[AiAgent][On Step Finish] Failed to store invalid tool call',
                error,
            );
        });
    }
};

const QUERY_RETRY_CAP_TOOL_NAME = '__query_retry_cap';

export type AgentStreamTextResult = StreamTextResult<
    ToolSet,
    Record<string, unknown>,
    Output.Output
>;

// AI SDK 7 forwards every stream part to onChunk; keep the v6 subset so
// first-chunk timing and persistence semantics are unchanged.
const CONTENT_STREAM_CHUNK_TYPES = new Set<TextStreamPart<ToolSet>['type']>([
    'text-delta',
    'reasoning-delta',
    'source',
    'tool-call',
    'tool-input-start',
    'tool-input-delta',
    'tool-result',
    'raw',
]);
type ContentStreamChunk = Extract<
    TextStreamPart<ToolSet>,
    {
        type:
            | 'text-delta'
            | 'reasoning-delta'
            | 'source'
            | 'tool-call'
            | 'tool-input-start'
            | 'tool-input-delta'
            | 'tool-result'
            | 'raw';
    }
>;
const isContentStreamChunk = (
    chunk: TextStreamPart<ToolSet>,
): chunk is ContentStreamChunk => CONTENT_STREAM_CHUNK_TYPES.has(chunk.type);

export const defaultAgentOptions = {
    toolChoice: 'auto' as const,
    stopWhen: stepCountIs(DEFAULT_AGENT_MAX_STEPS),
    maxRetries: 6, // Increased for Bedrock rate limits
};

const buildStopWhenPromptInterrupted =
    (
        args: AiAgentArgs,
        dependencies: AiAgentDependencies,
        logger: ReturnType<typeof createAiAgentLogger>,
    ) =>
    async () => {
        const interrupted = await dependencies.isPromptInterrupted(
            args.promptUuid,
        );
        if (interrupted) {
            logger(
                'Stop When',
                `Stopping generation for interrupted prompt UUID: ${args.promptUuid}`,
            );
        }
        return interrupted;
    };

/**
 * When forceToolHints is set, force the first hinted tool on the opening step
 * (toolChoice) and release to auto afterwards. Used by the review Build-fix run
 * to guarantee the agent opens a PR via editDbtProject rather than just
 * discussing the fix. No-op if the forced tool isn't in the registered set.
 */
export const buildForcedFirstStep = (args: AiAgentArgs, tools: ToolSet) => {
    if (
        args.execution?.mode === 'deep_research' &&
        args.execution.research?.role === 'worker'
    ) {
        return undefined;
    }
    if (!args.forceToolHints) return undefined;
    const forcedTool = args.toolHints[0];
    if (!forcedTool || !(forcedTool in tools)) return undefined;
    return ({ stepNumber }: { stepNumber: number }) =>
        stepNumber === 0
            ? { toolChoice: { type: 'tool' as const, toolName: forcedTool } }
            : {};
};

export const getStepBudgetOverride = (
    execution: AiAgentArgs['execution'],
    stepNumber: number,
) => {
    if (
        execution.mode === 'deep_research' &&
        execution.research?.role === 'worker'
    ) {
        if (stepNumber < Math.max(0, execution.maxSteps - 1)) {
            return undefined;
        }
        return {
            message: `This is your final step. Submit the best findings packet available now with ${AI_DEEP_RESEARCH_WORKER_FINDINGS_TOOL_NAME}, even if the evidence is incomplete or inconclusive. Do not run another query.`,
            activeTools: [AI_DEEP_RESEARCH_WORKER_FINDINGS_TOOL_NAME],
            toolChoice: {
                type: 'tool' as const,
                toolName: AI_DEEP_RESEARCH_WORKER_FINDINGS_TOOL_NAME,
            },
        };
    }

    if (
        execution.mode !== 'standard' ||
        stepNumber < Math.max(0, execution.maxSteps - AGENT_WRAP_UP_STEPS)
    ) {
        return undefined;
    }

    if (stepNumber >= execution.maxSteps - 1) {
        return {
            message: AGENT_FINAL_STEP_INSTRUCTION,
            activeTools: [] as string[],
            toolChoice: 'none' as const,
        };
    }

    return { message: AGENT_WRAP_UP_INSTRUCTION };
};

export const buildPrepareStep = ({
    args,
    dependencies,
    tools,
    mcpToolNames,
    preloadedMcpToolNames,
    intentToolGate,
    logger,
    invalidToolCallIds,
    agentContext,
}: {
    args: AiAgentArgs;
    dependencies: AiAgentDependencies;
    tools: ToolSet;
    mcpToolNames: string[];
    preloadedMcpToolNames?: string[];
    intentToolGate?: IntentToolGate;
    logger: ReturnType<typeof createAiAgentLogger>;
    // Ids of tool calls the AI SDK dropped for invalid input, recorded by
    // onStepFinish/onChunk as the turn progresses (shared mutable set).
    invalidToolCallIds: ReadonlySet<string>;
    agentContext?: AgentContext;
}) => {
    const forcedFirstStep = buildForcedFirstStep(args, tools);
    const retryMarkersPersisted = new Set<string>();
    const checkedErrors = new Map<string, string | null>();
    const retryMarkerScope =
        args.execution.mode === 'deep_research'
            ? (args.execution.parentToolCallId ??
              `deep-research:${args.execution.runUuid}:coordinator`)
            : args.promptUuid;

    return async ({
        stepNumber,
        messages,
    }: {
        stepNumber: number;
        messages: ModelMessage[];
    }) => {
        if (stepNumber > 0) agentContext?.clearPreviousQuery();
        const explicitlyForced = forcedFirstStep?.({ stepNumber }) ?? {};
        const intentForcedTool = getFastIntentTool(
            intentToolGate?.intent === 'chart_from_previous' &&
                getRecentQueryFieldIds(args.messageHistory).length === 0 &&
                !args.chartMutationContext
                ? null
                : intentToolGate?.intent,
            preloadedMcpToolNames,
        );
        let forced =
            !explicitlyForced.toolChoice &&
            stepNumber === 0 &&
            intentForcedTool !== null &&
            intentForcedTool in tools
                ? {
                      activeTools: [intentForcedTool],
                      toolChoice: {
                          type: 'tool' as const,
                          toolName: intentForcedTool,
                      },
                      ...(args.toolCallModel
                          ? {
                                model: args.toolCallModel.model,
                                providerOptions:
                                    args.toolCallModel.providerOptions,
                            }
                          : {}),
                  }
                : explicitlyForced;
        const stepBudgetOverride = getStepBudgetOverride(
            args.execution,
            stepNumber,
        );

        const extraMessages: ModelMessage[] = [];
        let activeTools = getMcpActiveTools(
            messages,
            Object.keys(tools),
            mcpToolNames,
            preloadedMcpToolNames,
        );

        // ZAP-574: bound repeated query-tool failures so a slow/looping
        // visualization can't stack multi-minute warehouse scans in one turn.
        const semanticErrorRouting =
            args.execution.mode === 'standard' ? args.decisions : undefined;
        const retryOverride =
            (semanticErrorRouting
                ? await queryErrorOverride({
                      decisions: semanticErrorRouting,
                      messages,
                      checked: checkedErrors,
                      allToolNames: Object.keys(tools),
                      invalidToolCallIds,
                  })
                : null) ??
            buildQueryRetryStepOverride(
                messages,
                Object.keys(tools),
                invalidToolCallIds,
                args.execution.mode,
                !!semanticErrorRouting,
            );
        if (retryOverride) {
            activeTools = activeTools
                ? activeTools.filter((name) =>
                      retryOverride.activeTools.includes(name),
                  )
                : retryOverride.activeTools;
            extraMessages.push({
                role: 'user' as const,
                content: retryOverride.nudge,
            });
            logger(
                'Prepare Step',
                `Query retry cap tripped for prompt UUID: ${args.promptUuid}`,
            );
            // Persist each distinct recovery/cap state once so the original
            // failure, chosen retry round, and terminal outcome are traceable.
            if (!retryMarkersPersisted.has(retryOverride.markerKey)) {
                retryMarkersPersisted.add(retryOverride.markerKey);
                void dependencies
                    .storeToolCallError({
                        promptUuid: args.promptUuid,
                        toolCallId: `${QUERY_RETRY_CAP_TOOL_NAME}-${retryOverride.markerKey}-${retryMarkerScope}`,
                        toolName: QUERY_RETRY_CAP_TOOL_NAME,
                        errorMessage: retryOverride.nudge,
                        rawArgs: null,
                    })
                    .catch((error) => {
                        Logger.error(
                            '[AiAgent][Prepare Step] Failed to store query retry cap marker',
                            error,
                        );
                    });
            }
        }

        const isDeepResearchWorker =
            args.execution.mode === 'deep_research' &&
            args.execution.research?.role === 'worker';
        const steers = isDeepResearchWorker
            ? []
            : await dependencies.consumePromptSteers({
                  promptUuid: args.promptUuid,
                  stepNumber,
              });
        if (steers.length > 0) {
            agentContext?.clearPreviousQuery();
            if (args.decisions && !explicitlyForced.toolChoice)
                forced = explicitlyForced;
            intentToolGate?.restore();
            logger(
                'Prepare Step',
                `Injecting ${steers.length} steer(s) for prompt UUID: ${args.promptUuid}`,
            );
            extraMessages.push({
                role: 'user' as const,
                content: [
                    'Additional guidance from the user while you were working:',
                    ...steers.map((steer) => `- ${steer.message}`),
                ].join('\n'),
            });
        }

        if (stepBudgetOverride) {
            extraMessages.push({
                role: 'user',
                content: stepBudgetOverride.message,
            });
        }

        const intentTools =
            args.execution.mode === 'standard' && !forced.toolChoice
                ? intentToolGate?.activeTools()
                : undefined;
        if (intentTools) {
            const allowedByIntent = new Set([
                ...intentTools,
                ...(preloadedMcpToolNames ?? []),
            ]);
            activeTools = (activeTools ?? Object.keys(tools)).filter((name) =>
                allowedByIntent.has(name),
            );
        }

        const stepMessages =
            args.decisions &&
            stepNumber === 0 &&
            intentToolGate?.intent === 'chart_from_previous' &&
            forced.toolChoice &&
            steers.length === 0
                ? compactChartDiscovery(messages)
                : messages;
        if (
            stepMessages === messages &&
            extraMessages.length === 0 &&
            activeTools === undefined &&
            stepBudgetOverride === undefined
        ) {
            return forced;
        }

        const stepActiveTools = stepBudgetOverride?.activeTools ?? activeTools;

        return {
            ...forced,
            ...(stepActiveTools !== undefined
                ? { activeTools: stepActiveTools }
                : {}),
            ...(stepBudgetOverride?.toolChoice !== undefined
                ? { toolChoice: stepBudgetOverride.toolChoice }
                : {}),
            messages: [...stepMessages, ...extraMessages],
        };
    };
};

export const getAgentTools = (
    args: AiAgentArgs,
    dependencies: AiAgentDependencies,
    availableExplores: Explore[],
    mcpToolSetup: AgentMcpToolSetup,
    verifiedFieldUsage: Map<string, number>,
    projectParameterDefinitions: ParameterDefinitions,
    customChartTypeLibrary: CustomChartTypeLibrary,
    agentContext: AgentContext,
): ToolSet => {
    const queryDependencies = withAnswerEvidence(
        dependencies,
        agentContext.answerEvidence,
        args.maxContextRows,
    );
    const logger = createAiAgentLogger(args.debugLoggingEnabled);
    logger(
        'Agent Tools',
        `Getting agent tools for agent: ${args.agentSettings.name}`,
    );

    const enableContentTools = args.enableDataAccess && args.enableContentTools;
    const documentsEnabled = enableContentTools && args.enableDocuments;
    const decisionContext =
        args.decisions && args.execution.mode === 'standard'
            ? getAgentDecisionContext(args)
            : undefined;
    const reviewQuery =
        args.decisions &&
        args.enableDataAccess &&
        args.execution.mode === 'standard'
            ? createQueryReviewer({
                  decisions: args.decisions,
                  question: getAgentQuestion(args),
                  conversation: decisionContext,
                  explores: availableExplores,
              })
            : undefined;

    const grepFields = getGrepFields({
        availableExplores,
        decisions:
            args.execution.mode === 'standard' ? args.decisions : undefined,
        userQuestion: getAgentQuestion(args),
        conversation: decisionContext,
        projectParameterDefinitions,
        findExplores: dependencies.findExplores,
        verifiedFieldUsage,
    });

    // Companion to grepFields: rich detail for the explores/fields the agent
    // selected (joined tables, required filters, filter types, hints).
    const getMetadata = getGetMetadata({
        includeSourceDetails: !!args.decisions,
        availableExplores,
        projectParameterDefinitions,
    });

    const findContent = getFindContent({
        decisions: args.decisions,
        findContent: dependencies.findContent,
        siteUrl: args.siteUrl,
        toolDescriptionMaxChars: args.toolDescriptionMaxChars,
        dashboardDetailsToolName: enableContentTools
            ? 'readContent'
            : 'getDashboardCharts',
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
                    ...coverage,
                },
            });
        },
    });

    const listContent = getListContent({
        listContent: dependencies.listContent,
    });

    // Only offered when the project has a custom chart type library — an
    // empty library keeps zero prompt and tool overhead.
    const findCustomChartTypes =
        customChartTypeLibrary.totalCount > 0
            ? getFindCustomChartTypes({
                  findCustomChartTypes: dependencies.findCustomChartTypes,
                  updateProgress: dependencies.updateProgress,
              })
            : null;

    const getDashboardCharts = getGetDashboardCharts({
        getDashboardCharts: dependencies.getDashboardCharts,
        siteUrl: args.siteUrl,
        pageSize: args.getDashboardChartsPageSize,
    });

    const readContent = getReadContent({
        readContent: dependencies.readContent,
        documentsEnabled,
    });

    const resolveUrl = getResolveUrl({
        resolveUrl: dependencies.resolveUrl,
    });

    const generateVisualization = getRunQuery({
        purpose: 'visualization',
        agentContext,
        decisions: args.decisions,
        question: getAgentQuestion(args),
        conversation: decisionContext,
        presentationInstructions: args.agentSettings.instruction,
        allowPresentationCorrection:
            args.messageHistory.filter((message) => message.role === 'user')
                .length <= 1,
        searchFieldValues: dependencies.searchFieldValues,
        updateProgress: dependencies.updateProgress,
        runAsyncQuery: queryDependencies.runAsyncQuery,
        runAsyncMergeQuery: queryDependencies.runAsyncMergeQuery,
        getPrompt: dependencies.getPrompt,
        sendFile: dependencies.sendFile,
        deferSlackVisualization:
            args.decisions && args.execution.mode === 'standard'
                ? dependencies.deferSlackVisualization
                : undefined,
        createOrUpdateArtifact: dependencies.createOrUpdateArtifact,
        maxLimit: args.maxQueryLimit,
        maxContextRows: args.maxContextRows,
        exposeQueryUuid: args.execution.mode === 'deep_research',
        enableChartExport:
            !!args.decisions && args.execution.mode === 'standard',
        enableDataAccess: args.enableDataAccess,
        projectParameterDefinitions,
        slackLinksOnly: args.slackLinksOnly,
        enableMergeQueries: args.enableMergeQueries,
        enableFilterExpressions: args.enableFilterExpressions,
        resolveCustomChartType: dependencies.resolveCustomChartType,
        exportCustomChartTypeImage: dependencies.exportCustomChartTypeImage,
    });

    const runQuery =
        args.decisions &&
        args.enableDataAccess &&
        args.execution.mode === 'standard'
            ? getRunQuery({
                  purpose: 'answer',
                  enableFastResponse: args.enableDataAnswerFastResponse,
                  agentContext,
                  decisions: args.decisions,
                  question: getAgentQuestion(args),
                  conversation: decisionContext,
                  presentationInstructions: args.agentSettings.instruction,
                  allowPresentationCorrection: false,
                  searchFieldValues: dependencies.searchFieldValues,
                  updateProgress: dependencies.updateProgress,
                  runAsyncQuery: queryDependencies.runAsyncQuery,
                  runAsyncMergeQuery: queryDependencies.runAsyncMergeQuery,
                  getPrompt: dependencies.getPrompt,
                  sendFile: dependencies.sendFile,
                  createOrUpdateArtifact: dependencies.createOrUpdateArtifact,
                  maxLimit: args.maxQueryLimit,
                  maxContextRows: args.maxContextRows,
                  exposeQueryUuid: false,
                  enableChartExport: false,
                  enableDataAccess: true,
                  projectParameterDefinitions,
                  slackLinksOnly: args.slackLinksOnly,
                  enableMergeQueries: args.enableMergeQueries,
                  enableFilterExpressions: args.enableFilterExpressions,
                  resolveCustomChartType: dependencies.resolveCustomChartType,
                  exportCustomChartTypeImage:
                      dependencies.exportCustomChartTypeImage,
              })
            : null;

    const runSavedChart = getRunSavedChart({
        reviewQuery,
        updateProgress: dependencies.updateProgress,
        runAsyncQuery: queryDependencies.runAsyncQuery,
        getSavedChart: dependencies.getSavedChart,
        maxLimit: args.maxQueryLimit,
        maxContextRows: args.maxContextRows,
        enableDataAccess: args.enableDataAccess,
    });

    // Composer queries supersede the standalone runSql tool: a single `sql`
    // node is the direct equivalent, and exposing both lets the model shadow
    // the composer path with raw runSql calls.
    const runSql =
        args.canRunSql && !args.enableComposerQueries
            ? getRunSql({
                  reviewQuery,
                  updateProgress: dependencies.updateProgress,
                  runSqlJob: queryDependencies.runSqlJob,
                  getPrompt: dependencies.getPrompt,
                  sendFile: dependencies.sendFile,
                  updateSlackMessage: dependencies.updateSlackMessage,
                  siteUrl: args.siteUrl,
                  waitForSqlApproval: dependencies.waitForSqlApproval,
                  recordSqlApproval: dependencies.recordSqlApproval,
                  isThreadSqlAutoApproved: dependencies.isThreadSqlAutoApproved,
                  storeToolResults: dependencies.storeToolResults,
                  createOrUpdateArtifact: dependencies.createOrUpdateArtifact,
                  maxQueryLimit: args.runSqlMaxLimit,
                  enableDataAccess: args.enableDataAccess,
                  slackLinksOnly: args.slackLinksOnly,
                  sqlScope: args.sqlScope,
                  autoApproveSql: args.autoApproveSql,
                  autoApproveSqlUserUuid: args.autoApproveSqlUserUuid,
                  useSlackStreamCard: args.useSlackStreamCard,
              })
            : null;

    const runComposerQueries = args.enableComposerQueries
        ? getRunComposerQueries({
              reviewQuery,
              updateProgress: dependencies.updateProgress,
              runComposerQueries: queryDependencies.runComposerQueries,
              getPrompt: dependencies.getPrompt,
              waitForSqlApproval: dependencies.waitForSqlApproval,
              recordSqlApproval: dependencies.recordSqlApproval,
              createOrUpdateArtifact: dependencies.createOrUpdateArtifact,
              maxQueryLimit: args.runSqlMaxLimit,
              enableDataAccess: args.enableDataAccess,
              canRunSql: args.canRunSql,
              autoApproveSql: args.autoApproveSql,
              autoApproveSqlUserUuid: args.autoApproveSqlUserUuid,
          })
        : null;

    const listWarehouseTables = args.canRunSql
        ? getListWarehouseTables({
              decisions:
                  args.execution.mode === 'standard'
                      ? args.decisions
                      : undefined,
              userQuestion: getAgentQuestion(args),
              listWarehouseTables: dependencies.listWarehouseTables,
          })
        : null;

    const describeWarehouseTable = args.canRunSql
        ? getDescribeWarehouseTable({
              describeWarehouseTable: dependencies.describeWarehouseTable,
          })
        : null;

    const generateDashboard = args.canCreateDashboards
        ? getGenerateDashboardV2({
              agentContext,
              decisions:
                  args.execution.mode === 'standard'
                      ? args.decisions
                      : undefined,
              userQuestion: getAgentQuestion(args),
              getPrompt: dependencies.getPrompt,
              createOrUpdateArtifact: dependencies.createOrUpdateArtifact,
          })
        : null;

    const editContent = getEditContent({
        editContent: dependencies.editContent,
        documentsEnabled,
    });
    const createContent = getCreateContent({
        createContent: dependencies.createContent,
        documentsEnabled,
    });
    const createScheduledDelivery = getCreateScheduledDelivery({
        createScheduledDelivery: dependencies.createScheduledDelivery,
    });
    const runContentQuery = getRunContentQuery({
        reviewQuery,
        updateProgress: dependencies.updateProgress,
        runAsyncQuery: queryDependencies.runAsyncQuery,
        runSavedChartQuery: queryDependencies.runSavedChartQuery,
        getSavedChart: dependencies.getSavedChart,
        validateContent: dependencies.validateContent,
        maxLimit: args.maxQueryLimit,
        maxContextRows: args.maxContextRows,
        enableDataAccess: args.enableDataAccess,
    });

    const generateDataApp = args.enableGenerateDataApp
        ? getGenerateDataApp({
              generateDataApp: dependencies.generateDataApp,
          })
        : null;

    const iterateDataApp = args.enableGenerateDataApp
        ? getIterateDataApp({
              iterateDataApp: dependencies.iterateDataApp,
          })
        : null;

    const listDataAppThemes = args.enableGenerateDataApp
        ? getListDataAppThemes({
              listDataAppThemes: dependencies.listDataAppThemes,
          })
        : null;

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

    const editRepo = args.enableCodingAgent
        ? getEditRepo({
              editRepo: dependencies.editRepo,
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

    // Workstream tools are shared by the general coding agent (editRepo) and the
    // dbt-writeback agent (editDbtProject) — both can now drive several PRs per
    // thread, so both need to enumerate and close them.
    const listWorkstreams =
        args.enableCodingAgent || args.enableAiWriteback
            ? getListWorkstreams({
                  listWorkstreams: dependencies.listWorkstreams,
              })
            : null;

    const closePullRequest =
        args.enableCodingAgent || args.enableAiWriteback
            ? getClosePullRequest({
                  closePullRequest: dependencies.closePullRequest,
              })
            : null;

    // Read-only companion to the workstream tools: lets the agent inspect a
    // pull request's actual diff before deciding how to split or consolidate
    // changes across pull requests. Same gate as list/close.
    const getPullRequestDiff =
        args.enableCodingAgent || args.enableAiWriteback
            ? getGetPullRequestDiff({
                  getPullRequestDiff: dependencies.getPullRequestDiff,
              })
            : null;

    const searchFieldValues = getSearchFieldValues({
        decisions: args.decisions,
        searchFieldValues: dependencies.searchFieldValues,
        getExplore: dependencies.getExplore,
        enableFilterExpressions: args.enableFilterExpressions,
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

    const loadProjectContext =
        args.projectContextEnabled || args.aiAgentMemoryEnabled
            ? getLoadProjectContext({
                  getDocument: async () => {
                      const [projectContext, memories] = await Promise.all([
                          args.projectContextEnabled
                              ? dependencies.getProjectContextDocument()
                              : Promise.resolve([]),
                          args.aiAgentMemoryEnabled
                              ? dependencies.getAiAgentMemoryContextEntries()
                              : Promise.resolve([]),
                      ]);
                      return getProjectContextSearchEntries({
                          projectContext,
                          memories,
                          memoryEnabled: args.aiAgentMemoryEnabled,
                      });
                  },
                  includeMemories: args.aiAgentMemoryEnabled,
                  onEntriesLoaded: args.aiAgentMemoryEnabled
                      ? dependencies.incrementAiAgentMemoryPulls
                      : undefined,
              })
            : null;

    const mcpTools = Object.fromEntries(
        Object.entries(mcpToolSetup.tools).filter(
            ([toolName]) =>
                args.execution.mode !== 'deep_research' ||
                args.execution.canUseRawSql ||
                !isDeepResearchRawSqlMcpTool(toolName),
        ),
    );
    const mcpToolNames = Object.keys(mcpTools);
    const loadMcpTools =
        mcpToolNames.length > 0 ? getLoadMcpTools(mcpToolNames) : null;

    const tools: ToolSet = {
        findContent,
        grepFields,
        getMetadata,
        analyzeFieldImpact,
        searchSemanticLayer,
        listProjects,
        getProjectInfo,
        listKnowledgeDocuments,
        getKnowledgeDocumentContent,
        readPinnedThread,
        resolveUrl,
        ...(args.requestingUser
            ? {
                  updateUserName: getUpdateUserName({
                      updateUserName: dependencies.updateUserName,
                  }),
              }
            : {}),
        ...(enableContentTools
            ? {
                  readContent,
                  editContent,
                  listContent,
                  createContent,
                  createScheduledDelivery,
                  runContentQuery,
              }
            : {
                  getDashboardCharts,
                  ...(generateDashboard ? { generateDashboard } : {}),
              }),
        generateVisualization,
        ...(runQuery ? { runQuery } : {}),
        ...(args.decisions &&
        args.enableDataAccess &&
        args.execution.mode === 'standard'
            ? {
                  exportChartAsCode: getExportChartAsCode(
                      agentContext,
                      dependencies.chartExportArtifacts,
                  ),
              }
            : {}),
        runSavedChart,
        generateHashes,
        generateUuids,
        ...(generateDataApp ? { generateDataApp } : {}),
        ...(iterateDataApp ? { iterateDataApp } : {}),
        ...(listDataAppThemes ? { listDataAppThemes } : {}),
        ...(editDbtProject ? { editDbtProject } : {}),
        ...(editProjectContext ? { editProjectContext } : {}),
        ...(editRepo ? { editRepo } : {}),
        ...(syncDbtProject ? { syncDbtProject } : {}),
        ...(setupPreviewDeploy ? { setupPreviewDeploy } : {}),
        ...(exploreRepo ? { exploreRepo } : {}),
        ...(discoverRepos ? { discoverRepos } : {}),
        ...(listWorkstreams ? { listWorkstreams } : {}),
        ...(closePullRequest ? { closePullRequest } : {}),
        ...(getPullRequestDiff ? { getPullRequestDiff } : {}),
        ...(args.enableDataAccess ? { searchFieldValues } : {}),
        ...(findCustomChartTypes ? { findCustomChartTypes } : {}),
        ...(runSql ? { runSql } : {}),
        ...(runComposerQueries ? { runComposerQueries } : {}),
        ...(listWarehouseTables ? { listWarehouseTables } : {}),
        ...(describeWarehouseTable ? { describeWarehouseTable } : {}),
        ...(loadSkill ? { loadSkill } : {}),
        ...(loadProjectContext ? { loadProjectContext } : {}),
        ...(loadMcpTools ? { loadMcpTools } : {}),
        ...(args.decisions && args.execution.mode === 'standard'
            ? { loadAgentTools: getLoadAgentTools() }
            : {}),
    };

    const mergedTools = { ...tools, ...mcpTools };

    // Deep-research roles reshape the toolset: the coordinator gains delegation,
    // and a worker is cut down to the warehouse tools its one task needs so the
    // agent's full context is not reloaded per worker.
    const research =
        args.execution.mode === 'deep_research'
            ? args.execution.research
            : undefined;
    const trustedDeepResearchMcpToolNames = research
        ? getTrustedDeepResearchMcpToolNames(args, mcpToolSetup)
        : new Set<string>();
    const getResearchTools = (): ToolSet | null => {
        switch (research?.role) {
            case 'coordinator':
                return {
                    ...Object.fromEntries(
                        Object.entries(mergedTools).filter(
                            ([toolName]) =>
                                DEEP_RESEARCH_COORDINATOR_TOOL_NAMES.has(
                                    toolName,
                                ) ||
                                trustedDeepResearchMcpToolNames.has(toolName),
                        ),
                    ),
                    delegateResearchTask: getDelegateResearchTask({
                        runTask: research.runTask,
                    }),
                };
            case 'worker':
                return {
                    ...Object.fromEntries(
                        Object.entries(mergedTools).filter(
                            ([toolName]) =>
                                DEEP_RESEARCH_WORKER_TOOL_NAMES.has(toolName) ||
                                trustedDeepResearchMcpToolNames.has(toolName),
                        ),
                    ),
                    submitWorkerFindings: getSubmitWorkerFindings({
                        onFindings: research.onFindings,
                    }),
                };
            case undefined:
                return null;
            default:
                return assertUnreachable(research, 'Unknown research role');
        }
    };
    const researchTools = getResearchTools();
    const allowlist =
        args.execution.mode === 'standard'
            ? args.execution.toolAllowlist
            : undefined;
    // A standard run can pin itself to a read-only subset (data-app
    // investigations); MCP tools are excluded from such runs entirely.
    const finalTools =
        researchTools ??
        (allowlist
            ? Object.fromEntries(
                  Object.entries(tools).filter(([toolName]) =>
                      allowlist.has(toolName),
                  ),
              )
            : mergedTools);

    logger(
        'Agent Tools',
        `Successfully retrieved agent tools: ${Object.keys(finalTools).join(', ')}`,
    );
    return finalTools;
};

// Fires an `in_progress` task update the moment a tool's execute() runs — i.e. as
// soon as the model emits the call, before the (possibly slow) tool finishes.
// generateText() only surfaces tool progress in onStepFinish, which lands after
// the tool already returned, so without this the Slack/UI card stays empty until
// the first tool completes. The streaming path emits this from its 'tool-call'
// chunk instead, so this wrap is only applied in the non-streaming path.
const getFinalAsyncIterableOutput = async (output: AnyType) => {
    if (
        !output ||
        typeof output !== 'object' ||
        typeof output[Symbol.asyncIterator] !== 'function'
    ) {
        return output;
    }

    let finalOutput: AnyType;
    for await (const partialOutput of output as AsyncIterable<AnyType>) {
        finalOutput = partialOutput;
    }
    return finalOutput;
};

export const withEarlyToolProgress = (
    tools: ToolSet,
    updateProgress: AiAgentDependencies['updateProgress'],
    waitForProgress: boolean,
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
                        const progress = updateProgress(
                            summarizeToolCall(toolName, input) ??
                                `Running ${toolName}...`,
                            toolName,
                            options?.toolCallId,
                            'in_progress',
                        );
                        if (waitForProgress) {
                            return progress.then(() =>
                                getFinalAsyncIterableOutput(
                                    originalExecute(input, options),
                                ),
                            );
                        }

                        void progress.catch((error) => {
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

export const buildAgentMessages = ({
    systemPrompt,
    compactionSummary,
    messageHistory,
    memoryBlock,
}: {
    systemPrompt: ModelMessage;
    compactionSummary: string | null;
    messageHistory: ModelMessage[];
    memoryBlock: string | null;
}): ModelMessage[] => [
    systemPrompt,
    ...(compactionSummary
        ? [Compaction.createSummaryMessage(compactionSummary)]
        : []),
    ...(memoryBlock ? [{ role: 'user' as const, content: memoryBlock }] : []),
    ...messageHistory,
];

export const scopeAgentConversation = ({
    execution,
    messageHistory,
    compactionSummary,
    memoryBlock,
}: {
    execution: AiAgentArgs['execution'];
    messageHistory: ModelMessage[];
    compactionSummary: string | null;
    memoryBlock: string | null;
}) =>
    execution.mode === 'deep_research' && execution.research?.role === 'worker'
        ? {
              messageHistory: [
                  {
                      role: 'user' as const,
                      content:
                          'Carry out the isolated task packet in your system instructions.',
                  },
              ],
              compactionSummary: null,
              memoryBlock: null,
          }
        : { messageHistory, compactionSummary, memoryBlock };

export const getDeepResearchBudgetInstruction = (
    budget: AiDeepResearchBudget,
): string =>
    `Run limits: at most ${budget.maxSteps} steps, ${budget.maxToolCalls} tool calls, ${budget.maxWarehouseQueries} warehouse queries, ${budget.maxTokens} total model tokens, ${Math.round(budget.deadlineMs / 1_000)} seconds of wall clock, and ${budget.maxResultRows} rows per query result. These are ceilings, not targets — a focused answer that uses a fraction of them is better than one that exhausts them. Submit the best report available before a limit is reached.`;

export const getPromptMcpServers = (
    mcpServers: AiAgentArgs['mcpServers'],
    mcpToolSetup: AgentMcpToolSetup,
    tools: ToolSet,
) =>
    mcpServers.map((server) => ({
        name: server.name,
        toolNames: Object.keys(mcpToolSetup.tools).filter(
            (toolName) =>
                toolName in tools &&
                mcpToolSetup.mcpToolNameToServerUuid[toolName] === server.uuid,
        ),
    }));

export const getAgentMessages = (
    args: AiAgentArgs,
    availableExplores: Explore[],
    mcpToolSetup: AgentMcpToolSetup,
    tools: ToolSet,
    verifiedFieldUsage: Map<string, number>,
    memoryBlock: string | null,
    customChartTypeLibrary: CustomChartTypeLibrary,
    preparedSeed?: string,
    projectContextPreloaded = false,
) => {
    const logger = createAiAgentLogger(args.debugLoggingEnabled);
    logger('Agent Messages', 'Getting agent messages.');

    const scopedConversation = scopeAgentConversation({
        execution: args.execution,
        messageHistory: args.messageHistory,
        compactionSummary: args.compactionSummary,
        memoryBlock,
    });
    const isDeepResearchWorker =
        args.execution.mode === 'deep_research' &&
        args.execution.research?.role === 'worker';
    let { messageHistory } = scopedConversation;
    if (!isDeepResearchWorker) {
        messageHistory = withPreGrepCandidates(
            withToolHints(messageHistory, args.toolHints),
            availableExplores,
            verifiedFieldUsage,
            preparedSeed,
        );
    }

    // Project context is loaded on demand via the loadProjectContext tool; the
    // system prompt only advertises that it exists (when enabled + non-empty).
    const hasProjectContext =
        args.projectContextEnabled && args.projectContext.length > 0;
    const getDeepResearchInstructions = (): (string | null)[] => {
        if (args.execution.mode !== 'deep_research') {
            return [];
        }
        const budgetInstruction = getDeepResearchBudgetInstruction(
            args.execution.budget,
        );
        const resumeInstruction = args.execution.resumeContext
            ? `A previous Deep Research run already completed the evidence below. Continue only unfinished work; do not repeat these successful queries unless you need a genuinely different slice.\n\n${args.execution.resumeContext}`
            : null;
        const { research } = args.execution;
        switch (research?.role) {
            case 'coordinator':
                return [
                    AI_DEEP_RESEARCH_INSTRUCTIONS,
                    getAiDeepResearchCoordinatorInstructions(),
                    budgetInstruction,
                    resumeInstruction,
                ];
            case 'worker':
                return [
                    getAiDeepResearchWorkerInstructions(research.task),
                    budgetInstruction,
                    resumeInstruction,
                ];
            case undefined:
                return [
                    AI_DEEP_RESEARCH_INSTRUCTIONS,
                    budgetInstruction,
                    resumeInstruction,
                ];
            default:
                return assertUnreachable(research, 'Unknown research role');
        }
    };
    const instructions = [
        args.agentSettings.instruction,
        ...getDeepResearchInstructions(),
    ].filter((instruction): instruction is string => !!instruction);
    const systemPrompt = getSystemPromptV2({
        enableChartExport:
            !!args.decisions &&
            args.enableDataAccess &&
            args.execution.mode === 'standard',
        enableFastMetadata:
            !!args.decisions && args.execution.mode === 'standard',
        agentName: args.agentSettings.name,
        instructions:
            instructions.length > 0 ? instructions.join('\n\n') : undefined,
        requestingUser: args.requestingUser,
        availableExplores,
        availableCustomChartTypes: customChartTypeLibrary,
        availableSkills: args.availableSkills,
        knowledgeDocuments: args.knowledgeDocuments,
        deepResearchRuns: args.deepResearchRuns,
        hasProjectContext,
        projectContextPreloaded,
        enableAiAgentMemory: args.aiAgentMemoryEnabled,
        enableDataAccess: args.enableDataAccess,
        enableFilterExpressions: args.enableFilterExpressions,
        enableAiWriteback: args.enableAiWriteback,
        writebackAttribution: args.writebackAttribution,
        enableCodingAgent: args.enableCodingAgent,
        siteUrl: args.siteUrl,
        enableRepoDiscovery: args.enableRepoDiscovery,
        repoFsRoot: args.repoFsRoot,
        repoFsSupportsCodeSearch: args.repoFsSupportsCodeSearch,
        enableContentTools: args.enableDataAccess && args.enableContentTools,
        enableDocuments:
            args.enableDataAccess &&
            args.enableContentTools &&
            args.enableDocuments,
        enableGenerateDataApp: args.enableGenerateDataApp,
        slackChannelId: args.slackChannelId,
        canRunSql: args.canRunSql,
        slackLinksOnly: args.slackLinksOnly,
        enableComposerQueries: args.enableComposerQueries,
        enableMergeQueries: args.enableMergeQueries,
        warehouseType: args.warehouseType,
        warehouseSchema: args.warehouseSchema,
        sqlScope: args.sqlScope,
        runSqlMaxLimit: args.runSqlMaxLimit,
        unauthenticatedMcpServerNames: getUnauthenticatedMcpServerNames(
            args,
            mcpToolSetup,
        ),
        mcpServers: getPromptMcpServers(args.mcpServers, mcpToolSetup, tools),
    });
    const messages = buildAgentMessages({
        systemPrompt,
        compactionSummary: scopedConversation.compactionSummary,
        messageHistory,
        memoryBlock: scopedConversation.memoryBlock,
    });

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

const getMemoryBlock = async (
    args: AiAgentArgs,
    dependencies: AiAgentDependencies,
): Promise<string | null> => {
    if (!args.aiAgentMemoryEnabled) return null;
    return renderMemoryBlock(
        await dependencies.getAiAgentMemoryContextEntries(),
    );
};

export const getFastDataAnswerPreparedContext = (
    args: AiAgentArgs,
): PreparedContext | null => {
    if (
        !args.enableDataAnswerFastResponse ||
        args.execution.mode !== 'standard' ||
        args.messageHistory.filter((message) => message.role === 'user')
            .length !== 1
    )
        return null;

    return {
        content: null,
        mcpToolNames: [],
        projectContextEntryIds: [],
        turnIntent: 'data_answer',
    };
};

/**
 * Builds the shared runtime for generate and stream turns. Keep context loading,
 * Jev preparation, tool gating, and prompt construction on one code path so the
 * two delivery modes cannot drift.
 */
const prepareAgentTurn = async ({
    args,
    dependencies,
    mcpToolSetup,
    timing,
    logger,
    reportEarlyToolProgress,
    verifyAnswers,
}: {
    args: AiAgentArgs;
    dependencies: AiAgentDependencies;
    mcpToolSetup: AgentMcpToolSetup;
    timing: TurnTimingTracker;
    logger: ReturnType<typeof createAiAgentLogger>;
    reportEarlyToolProgress: boolean;
    verifyAnswers: boolean;
}) => {
    const [
        availableExplores,
        memoryBlock,
        projectParameterDefinitions,
        customChartTypeLibrary,
        verifiedFieldUsage,
    ] = await Promise.all([
        dependencies.listExplores(),
        getMemoryBlock(args, dependencies),
        dependencies.getProjectParameterDefinitions(),
        dependencies.listCustomChartTypes(),
        dependencies
            .getVerifiedFieldUsage()
            .catch(() => new Map<string, number>()),
    ]);
    const agentContext = new AgentContext(
        availableExplores,
        verifyAnswers &&
            !!args.decisions &&
            args.enableDataAccess &&
            args.execution.mode === 'standard',
        (stage, startedAt, durationMs) =>
            timing.recordStageSpan(stage, startedAt, durationMs),
    );
    const answerVerifier =
        args.decisions && agentContext.answerEvidence
            ? new AnswerClaimVerifier(
                  args.decisions,
                  agentContext.answerEvidence,
                  getAgentQuestion(args),
              )
            : undefined;
    let tools = getAgentTools(
        args,
        dependencies,
        availableExplores,
        mcpToolSetup,
        verifiedFieldUsage,
        projectParameterDefinitions,
        customChartTypeLibrary,
        agentContext,
    );
    await persistDeepResearchExecutionContext(args, tools, mcpToolSetup);
    // model-routing already classified this first turn as a simple data answer
    // with >=99% confidence. Reuse that decision instead of serially asking
    // JEV for the same intent plus catalog ranking before a fast model can
    // start. Deterministic pre-grep still seeds fields, and query-intent checks
    // validate the actual tool args in parallel with warehouse execution.
    const fastDataAnswerContext = getFastDataAnswerPreparedContext(args);
    const [preparedSeed, preparedContext] = await Promise.all([
        fastDataAnswerContext
            ? Promise.resolve(undefined)
            : prepareCandidateSeed(
                  args,
                  availableExplores,
                  verifiedFieldUsage,
                  projectParameterDefinitions,
              ),
        fastDataAnswerContext
            ? Promise.resolve(fastDataAnswerContext)
            : prepareRelevantContext(
                  args,
                  dependencies,
                  tools,
                  Object.keys(mcpToolSetup.tools),
              ),
    ]);
    if (
        preparedContext?.turnIntent === 'chart_from_previous' &&
        getRecentQueryFieldIds(args.messageHistory).length === 0 &&
        !args.chartMutationContext
    ) {
        preparedContext.turnIntent = 'chart';
    }
    if (
        args.decisions &&
        args.execution.mode === 'standard' &&
        preparedContext?.turnIntent === 'chart_from_previous'
    ) {
        agentContext.previousQueryUuid = getPreviousQueryUuid(
            args.messageHistory,
        );
    }
    const intentToolGate = createIntentToolGate(
        tools,
        preparedContext?.turnIntent ?? null,
    );
    tools = reportEarlyToolProgress
        ? withEarlyToolProgress(
              intentToolGate.tools,
              dependencies.updateProgress,
              args.execution.mode === 'deep_research',
          )
        : intentToolGate.tools;
    const messages = getAgentMessages(
        args,
        availableExplores,
        mcpToolSetup,
        tools,
        verifiedFieldUsage,
        memoryBlock,
        customChartTypeLibrary,
        preparedContext?.turnIntent === 'reference_answer' ||
            preparedContext?.turnIntent === 'repository_change'
            ? ''
            : preparedSeed,
        !!preparedContext?.projectContextEntryIds.length,
    );
    if (preparedContext?.content) {
        messages.push({
            role: 'user',
            content: `Reference material preloaded from the available tools for this request:\n${preparedContext.content}`,
        });
    }
    const invalidToolCallIds = new Set<string>();
    const prepareStep = buildPrepareStep({
        args,
        dependencies,
        tools,
        mcpToolNames: Object.keys(mcpToolSetup.tools).filter(
            (name) => name in tools,
        ),
        preloadedMcpToolNames: preparedContext?.mcpToolNames,
        intentToolGate,
        logger,
        invalidToolCallIds,
        agentContext,
    });

    return {
        agentContext,
        answerVerifier,
        tools,
        messages,
        preparedContext,
        invalidToolCallIds,
        prepareStep,
        stopWhenPromptInterrupted: buildStopWhenPromptInterrupted(
            args,
            dependencies,
            logger,
        ),
    };
};

export const generateAgentResponse = async ({
    args,
    dependencies,
    mcpToolSetup,
    abortSignal,
}: {
    args: AiAgentArgs;
    dependencies: AiAgentDependencies;
    mcpToolSetup: AgentMcpToolSetup;
    abortSignal?: AbortSignal;
}): Promise<string> => {
    const resolveErrorMessage = createUserFacingErrorResolver(args);
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
    const timing = new TurnTimingTracker(startTime);
    const modelName = getAiAgentModelName(args.model);
    let generatedTokenUsage = initialPromptTokenUsage(
        args.execution.mode === 'deep_research'
            ? args.execution.initialTokenUsage
            : 0,
    );

    try {
        const {
            agentContext,
            answerVerifier,
            tools,
            messages,
            preparedContext,
            invalidToolCallIds,
            prepareStep,
            stopWhenPromptInterrupted,
        } = await prepareAgentTurn({
            args,
            dependencies,
            mcpToolSetup,
            timing,
            logger,
            reportEarlyToolProgress: true,
            verifyAnswers: true,
        });
        logger(
            'Generate Agent Response',
            `Calling generateText with model: ${modelName}`,
        );
        const { record: recordStepUsage, telemetry } =
            createAgentStepUsageRecorder({
                args,
                turnIntent: preparedContext?.turnIntent,
                preloadedMcpToolNames: preparedContext?.mcpToolNames,
                functionId: 'generateAgentResponse',
                feature:
                    args.execution.mode === 'deep_research'
                        ? 'deep-research'
                        : 'agent',
            });
        timing.recordPreparationFinished();
        const result = await generateText({
            ...defaultAgentOptions,
            ...args.callOptions,
            prepareStep: async (input) => {
                const prepared = await prepareStep(input);
                return {
                    ...prepared,
                    model: withNonStreamingProviderTiming(
                        ('model' in prepared ? prepared.model : undefined) ??
                            args.model,
                        timing,
                    ),
                };
            },
            stopWhen: [
                stepCountIs(args.execution.maxSteps),
                stopWhenPromptInterrupted,
                ({ steps }) =>
                    getTurnFastResponse(
                        args.enableDataAnswerFastResponse,
                        preparedContext?.turnIntent,
                        steps,
                    ) !== null,
            ],
            abortSignal,
            providerOptions: args.providerOptions,
            experimental_repairToolCall: args.decisions
                ? repairQueryToolCall
                : undefined,
            model: args.model,
            tools,
            allowSystemInMessages: true,
            messages,
            experimental_onToolCallStart: ({ toolCall }) => {
                timing.recordToolCallStart(
                    toolCall.toolCallId,
                    toolCall.toolName,
                );
            },
            experimental_onToolCallFinish: (event) => {
                recordExternalMcpToolCall(dependencies, mcpToolSetup, event);
                const toolTiming = timing.recordToolCallEnd(
                    event.toolCall.toolCallId,
                    event.toolOutput.type === 'tool-result' &&
                        isQueryCacheHit(event.toolOutput.output),
                    event.toolOutput.type === 'tool-result' &&
                        isQueryReuseHit(event.toolOutput.output),
                );
                if (toolTiming) {
                    dependencies.trackEvent({
                        event: 'ai_agent.tool_call_completed',
                        userId: args.userId,
                        properties: {
                            organizationId: args.organizationId,
                            projectId: args.agentSettings.projectUuid,
                            aiAgentId: args.agentSettings.uuid,
                            promptId: args.promptUuid,
                            threadId: args.threadUuid,
                            stepIndex: toolTiming.stepIndex,
                            toolName: toolTiming.toolName,
                            toolCallId: event.toolCall.toolCallId,
                            durationMs: toolTiming.durationMs,
                            stage: toolTiming.stage,
                            queryCacheHit: toolTiming.queryCacheHit,
                            queryReuseHit: toolTiming.queryReuseHit,
                            status:
                                event.toolOutput.type !== 'tool-result' ||
                                isErrorToolResult(event.toolOutput.output)
                                    ? 'error'
                                    : 'success',
                        },
                    });
                }
            },
            onStepFinish: async (step) => {
                const stepUsage = await recordStepUsage(step);
                // completeStep opens the next step; these calls belong to this one.
                const stepIndex = timing.getCurrentStepIndex();
                trackAgentStep(
                    args,
                    dependencies,
                    timing.completeStep(
                        step.reasoningText?.length ?? 0,
                        step.toolCalls?.length ?? 0,
                    ),
                    step.usage,
                );
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
                                        toolCallId: toolCall.toolCallId,
                                        stepIndex,
                                    },
                                });

                                // Same handling as the streaming path: keep
                                // invalid attempts out of ai_agent_tool_call
                                // (replayed into UI/history) and persist them
                                // in the error table instead.
                                if (toolCall.invalid) {
                                    invalidToolCallIds.add(toolCall.toolCallId);
                                    Sentry.captureException(toolCall.error, {
                                        tags: {
                                            errorType: 'AiAgentToolCallInvalid',
                                            'ai.model': modelName,
                                        },
                                    });
                                    await storeInvalidAgentToolCall({
                                        storeToolCallError:
                                            dependencies.storeToolCallError,
                                        promptUuid: args.promptUuid,
                                        toolCall,
                                        executionMode: args.execution.mode,
                                    });
                                    return;
                                }

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
                                    parentToolCallId:
                                        args.execution.parentToolCallId ?? null,
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

                    const toolResults = step.toolResults.filter(
                        (
                            toolResult,
                        ): toolResult is NonNullable<typeof toolResult> =>
                            toolResult !== null,
                    );
                    const progressUpdates = toolResults.map((toolResult) =>
                        dependencies.updateProgress(
                            summarizeToolResult(
                                toolResult.toolName,
                                toolResult.output as AnyType,
                            ),
                            toolResult.toolName,
                            toolResult.toolCallId,
                            isPendingToolResult(toolResult.output as AnyType)
                                ? 'in_progress'
                                : 'complete',
                        ),
                    );
                    if (args.execution.mode === 'deep_research') {
                        await Promise.all(progressUpdates);
                    } else {
                        void Promise.all(progressUpdates).catch((error) => {
                            Logger.debug(
                                '[AiAgent][On Step Finish] Failed to update tool progress:',
                                error,
                            );
                        });
                    }

                    await dependencies.storeToolResults(
                        toolResults.map((toolResult) => {
                            logger(
                                'On Step Finish',
                                `Storing tool result for Prompt UUID ${
                                    args.promptUuid
                                }: ${toolResult.toolName} (ID: ${
                                    toolResult.toolCallId
                                }) (RESULT: ${JSON.stringify(toolResult.output)})`,
                            );
                            trackFailedToolResult(
                                dependencies,
                                args,
                                toolResult.toolName,
                                toolResult.output,
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

                generatedTokenUsage = accumulatePromptTokenUsage(
                    generatedTokenUsage,
                    stepUsage.totalTokens,
                );
                if (args.execution.mode === 'deep_research') {
                    // Hidden phases (planner/investigators, persisted as
                    // subagent children) each track their own slice; writing
                    // their totals to the prompt would race across parallel
                    // investigators. The executor aggregates via onStepUsage
                    // and seeds the judge with the aggregate.
                    if (args.execution.parentToolCallId == null) {
                        await dependencies.updatePrompt({
                            promptUuid: args.promptUuid,
                            tokenUsage: generatedTokenUsage,
                        });
                    }
                } else {
                    void dependencies.updatePrompt({
                        response: agentContext.responseBlocks.render(
                            (await answerVerifier?.verify(step.text))?.text ??
                                step.text,
                        ),
                        promptUuid: args.promptUuid,
                    });
                }
            },
            ...telemetry,
        });
        const responseText = result.text.trim()
            ? result.text
            : (getTurnFastResponse(
                  args.enableDataAnswerFastResponse,
                  preparedContext?.turnIntent,
                  result.steps,
              ) ?? result.text);

        logger(
            'Generate Agent Response',
            `Generation complete. Result text length: ${responseText.length}, finishReason: ${result.finishReason}`,
        );

        // Invariant: a finished prompt must persist either a response or an
        // error message. Empty (or whitespace-only) text under the step cap
        // would otherwise be stored as a blank response with no explanation
        // for the user. Structured deep-research phases are exempt: their
        // deliverable is a forced submission tool call, so ending on it with
        // no trailing text is a success, not an empty response. Interrupted
        // prompts are exempt too: the user stopped the generation, so an
        // empty response is expected and must not surface as an error.
        const isStructuredResearchPhase =
            args.execution.mode === 'deep_research' &&
            args.execution.research !== undefined;
        if (!responseText.trim() && !isStructuredResearchPhase) {
            const interrupted = await dependencies.isPromptInterrupted(
                args.promptUuid,
            );
            if (!interrupted) {
                if (result.steps.length >= args.execution.maxSteps) {
                    throw new AiAgentStepCapReachedError(result.steps.length);
                }
                throw new AiAgentEmptyResponseError(
                    result.finishReason,
                    result.steps.length,
                );
            }
        }

        if (args.execution.mode !== 'deep_research') {
            await dependencies.updatePrompt({
                promptUuid: args.promptUuid,
                response: agentContext.responseBlocks.render(
                    (await answerVerifier?.verify(responseText))?.text ??
                        responseText,
                ),
                tokenUsage: completedPromptTokenUsage(
                    result.totalUsage?.totalTokens,
                    result.usage.totalTokens,
                    args.decisionUsage?.inputTokens,
                    args.decisionUsage?.outputTokens,
                ),
                responseTiming: {
                    startedAt: new Date(startTime).toISOString(),
                    firstTokenAt: null,
                    finishedAt: new Date().toISOString(),
                    stages: timing.getStageTiming(),
                },
            });
        }

        const totalTime = Date.now() - startTime;
        dependencies.perf.measureGenerateResponseTime(totalTime);
        dependencies.perf.measureTTFT(totalTime, modelName, 'generate');

        return agentContext.responseBlocks.render(
            (await answerVerifier?.verify(responseText))?.text ?? responseText,
        );
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

        const userFacingMessage = await resolveErrorMessage(
            error,
            'Something went wrong while generating the response. Please try again.',
        );

        if (args.execution.mode !== 'deep_research') {
            await dependencies.updatePrompt({
                promptUuid: args.promptUuid,
                errorMessage: userFacingMessage,
            });
        }

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
}): Promise<AgentStreamTextResult> => {
    const resolveErrorMessage = createUserFacingErrorResolver(args);
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
    // The turn-level timers above still feed Prometheus and responseTiming.
    const timing = new TurnTimingTracker(startTime);
    const modelName = getAiAgentModelName(args.model);
    const persistPrompt = makeStreamSafePersist(
        dependencies.updatePrompt,
        modelName,
    );

    const cleanupMcpClients = async () => {
        if (mcpClientsClosed) {
            return;
        }

        mcpClientsClosed = true;
        await mcpToolSetup.closeMcpClients();
    };

    try {
        const {
            agentContext,
            tools,
            messages,
            preparedContext,
            invalidToolCallIds,
            prepareStep,
            stopWhenPromptInterrupted,
        } = await prepareAgentTurn({
            args,
            dependencies,
            mcpToolSetup,
            timing,
            logger,
            reportEarlyToolProgress: false,
            // Verification needs a complete response and would turn live text
            // into a single delayed block. Keep it on non-stream delivery.
            verifyAnswers: false,
        });
        logger(
            'Stream Agent Response',
            `Calling streamText with model: ${modelName}`,
        );
        const { record: recordStepUsage, telemetry } =
            createAgentStepUsageRecorder({
                args,
                turnIntent: preparedContext?.turnIntent,
                preloadedMcpToolNames: preparedContext?.mcpToolNames,
                functionId: 'streamAgentResponse',
            });
        const fastToolCalls = new Map<
            string,
            FastChartStep['toolCalls'][number]
        >();
        const fastToolResults: FastChartStep['toolResults'][number][] = [];
        let fastStreamResponse: string | null = null;
        timing.recordPreparationFinished();
        const result = streamText({
            ...defaultAgentOptions,
            ...args.callOptions,
            prepareStep,
            stopWhen: [
                stepCountIs(args.execution.maxSteps),
                stopWhenPromptInterrupted,
                ({ steps }) =>
                    getTurnFastResponse(
                        args.enableDataAnswerFastResponse,
                        preparedContext?.turnIntent,
                        steps,
                    ) !== null,
            ],
            providerOptions: args.providerOptions,
            experimental_repairToolCall: args.decisions
                ? repairQueryToolCall
                : undefined,
            model: args.model,
            tools,
            allowSystemInMessages: true,
            messages,
            experimental_onToolCallFinish: (event) => {
                recordExternalMcpToolCall(dependencies, mcpToolSetup, event);
            },
            onChunk: (event) => {
                if (!isContentStreamChunk(event.chunk)) return;
                timing.recordChunk();
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
                        timing.recordToolCallStart(
                            event.chunk.toolCallId,
                            event.chunk.toolName,
                        );
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
                                toolCallId: event.chunk.toolCallId,
                                stepIndex: timing.getCurrentStepIndex(),
                            },
                        });

                        if (event.chunk.invalid) {
                            invalidToolCallIds.add(event.chunk.toolCallId);
                            Sentry.captureException(event.chunk.error, {
                                tags: {
                                    errorType: 'AiAgentToolCallInvalid',
                                    'ai.model': modelName,
                                },
                            });

                            // Invalid calls are excluded from
                            // ai_agent_tool_call (those rows are replayed into
                            // UI/history), but persist them separately so the
                            // thread doesn't silently lose failed attempts.
                            void dependencies
                                .storeToolCallError({
                                    promptUuid: args.promptUuid,
                                    toolCallId: event.chunk.toolCallId,
                                    toolName: event.chunk.toolName,
                                    errorMessage:
                                        event.chunk.error instanceof Error
                                            ? event.chunk.error.message
                                            : String(event.chunk.error),
                                    rawArgs: serializeRawToolArgs(
                                        event.chunk.input,
                                    ),
                                })
                                .catch((error) => {
                                    Logger.error(
                                        '[AiAgent][Chunk Tool Call] Failed to store invalid tool call',
                                        error,
                                    );
                                });
                            break;
                        }

                        fastToolCalls.set(event.chunk.toolCallId, {
                            toolCallId: event.chunk.toolCallId,
                            toolName: event.chunk.toolName,
                            input: event.chunk.input,
                        });

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
                        // Only persist final tool results. Preliminary chunks
                        // contain transient streaming state.
                        if (event.chunk.preliminary) {
                            break;
                        }
                        const fastToolCall = fastToolCalls.get(
                            event.chunk.toolCallId,
                        );
                        if (fastToolCall) {
                            fastToolResults.push({
                                toolCallId: event.chunk.toolCallId,
                                toolName: event.chunk.toolName,
                                output: event.chunk.output,
                            });
                            fastStreamResponse = getTurnFastResponse(
                                args.enableDataAnswerFastResponse,
                                preparedContext?.turnIntent,
                                [
                                    {
                                        toolCalls: Array.from(
                                            fastToolCalls.values(),
                                        ),
                                        toolResults: fastToolResults,
                                    },
                                ],
                            );
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
                                isPendingToolResult(
                                    event.chunk.output as AnyType,
                                )
                                    ? 'in_progress'
                                    : 'complete',
                            )
                            .catch((error) => {
                                Logger.debug(
                                    '[AiAgent][Chunk Tool Result] Failed to update tool progress:',
                                    error,
                                );
                            });
                        trackFailedToolResult(
                            dependencies,
                            args,
                            event.chunk.toolName,
                            event.chunk.output,
                        );
                        const toolTiming = timing.recordToolCallEnd(
                            event.chunk.toolCallId,
                            isQueryCacheHit(event.chunk.output),
                            isQueryReuseHit(event.chunk.output),
                        );
                        if (toolTiming) {
                            dependencies.trackEvent({
                                event: 'ai_agent.tool_call_completed',
                                userId: args.userId,
                                properties: {
                                    organizationId: args.organizationId,
                                    projectId: args.agentSettings.projectUuid,
                                    aiAgentId: args.agentSettings.uuid,
                                    toolName: event.chunk.toolName,
                                    threadId: args.threadUuid,
                                    promptId: args.promptUuid,
                                    toolCallId: event.chunk.toolCallId,
                                    stepIndex: toolTiming.stepIndex,
                                    durationMs: toolTiming.durationMs,
                                    stage: toolTiming.stage,
                                    queryCacheHit:
                                        toolTiming.queryCacheHit || null,
                                    queryReuseHit:
                                        toolTiming.queryReuseHit || null,
                                    status: isErrorToolResult(
                                        event.chunk.output as AnyType,
                                    )
                                        ? 'error'
                                        : 'success',
                                },
                            });
                        }
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
            onStepFinish: async (step) => {
                await recordStepUsage(step);
                trackAgentStep(
                    args,
                    dependencies,
                    timing.completeStep(step.reasoningText?.length ?? 0),
                    step.usage,
                );
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
            onFinish: async ({
                usage,
                totalUsage,
                steps,
                reasoning,
                finishReason,
            }) => {
                logger(
                    'On Finish',
                    `Stream finished. Updating prompt with response. finishReason: ${finishReason}, steps: ${steps.length}`,
                );

                // Extract complete response from all steps instead of just the last text
                const modelResponse = steps
                    .map((step) => step.text ?? '')
                    .join('\n');
                const responseText = modelResponse.trim()
                    ? modelResponse
                    : (getTurnFastResponse(
                          args.enableDataAnswerFastResponse,
                          preparedContext?.turnIntent,
                          steps,
                      ) ?? modelResponse);
                const completeResponse =
                    agentContext.responseBlocks.render(responseText);

                const stepCapReached = steps.length >= args.execution.maxSteps;

                // The AI SDK holds the stream open until onFinish resolves, so
                // the HTTP stream only closes once the response is persisted —
                // the client's post-stream refetch then reads persisted content.
                // Invariant: a finished prompt must persist either a response
                // or an error message — a blank response with no error renders
                // as an empty chat bubble with no explanation. trim() matters:
                // steps with empty text still join into "\n" strings.
                // Interrupted prompts are exempt: the user stopped the
                // generation, so an empty response is expected and persisted
                // as-is instead of surfacing as an error.
                const isEmptyResponse = !completeResponse.trim();
                const interrupted = isEmptyResponse
                    ? await dependencies.isPromptInterrupted(args.promptUuid)
                    : false;
                const responseTiming = {
                    startedAt: new Date(startTime).toISOString(),
                    firstTokenAt:
                        firstChunkTime === null
                            ? null
                            : new Date(firstChunkTime).toISOString(),
                    finishedAt: new Date().toISOString(),
                    stages: timing.getStageTiming(),
                };
                if (isEmptyResponse && !interrupted) {
                    const emptyResponseError = stepCapReached
                        ? new AiAgentStepCapReachedError(steps.length)
                        : new AiAgentEmptyResponseError(
                              finishReason,
                              steps.length,
                          );
                    if (!stepCapReached) {
                        // Under-cap empty finishes are unexpected — capture so
                        // the underlying trigger stays observable in Sentry.
                        Logger.error(
                            `[AiAgent][Stream Agent Response] Stream finished with empty response under the step cap. finishReason: ${finishReason}, steps: ${steps.length}`,
                        );
                        Sentry.captureException(emptyResponseError, {
                            tags: {
                                errorType: 'AiAgentEmptyResponseError',
                                'ai.model': modelName,
                                'ai.finishReason': finishReason,
                            },
                        });
                    }
                    await persistPrompt({
                        promptUuid: args.promptUuid,
                        errorMessage:
                            getUserFacingErrorMessage(emptyResponseError),
                        tokenUsage: completedPromptTokenUsage(
                            totalUsage.totalTokens,
                            usage.totalTokens,
                            args.decisionUsage?.inputTokens,
                            args.decisionUsage?.outputTokens,
                        ),
                        responseTiming,
                    });
                } else {
                    await persistPrompt({
                        response: completeResponse,
                        promptUuid: args.promptUuid,
                        tokenUsage: completedPromptTokenUsage(
                            totalUsage.totalTokens,
                            usage.totalTokens,
                            args.decisionUsage?.inputTokens,
                            args.decisionUsage?.outputTokens,
                        ),
                        responseTiming,
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
                        promptId: args.promptUuid,
                        threadId: args.threadUuid,
                        usageTokensCount: totalUsage.totalTokens ?? 0,
                        ...languageModelUsageToTokens(totalUsage),
                        stepsCount: steps.length,
                        model: modelName,
                        modelProvider:
                            typeof args.model === 'string'
                                ? null
                                : args.model.provider,
                        finishReason,
                        stepCapReached,
                        timeToFirstTokenMs:
                            firstChunkTime === null
                                ? null
                                : firstChunkTime - startTime,
                        durationMs: Date.now() - startTime,
                        ...timing.getStageTiming(),
                        fastDecisionsEnabled: !!args.decisions,
                        fastToolModelEnabled: !!args.toolCallModel,
                        turnIntent: preparedContext?.turnIntent ?? null,
                        surface:
                            args.slackChannelId === null ? 'web_app' : 'slack',
                        executionMode: args.execution.mode,
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
            experimental_transform: args.decisions
                ? [
                      syntheticTextTransform(() => fastStreamResponse),
                      generatedResponseTransform(agentContext.responseBlocks),
                  ]
                : smoothStream({
                      delayInMs: 20,
                      chunking: 'word',
                  }),
            onError: async ({ error }) => {
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

                const userFacingMessage = await resolveErrorMessage(
                    error,
                    'Something went wrong while streaming the response. Please try again.',
                );

                await persistPrompt({
                    promptUuid: args.promptUuid,
                    errorMessage: userFacingMessage,
                });

                void cleanupMcpClients();
            },
            ...telemetry,
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

        const userFacingMessage = await resolveErrorMessage(
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
