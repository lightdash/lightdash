import {
    getErrorMessage,
    type AiAgentToolCall,
    type AiAgentToolResult,
    type AiDeepResearchArtifact,
    type AiDeepResearchArtifactEvidence,
    type AiDeepResearchExecutionContextSnapshot,
    type AiDeepResearchTimings,
    type SessionUser,
} from '@lightdash/common';
import Logger from '../../../logging/logger';
import type { UserService } from '../../../services/UserService';
import type { AiAgentModel } from '../../models/AiAgentModel';
import type { AiDeepResearchRunModel } from '../../models/AiDeepResearchRunModel';
import { parseResearchArtifact } from '../ai/tools/submitResearchArtifact';
import type { AiAgentService } from '../AiAgentService/AiAgentService';
import type {
    AiDeepResearchExecutor as AiDeepResearchExecutorFn,
    AiDeepResearchExecutorResult,
} from './AiDeepResearchService';
import {
    AiDeepResearchPermanentError,
    AiDeepResearchPolicyLimitError,
} from './errors';

const MAX_EVIDENCE_SUMMARY_CHARS = 2_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const SUBMIT_RESEARCH_ARTIFACT_TOOL_NAME = 'submitResearchArtifact';

// Explicit classification of the built-in tool registry — MCP tools are
// classified via toolType instead (they cannot be inspected by name).
const WAREHOUSE_QUERY_TOOL_NAMES: ReadonlySet<string> = new Set([
    'generateVisualization',
    'runContentQuery',
    'runSavedChart',
    'runSql',
    'searchFieldValues',
]);
const REPOSITORY_TOOL_NAMES: ReadonlySet<string> = new Set([
    'discoverRepos',
    'exploreRepo',
    'getPullRequestDiff',
    'listWorkstreams',
]);
const KNOWLEDGE_TOOL_NAMES: ReadonlySet<string> = new Set([
    'getKnowledgeDocumentContent',
    'listKnowledgeDocuments',
]);
const METRIC_DEFINITION_TOOL_NAMES: ReadonlySet<string> = new Set([
    'analyzeFieldImpact',
    'describeWarehouseTable',
    'discoverFields',
    'getMetadata',
    'grepFields',
    'searchFieldValues',
]);

const isWarehouseQueryToolName = (toolName: string): boolean =>
    WAREHOUSE_QUERY_TOOL_NAMES.has(toolName);

type ToolProvenance = {
    toolCall: AiAgentToolCall;
    toolResult: AiAgentToolResult | null;
};

type Dependencies = {
    aiAgentService: Pick<
        AiAgentService,
        'generateAgentThreadResponse' | 'interruptAgentThreadMessage'
    >;
    aiAgentModel: Pick<
        AiAgentModel,
        | 'findWebAppPrompt'
        | 'getToolCallsAndResultsForPrompt'
        | 'clearModelResponse'
        | 'updateModelResponse'
    >;
    aiDeepResearchRunModel: Pick<
        AiDeepResearchRunModel,
        | 'appendEvent'
        | 'saveArtifactWithEvents'
        | 'saveCheckpoint'
        | 'saveExecutionContext'
        | 'savePolicyLimitReached'
        | 'saveTimings'
        | 'touch'
    >;
    userService: Pick<UserService, 'getSessionByUserUuidAndOrg'>;
};

const parseJson = (value: string): unknown => {
    try {
        return JSON.parse(value) as unknown;
    } catch {
        return value;
    }
};

const findValues = (value: unknown, key: string): string[] => {
    if (Array.isArray(value)) {
        return value.flatMap((item) => findValues(item, key));
    }
    if (value === null || typeof value !== 'object') {
        return [];
    }

    return Object.entries(value).flatMap(([entryKey, entryValue]) => [
        ...(entryKey === key && typeof entryValue === 'string'
            ? [entryValue]
            : []),
        ...findValues(entryValue, key),
    ]);
};

// Query provenance only trusts the server-written tool results — toolArgs are
// model-controlled and must never mint query UUIDs.
const getResultQueryUuids = ({ toolResult }: ToolProvenance): string[] =>
    toolResult ? findValues(parseJson(toolResult.result), 'queryUuid') : [];

const getQueryUuids = (provenance: ToolProvenance[]): string[] => [
    ...new Set(provenance.flatMap(getResultQueryUuids)),
];

const getQueryProvenance = (provenance: ToolProvenance[]) =>
    provenance.flatMap((item) =>
        [...new Set(getResultQueryUuids(item))].map((queryUuid) => ({
            queryUuid,
            toolCallId: item.toolCall.toolCallId,
            toolName: item.toolCall.toolName,
        })),
    );

