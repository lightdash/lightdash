import {
    type AiAgentToolCall,
    type AiAgentToolResult,
    type AiDeepResearchArtifact,
    type AiDeepResearchArtifactEvidence,
    type AiDeepResearchExecutionContextSnapshot,
    type AiDeepResearchTimings,
    type SessionUser,
} from '@lightdash/common';
import type { UserService } from '../../../services/UserService';
import type { AiAgentModel } from '../../models/AiAgentModel';
import type { AiDeepResearchRunModel } from '../../models/AiDeepResearchRunModel';
import { parseResearchArtifact } from '../ai/tools/submitResearchArtifact';
import type { AiAgentService } from '../AiAgentService/AiAgentService';
import type {
    AiDeepResearchExecutor as AiDeepResearchExecutorFn,
    AiDeepResearchExecutorResult,
} from './AiDeepResearchService';

const MAX_EVIDENCE_SUMMARY_CHARS = 2_000;

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

const getQueryUuids = (provenance: ToolProvenance[]): string[] => [
    ...new Set(
        provenance.flatMap(({ toolCall, toolResult }) => [
            ...findValues(toolCall.toolArgs, 'queryUuid'),
            ...findValues(
                toolResult ? parseJson(toolResult.result) : null,
                'queryUuid',
            ),
        ]),
    ),
];

const getQueryProvenance = (provenance: ToolProvenance[]) =>
    provenance.flatMap(({ toolCall, toolResult }) =>
        [
            ...new Set([
                ...findValues(toolCall.toolArgs, 'queryUuid'),
                ...findValues(
                    toolResult ? parseJson(toolResult.result) : null,
                    'queryUuid',
                ),
            ]),
        ].map((queryUuid) => ({
            queryUuid,
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
        })),
    );

const getSourceType = (
    toolCall: AiAgentToolCall,
): AiDeepResearchArtifactEvidence['sourceType'] => {
    const toolName = toolCall.toolName.toLowerCase();
    if (toolName.includes('repo')) {
        return 'repository';
    }
    if (toolName.includes('knowledge')) {
        return 'knowledge';
    }
    if (toolName.includes('sql') || toolName.includes('query')) {
        return 'warehouse';
    }
    if (toolCall.toolType === 'mcp') {
        return 'external_mcp';
    }
    return 'lightdash';
};

const getEvidence = (
    provenance: ToolProvenance[],
): AiDeepResearchArtifactEvidence[] =>
    provenance.map(({ toolCall, toolResult }) => ({
        title: toolCall.toolName,
        summary: (
            toolResult?.result ?? 'Tool call did not return a result'
        ).slice(0, MAX_EVIDENCE_SUMMARY_CHARS),
        sourceType: getSourceType(toolCall),
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        mcpServerUuid:
            toolCall.toolType === 'mcp'
                ? (toolCall.mcpServer?.uuid ?? null)
                : null,
        queryUuid:
            findValues(
                toolResult ? parseJson(toolResult.result) : toolCall.toolArgs,
                'queryUuid',
            )[0] ?? null,
    }));

const getMetricDefinitions = (provenance: ToolProvenance[]) =>
    provenance
        .filter(({ toolCall }) =>
            /metadata|metric|field/i.test(toolCall.toolName),
        )
        .map(({ toolCall, toolResult }) => ({
            name: toolCall.toolName,
            definition: (
                toolResult?.result ?? JSON.stringify(toolCall.toolArgs)
            ).slice(0, MAX_EVIDENCE_SUMMARY_CHARS),
            source:
                toolCall.toolType === 'mcp'
                    ? (toolCall.mcpServer?.name ?? null)
                    : 'Lightdash AI Agent',
        }));