const getSourceType = (
    toolCall: AiAgentToolCall,
): AiDeepResearchArtifactEvidence['sourceType'] => {
    if (toolCall.toolType === 'mcp') {
        return 'external_mcp';
    }
    if (REPOSITORY_TOOL_NAMES.has(toolCall.toolName)) {
        return 'repository';
    }
    if (KNOWLEDGE_TOOL_NAMES.has(toolCall.toolName)) {
        return 'knowledge';
    }
    if (isWarehouseQueryToolName(toolCall.toolName)) {
        return 'warehouse';
    }
    return 'lightdash';
};

const getEvidence = (
    provenance: ToolProvenance[],
): AiDeepResearchArtifactEvidence[] =>
    provenance.map((item) => ({
        title: item.toolCall.toolName,
        summary: (
            item.toolResult?.result ?? 'Tool call did not return a result'
        ).slice(0, MAX_EVIDENCE_SUMMARY_CHARS),
        sourceType: getSourceType(item.toolCall),
        toolName: item.toolCall.toolName,
        toolCallId: item.toolCall.toolCallId,
        mcpServerUuid:
            item.toolCall.toolType === 'mcp'
                ? (item.toolCall.mcpServer?.uuid ?? null)
                : null,
        queryUuid: getResultQueryUuids(item)[0] ?? null,
    }));

const getMetricDefinitions = (provenance: ToolProvenance[]) =>
    provenance
        .filter(
            ({ toolCall }) =>
                toolCall.toolType === 'built-in' &&
                METRIC_DEFINITION_TOOL_NAMES.has(toolCall.toolName),
        )
        .map(({ toolCall, toolResult }) => ({
            name: toolCall.toolName,
            definition: (
                toolResult?.result ?? JSON.stringify(toolCall.toolArgs)
            ).slice(0, MAX_EVIDENCE_SUMMARY_CHARS),
            source: 'Lightdash AI Agent',
        }));

const createFallbackArtifact = (
    provenance: ToolProvenance[],
    policyLimitReached: string,
): AiDeepResearchArtifact => ({
    findings: [],
    evidence: getEvidence(provenance),
    queryUuids: getQueryUuids(provenance),
    metricDefinitions: getMetricDefinitions(provenance),
    hypotheses: [],
    contradictions: [],
    confidence: 'low',
    limitations: [policyLimitReached],
    finalReport: `# Deep Research incomplete\n\n${policyLimitReached}\n\nThe investigation stopped before the researcher could submit a final conclusion. The Research Artifact preserves the evidence collected so far.`,
});

const createSubmittedArtifact = (
    submission: ToolProvenance,
    provenance: ToolProvenance[],
): AiDeepResearchArtifact => {
    const submittedArtifact = (() => {
        try {
            return parseResearchArtifact(submission.toolCall.toolArgs);
        } catch (error) {
            throw new AiDeepResearchPermanentError(
                `Deep Research submitted an invalid Research Artifact: ${getErrorMessage(error)}`,
            );
        }
    })();
    const evidenceProvenance = provenance.filter(
        ({ toolCall }) =>
            toolCall.toolName !== SUBMIT_RESEARCH_ARTIFACT_TOOL_NAME,
    );
    const toolCallsById = new Map(
        evidenceProvenance.map(({ toolCall }) => [
            toolCall.toolCallId,
            toolCall,
        ]),
    );
    const queryUuids = getQueryUuids(evidenceProvenance);
    const queryUuidSet = new Set(queryUuids);
    const submittedEvidence = submittedArtifact.evidence.map((evidence) => {
        const toolCall = evidence.toolCallId
            ? toolCallsById.get(evidence.toolCallId)
            : undefined;
        return {
            ...evidence,
            toolName: toolCall?.toolName ?? null,
            toolCallId: toolCall?.toolCallId ?? null,
            mcpServerUuid:
                toolCall?.toolType === 'mcp'
                    ? (toolCall.mcpServer?.uuid ?? null)
                    : null,
            queryUuid:
                evidence.queryUuid && queryUuidSet.has(evidence.queryUuid)
                    ? evidence.queryUuid
                    : null,
        };
    });
    const referencedToolCallIds = new Set(
        submittedEvidence.flatMap((evidence) =>
            evidence.toolCallId ? [evidence.toolCallId] : [],
        ),
    );
    return {
        ...submittedArtifact,
        evidence: [
            ...submittedEvidence,
            ...getEvidence(evidenceProvenance).filter(
                (evidence) =>
                    !evidence.toolCallId ||
                    !referencedToolCallIds.has(evidence.toolCallId),
            ),
        ],
        queryUuids,
        metricDefinitions:
            submittedArtifact.metricDefinitions.length > 0
                ? submittedArtifact.metricDefinitions
                : getMetricDefinitions(evidenceProvenance),
    };
};

export class AiDeepResearchExecutor {
    private readonly dependencies: Dependencies;

    constructor(dependencies: Dependencies) {
        this.dependencies = dependencies;
    }

    private async getUser(run: Parameters<AiDeepResearchExecutorFn>[0]) {
        return this.dependencies.userService.getSessionByUserUuidAndOrg(
            run.created_by_user_uuid,
            run.organization_uuid,
        ) as Promise<SessionUser>;
    }

    execute: AiDeepResearchExecutorFn = async (
        run,
        { signal },
    ): Promise<AiDeepResearchExecutorResult> => {
        if (!run.agent_uuid || !run.ai_thread_uuid || !run.prompt_uuid) {
            return {
                status: 'failed',
                errorMessage:
                    'Deep Research run is not linked to an AI Agent thread',
            };
        }
        if (signal.aborted || run.cancellation_requested_at) {
            return { status: 'cancelled' };
        }
        if (run.result && run.checkpoint === 'thread_attached') {
            return run.policy_limit_reached
                ? { status: 'partially_completed', artifact: run.result }
                : { status: 'completed', artifact: run.result };
        }
        const agentUuid = run.agent_uuid;
        const threadUuid = run.ai_thread_uuid;
        const promptUuid = run.prompt_uuid;

        const agentStartedAt = Date.now();
        const toolStartedAt = new Map<string, number>();
        const countedToolCallIds = new Set<string>();
        let toolWaitMs = run.timings?.toolWaitMs ?? 0;
        let warehouseMs = run.timings?.warehouseMs ?? 0;
        let toolCalls = 0;
        let warehouseQueries = 0;
        // Survives retries: a limit tripped on a previous attempt keeps the
        // resumed run partial instead of silently flipping it to completed.
        let policyExceeded: string | null = run.policy_limit_reached;
        let executionContext: AiDeepResearchExecutionContextSnapshot | null =
            run.execution_context_snapshot;
        const user = await this.getUser(run);
        const interrupt = async (reason: string) => {
            if (policyExceeded) {
                return;
            }
            policyExceeded = reason;
            await this.dependencies.aiDeepResearchRunModel.savePolicyLimitReached(
                run.ai_deep_research_run_uuid,
                reason,
            );
            await this.dependencies.aiAgentService.interruptAgentThreadMessage(
                user,
                {
                    agentUuid,
                    threadUuid,
                    messageUuid: promptUuid,
                },
            );
        };

        // A completed research pass already persisted its tool rows — rebuild
        // the artifact from them instead of generating again.
        const shouldGenerate =
            !run.result && run.checkpoint !== 'research_completed';

        if (shouldGenerate) {
            await this.dependencies.aiDeepResearchRunModel.appendEvent(
                run.ai_deep_research_run_uuid,
                'phase_changed',
                { phase: 'planning' },
            );
            const existingPrompt =
                await this.dependencies.aiAgentModel.findWebAppPrompt(
                    promptUuid,
                );
            if (existingPrompt?.response) {
                await this.dependencies.aiAgentModel.clearModelResponse(
                    promptUuid,
                );
            }

            // The runtime budget is cumulative across attempts, anchored on
            // the first attempt's start.
            const runtimeDeadline =
                (run.started_at?.getTime() ?? Date.now()) +
                run.policy_snapshot.maxRuntimeMs;
            const runtimeTimer = setTimeout(
                () => {
                    void interrupt(
                        'The runtime policy limit was reached.',
                    ).catch((error) => {
                        Logger.error(
                            `Deep Research run ${run.ai_deep_research_run_uuid} failed to interrupt on runtime limit: ${getErrorMessage(error)}`,
                        );
                    });
                },
                Math.max(0, runtimeDeadline - Date.now()),
            );
            runtimeTimer.unref();
            const heartbeat = setInterval(() => {
                void this.dependencies.aiDeepResearchRunModel
                    .touch(run.ai_deep_research_run_uuid)
                    .then((touched) => {
                        if (!touched) {
                            Logger.warn(
                                `Deep Research run ${run.ai_deep_research_run_uuid} heartbeat found no running run to touch`,
                            );
                        }
                    })
                    .catch((error) => {
                        Logger.error(
                            `Deep Research run ${run.ai_deep_research_run_uuid} heartbeat failed: ${getErrorMessage(error)}`,
                        );
                    });
            }, HEARTBEAT_INTERVAL_MS);
            heartbeat.unref();
            // The abort signal is passed into the generation call below; the
            // interrupt row is a fallback that stops it at a step boundary.
            const abortListener = () => {
                void this.dependencies.aiAgentService
                    .interruptAgentThreadMessage(user, {
                        agentUuid,
                        threadUuid,
                        messageUuid: promptUuid,
                    })
                    .catch((error) => {
                        Logger.error(
                            `Deep Research run ${run.ai_deep_research_run_uuid} failed to interrupt on abort: ${getErrorMessage(error)}`,
                        );
                    });
            };
            signal.addEventListener('abort', abortListener, { once: true });

            try {
                await this.dependencies.aiAgentService.generateAgentThreadResponse(
                    user,
                    {
                        agentUuid,
                        threadUuid,
                        promptUuid,
                        autoApproveSql: true,
                        suppressWritebackPreview: true,
                        deepResearch: true,
                        abortSignal: signal,
                        onExecutionContextResolved: async (snapshot) => {
                            executionContext = snapshot;
                            await this.dependencies.aiDeepResearchRunModel.saveExecutionContext(
                                run.ai_deep_research_run_uuid,
                                snapshot,
                            );
                        },
                        onStepProgress: async (
                            _progress,
                            progressToolName,
                            toolCallId,
                            status = 'in_progress',
                        ) => {
                            // Mid-tool progress (e.g. runSql's "Running SQL
                            // query…") carries no toolCallId — it is not a
                            // tool call.
                            if (!toolCallId) {
                                return;
                            }
                            const toolName = progressToolName ?? 'unknown';
                            const isArtifactSubmission =
                                toolName === SUBMIT_RESEARCH_ARTIFACT_TOOL_NAME;
                            if (
                                status === 'in_progress' &&
                                !isArtifactSubmission &&
                                !countedToolCallIds.has(toolCallId)
                            ) {
                                countedToolCallIds.add(toolCallId);
                                if (toolCalls === 0) {
                                    await this.dependencies.aiDeepResearchRunModel.appendEvent(
                                        run.ai_deep_research_run_uuid,
                                        'phase_changed',
                                        { phase: 'investigating' },
                                    );
                                }
                                toolStartedAt.set(toolCallId, Date.now());
                                toolCalls += 1;
                                if (isWarehouseQueryToolName(toolName)) {
                                    warehouseQueries += 1;
                                }
                                if (
                                    toolCalls >
                                        run.policy_snapshot.maxToolCalls ||
                                    toolCalls > run.policy_snapshot.maxSteps
                                ) {
                                    const reason =
                                        'The tool or step policy limit was reached.';
                                    await interrupt(reason);
                                    throw new AiDeepResearchPolicyLimitError(
                                        reason,
                                    );
                                } else if (
                                    warehouseQueries >
                                    run.policy_snapshot.maxWarehouseQueries
                                ) {
                                    const reason =
                                        'The warehouse query policy limit was reached.';
                                    await interrupt(reason);
                                    throw new AiDeepResearchPolicyLimitError(
                                        reason,
                                    );
                                }
                            }
                            const startedAt = toolStartedAt.get(toolCallId);
                            const durationMs =
                                status === 'in_progress' ||
                                startedAt === undefined
                                    ? null
                                    : Date.now() - startedAt;
                            if (durationMs !== null) {
                                toolWaitMs += durationMs;
                                if (isWarehouseQueryToolName(toolName)) {
                                    warehouseMs += durationMs;
                                }
                                toolStartedAt.delete(toolCallId);
                            }
                            await this.dependencies.aiDeepResearchRunModel.appendEvent(
                                run.ai_deep_research_run_uuid,
                                'tool_call',
                                {
                                    toolCallId,
                                    toolName,
                                    status,
                                    durationMs,
                                },
                            );
                        },
                    },
                );
            } catch (error) {
                const isPolicyLimitStop =
                    error instanceof AiDeepResearchPolicyLimitError;
                if (!isPolicyLimitStop || signal.aborted) {
                    if (!signal.aborted) {
                        await this.dependencies.aiDeepResearchRunModel.saveTimings(
                            run.ai_deep_research_run_uuid,
                            {
                                queueMs:
                                    (run.started_at?.getTime() ??
                                        agentStartedAt) -
                                    run.created_at.getTime(),
                                agentMs:
                                    (run.timings?.agentMs ?? 0) +
                                    (Date.now() - agentStartedAt),
                                toolWaitMs,
                                warehouseMs,
                                artifactGenerationMs:
                                    run.timings?.artifactGenerationMs ?? 0,
                                totalMs: Date.now() - run.created_at.getTime(),
                            },
                        );
                    }
                    throw error;
                }
            } finally {
                clearTimeout(runtimeTimer);
                clearInterval(heartbeat);
                signal.removeEventListener('abort', abortListener);
            }
        }

        // A timed-out or cancelled worker must not write results over a run
        // the scheduler already marked terminal.
        if (signal.aborted) {
            return { status: 'cancelled' };
        }

        if (
            !executionContext &&
            !run.execution_context_snapshot &&
            !run.result
        ) {
            return {
                status: 'failed',
                errorMessage: 'AI Agent execution context was not resolved',
            };
        }

        if (run.checkpoint === null || run.checkpoint === 'context_resolved') {
            await this.dependencies.aiDeepResearchRunModel.saveCheckpoint(
                run.ai_deep_research_run_uuid,
                'research_completed',
            );
        }
        await this.dependencies.aiDeepResearchRunModel.appendEvent(
            run.ai_deep_research_run_uuid,
            'phase_changed',
            { phase: 'synthesizing' },
        );
        const artifactStartedAt = Date.now();
        const provenance: ToolProvenance[] = run.result
            ? []
            : (
                  await this.dependencies.aiAgentModel.getToolCallsAndResultsForPrompt(
                      promptUuid,
                  )
              ).map(({ toolCall, toolResult }) => ({ toolCall, toolResult }));
        const submission = provenance.findLast(
            ({ toolCall }) =>
                toolCall.toolName === SUBMIT_RESEARCH_ARTIFACT_TOOL_NAME,
        );

        const getArtifact = async (): Promise<AiDeepResearchArtifact> => {
            if (run.result) {
                return run.result;
            }
            if (submission) {
                if (policyExceeded) {
                    // The researcher submitted a complete artifact before the
                    // tripped limit could actually stop it — the run
                    // completed, so drop the partial marker.
                    policyExceeded = null;
                    await this.dependencies.aiDeepResearchRunModel.savePolicyLimitReached(
                        run.ai_deep_research_run_uuid,
                        null,
                    );
                }
                return createSubmittedArtifact(submission, provenance);
            }
            if (policyExceeded) {
                return createFallbackArtifact(provenance, policyExceeded);
            }
            throw new AiDeepResearchPermanentError(
                'Deep Research finished without submitting a Research Artifact',
            );
        };
        const rawArtifact = await getArtifact();
        const artifact: AiDeepResearchArtifact =
            policyExceeded && !rawArtifact.limitations.includes(policyExceeded)
                ? {
                      ...rawArtifact,
                      limitations: [...rawArtifact.limitations, policyExceeded],
                  }
                : rawArtifact;
        const artifactGenerationMs = Date.now() - artifactStartedAt;

        if (!run.result) {
            await this.dependencies.aiDeepResearchRunModel.saveArtifactWithEvents(
                run.ai_deep_research_run_uuid,
                artifact,
                getQueryProvenance(
                    provenance.filter(
                        ({ toolCall }) =>
                            toolCall.toolName !==
                            SUBMIT_RESEARCH_ARTIFACT_TOOL_NAME,
                    ),
                ),
            );
        }

        await this.dependencies.aiAgentModel.updateModelResponse({
            promptUuid,
            response: artifact.finalReport,
        });
        const timings: AiDeepResearchTimings = {
            queueMs:
                (run.started_at?.getTime() ?? agentStartedAt) -
                run.created_at.getTime(),
            agentMs:
                (run.timings?.agentMs ?? 0) +
                (Date.now() - agentStartedAt - artifactGenerationMs),
            toolWaitMs,
            warehouseMs,
            artifactGenerationMs:
                (run.timings?.artifactGenerationMs ?? 0) + artifactGenerationMs,
            totalMs: Date.now() - run.created_at.getTime(),
        };
        await this.dependencies.aiDeepResearchRunModel.saveTimings(
            run.ai_deep_research_run_uuid,
            timings,
        );
        await this.dependencies.aiDeepResearchRunModel.saveCheckpoint(
            run.ai_deep_research_run_uuid,
            'thread_attached',
        );

        return policyExceeded
            ? { status: 'partially_completed', artifact }
            : { status: 'completed', artifact };
    };
}