const createArtifact = (
    provenance: ToolProvenance[],
    policyExceeded: string | null,
): AiDeepResearchArtifact => {
    const submission = provenance.findLast(
        ({ toolCall }) => toolCall.toolName === 'submitResearchArtifact',
    );
    if (!submission) {
        if (policyExceeded) {
            const evidence = getEvidence(provenance);
            return {
                findings: [],
                evidence,
                queryUuids: getQueryUuids(provenance),
                metricDefinitions: getMetricDefinitions(provenance),
                hypotheses: [],
                contradictions: [],
                confidence: 'low',
                limitations: [policyExceeded],
                finalReport: `# Deep Research incomplete\n\n${policyExceeded}\n\nThe investigation stopped before the researcher could submit a final conclusion. The Research Artifact preserves the evidence collected so far.`,
            };
        }
        throw new Error(
            'Deep Research finished without submitting a Research Artifact',
        );
    }

    const submittedArtifact = parseResearchArtifact(
        submission.toolCall.toolArgs,
    );
    const evidenceProvenance = provenance.filter(
        ({ toolCall }) => toolCall.toolName !== 'submitResearchArtifact',
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
            return { status: 'completed', artifact: run.result };
        }
        const agentUuid = run.agent_uuid;
        const threadUuid = run.ai_thread_uuid;
        const promptUuid = run.prompt_uuid;

        const agentStartedAt = Date.now();
        const toolStartedAt = new Map<string, number>();
        let toolWaitMs = run.timings?.toolWaitMs ?? 0;
        let warehouseMs = run.timings?.warehouseMs ?? 0;
        let toolCalls = 0;
        let warehouseQueries = 0;
        let policyExceeded: string | null = null;
        const existingPrompt =
            await this.dependencies.aiAgentModel.findWebAppPrompt(promptUuid);
        let executionContext: AiDeepResearchExecutionContextSnapshot | null =
            run.execution_context_snapshot;
        const user = await this.getUser(run);
        await this.dependencies.aiDeepResearchRunModel.appendEvent(
            run.ai_deep_research_run_uuid,
            'phase_changed',
            { phase: 'planning' },
        );
        const interrupt = async (reason: string) => {
            if (policyExceeded) {
                return;
            }
            policyExceeded = reason;
            await this.dependencies.aiAgentService.interruptAgentThreadMessage(
                user,
                {
                    agentUuid,
                    threadUuid,
                    messageUuid: promptUuid,
                },
            );
        };
        const runtimeTimer = setTimeout(() => {
            void interrupt('The runtime policy limit was reached.');
        }, run.policy_snapshot.maxRuntimeMs);
        runtimeTimer.unref();
        const heartbeat = setInterval(() => {
            void this.dependencies.aiDeepResearchRunModel.touch(
                run.ai_deep_research_run_uuid,
            );
        }, 15_000);
        heartbeat.unref();
        const abortListener = () => {
            void interrupt('The worker execution was cancelled.');
        };
        signal.addEventListener('abort', abortListener, { once: true });

        if (existingPrompt?.response && !run.result) {
            await this.dependencies.aiAgentModel.clearModelResponse(promptUuid);
        }
        if (!run.result) {
            await (async () => {
                try {
                    return await this.dependencies.aiAgentService.generateAgentThreadResponse(
                        user,
                        {
                            agentUuid,
                            threadUuid,
                            autoApproveSql: true,
                            suppressWritebackPreview: true,
                            deepResearch: true,
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
                                const toolName = progressToolName ?? 'unknown';
                                const key = toolCallId ?? toolName;
                                const isArtifactSubmission =
                                    toolName === 'submitResearchArtifact';
                                if (
                                    status === 'in_progress' &&
                                    !isArtifactSubmission
                                ) {
                                    if (toolCalls === 0) {
                                        await this.dependencies.aiDeepResearchRunModel.appendEvent(
                                            run.ai_deep_research_run_uuid,
                                            'phase_changed',
                                            { phase: 'investigating' },
                                        );
                                    }
                                    toolStartedAt.set(key, Date.now());
                                    toolCalls += 1;
                                    if (/sql|query/i.test(toolName)) {
                                        warehouseQueries += 1;
                                    }
                                    if (
                                        toolCalls >
                                            run.policy_snapshot.maxToolCalls ||
                                        toolCalls > run.policy_snapshot.maxSteps
                                    ) {
                                        await interrupt(
                                            'The tool or step policy limit was reached.',
                                        );
                                        throw new Error(
                                            policyExceeded ?? undefined,
                                        );
                                    } else if (
                                        warehouseQueries >
                                        run.policy_snapshot.maxWarehouseQueries
                                    ) {
                                        await interrupt(
                                            'The warehouse query policy limit was reached.',
                                        );
                                        throw new Error(
                                            policyExceeded ?? undefined,
                                        );
                                    }
                                }
                                const startedAt = toolStartedAt.get(key);
                                const durationMs =
                                    status === 'in_progress' ||
                                    startedAt === undefined
                                        ? null
                                        : Date.now() - startedAt;
                                if (durationMs !== null) {
                                    toolWaitMs += durationMs;
                                    if (/sql|query/i.test(toolName)) {
                                        warehouseMs += durationMs;
                                    }
                                    toolStartedAt.delete(key);
                                }
                                await this.dependencies.aiDeepResearchRunModel.appendEvent(
                                    run.ai_deep_research_run_uuid,
                                    'tool_call',
                                    {
                                        toolCallId: toolCallId ?? null,
                                        toolName,
                                        status,
                                        durationMs,
                                    },
                                );
                            },
                        },
                    );
                } catch (error) {
                    if (!policyExceeded || signal.aborted) {
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
                        throw error;
                    }
                    return undefined;
                } finally {
                    clearTimeout(runtimeTimer);
                    clearInterval(heartbeat);
                    signal.removeEventListener('abort', abortListener);
                }
            })();
        }
        clearTimeout(runtimeTimer);
        clearInterval(heartbeat);
        signal.removeEventListener('abort', abortListener);

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
        const provenance = run.result
            ? []
            : (
                  await this.dependencies.aiAgentModel.getToolCallsAndResultsForPrompt(
                      promptUuid,
                  )
              ).map(({ toolCall, toolResult }) => ({ toolCall, toolResult }));
        const artifact =
            run.result ?? createArtifact(provenance, policyExceeded);
        if (policyExceeded && !artifact.limitations.includes(policyExceeded)) {
            artifact.limitations = [...artifact.limitations, policyExceeded];
        }
        const artifactGenerationMs = Date.now() - artifactStartedAt;

        if (!run.result) {
            await this.dependencies.aiDeepResearchRunModel.saveArtifactWithEvents(
                run.ai_deep_research_run_uuid,
                artifact,
                getQueryProvenance(
                    provenance.filter(
                        ({ toolCall }) =>
                            toolCall.toolName !== 'submitResearchArtifact',
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
