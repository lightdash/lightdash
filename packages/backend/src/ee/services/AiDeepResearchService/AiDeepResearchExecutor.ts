import {
    AI_DEEP_RESEARCH_MAX_WORKERS,
    AI_DEEP_RESEARCH_SOFT_STOP_RATIO,
    ForbiddenError,
    getErrorMessage,
    InvalidUser,
    isAiDeepResearchEvidencePackEmpty,
    sleep,
    toAiDeepResearchWorkerTask,
    type AiAgentToolCall,
    type AiAgentToolResult,
    type AiDeepResearchActivity,
    type AiDeepResearchEvidencePack,
    type AiDeepResearchPhase,
    type AiDeepResearchProgress,
    type AiDeepResearchSubmittedReport,
    type AiDeepResearchWorkerFindings,
    type AiDeepResearchWorkerResult,
    type AiDeepResearchWorkerTaskInput,
    type SessionUser,
} from '@lightdash/common';
import { toSessionUser } from '../../../auth/account';
import Logger from '../../../logging/logger';
import type { UserService } from '../../../services/UserService';
import type { DbAiDeepResearchRun } from '../../database/entities/aiDeepResearch';
import type { AiAgentModel } from '../../models/AiAgentModel';
import type { AiDeepResearchRunModel } from '../../models/AiDeepResearchRunModel';
import type { AiDeepResearchStepUsage } from '../ai/types/aiAgent';
import type { AiAgentService } from '../AiAgentService/AiAgentService';
import {
    AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    AI_DEEP_RESEARCH_WORKER_FINDINGS_TOOL_NAME,
    getAiDeepResearchWorkerBudget,
} from './AiDeepResearchAgent';
import {
    AI_DEEP_RESEARCH_NO_RELEVANT_DATA_ERROR_MESSAGE,
    AiDeepResearchExecutorStageError,
    getAiDeepResearchRunBudget,
    type AiDeepResearchEvidenceBuildResult,
    type AiDeepResearchExecutor as AiDeepResearchExecutorFn,
    type AiDeepResearchExecutorResult,
} from './AiDeepResearchService';
import {
    isDeepResearchWarehouseMcpTool,
    isDeepResearchWarehouseTool,
} from './toolClassification';

const CANCELLATION_POLL_INTERVAL_MS = 1_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const ACCESS_RECHECK_INTERVAL_MS = 15_000;
const FINALIZATION_RETRY_DELAY_MS = 100;
const SUBMISSION_TOOL_NAMES = new Set([
    AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    AI_DEEP_RESEARCH_WORKER_FINDINGS_TOOL_NAME,
]);

const isAuthorizationRevokedError = (error: unknown): boolean =>
    error instanceof ForbiddenError || error instanceof InvalidUser;

const getResumeContext = (pack: AiDeepResearchEvidencePack): string => {
    const queries = pack.queries.map((query) => {
        const shape =
            query.type === 'sql_query'
                ? `columns: ${query.columns.join(', ')}`
                : `dimensions: ${query.dimensions.join(', ') || 'none'}; metrics: ${query.metrics.join(', ') || 'none'}`;
        return `- ${query.title}: ${query.description || 'no description'} (${query.rowCount} rows${query.truncated ? ', truncated' : ''}; ${shape})`;
    });
    const findings = pack.workerFindings.map(
        (finding) =>
            `- Finding: ${finding.summary} (confidence: ${finding.confidence})`,
    );
    return [...queries, ...findings].join('\n').slice(0, 8_000);
};

type ToolProvenance = {
    toolCall: AiAgentToolCall;
    toolResult: AiAgentToolResult | null;
};

type Dependencies = {
    aiAgentService: Pick<
        AiAgentService,
        | 'assertDeepResearchAccess'
        | 'generateAgentThreadResponse'
        | 'generateDeepResearchReport'
    >;
    /**
     * Injected rather than taking the service, which constructs the executor:
     * the executor only needs this one capability.
     */
    buildEvidencePack: (
        run: DbAiDeepResearchRun,
    ) => Promise<AiDeepResearchEvidenceBuildResult>;
    aiAgentModel: Pick<AiAgentModel, 'getToolCallsAndResultsForPrompt'>;
    aiDeepResearchRunModel: Pick<
        AiDeepResearchRunModel,
        | 'appendProgressEvent'
        | 'findByUuid'
        | 'accumulateTokenUsage'
        | 'touch'
        | 'updateExecutionContextSnapshot'
    >;
    userService: Pick<UserService, 'getAccountByUserUuidAndOrg'>;
};

/**
 * The execution id lives in the tool result's metadata. A warehouse tool's
 * `result` is the text the model reads — prose and CSV, not JSON — so it has no
 * `queryUuid` field to read even though it names the uuid in a sentence.
 */
const getQueryUuids = (provenance: ToolProvenance[]): string[] => [
    ...new Set(
        provenance.flatMap(({ toolResult }) => {
            const metadata = toolResult?.metadata;
            return toolResult &&
                isDeepResearchWarehouseTool(toolResult.toolName) &&
                metadata !== null &&
                typeof metadata === 'object' &&
                'queryUuid' in metadata &&
                typeof metadata.queryUuid === 'string'
                ? [metadata.queryUuid]
                : [];
        }),
    ),
];

const getPartialReport = (
    run: DbAiDeepResearchRun,
    reason: string,
): AiDeepResearchSubmittedReport => ({
    markdown: `The investigation stopped before it could produce a complete report.

<warning title="Incomplete investigation">

${reason}

</warning>

## Conclusion

- Run Deep Research again to continue investigating: ${run.prompt}`,
});

const getEvidenceCheckpointReport = (
    evidencePack: AiDeepResearchEvidencePack,
    reason: string,
): AiDeepResearchSubmittedReport => ({
    markdown: `The investigation produced evidence, but the final report could not be generated.

<warning title="Incomplete investigation">

${reason}

</warning>

## Available evidence

${evidencePack.queries
    .map(
        (query) =>
            `- **${query.title}** — ${query.description} (${query.rowCount} rows${query.truncated ? ', truncated' : ''})`,
    )
    .join('\n')}

${evidencePack.workerFindings
    .map(
        (finding) =>
            `- **Finding:** ${finding.summary} (confidence: ${finding.confidence})`,
    )
    .join('\n')}

## Conclusion

- The available evidence is preserved. Resume Deep Research to complete the narrative and analysis.`,
});

const getActivity = (toolName: string): AiDeepResearchActivity => {
    if (SUBMISSION_TOOL_NAMES.has(toolName)) {
        return 'reporting';
    }
    if (isDeepResearchWarehouseTool(toolName)) {
        return 'warehouse_query';
    }
    return 'lightdash_metadata';
};

/**
 * The coordinator is one continuous call, so its user-visible phase is derived
 * from what it is doing rather than from a fixed fan-out stage.
 */
const getCoordinatorPhase = (toolName: string): AiDeepResearchPhase => {
    if (toolName === AI_DEEP_RESEARCH_REPORT_TOOL_NAME) {
        return 'synthesizing';
    }
    if (isDeepResearchWarehouseTool(toolName)) {
        return 'investigating';
    }
    return 'planning';
};

export class AiDeepResearchExecutor {
    private readonly dependencies: Dependencies;

    constructor(dependencies: Dependencies) {
        this.dependencies = dependencies;
    }

    private startRunMonitor(
        run: DbAiDeepResearchRun,
        controller: AbortController,
        onCancellation: () => void,
        onAuthorizationRevoked: (reason: string) => void,
    ): () => Promise<void> {
        let stopped = false;
        let cancellationTimer: NodeJS.Timeout | null = null;
        let pendingCancellationCheck: Promise<void> = Promise.resolve();
        let pendingAuthorizationCheck: Promise<void> = Promise.resolve();
        let authorizationCheckInFlight = false;

        const scheduleCancellationCheck = () => {
            if (stopped || controller.signal.aborted) {
                return;
            }
            cancellationTimer = setTimeout(() => {
                pendingCancellationCheck =
                    this.dependencies.aiDeepResearchRunModel
                        .findByUuid(run.ai_deep_research_run_uuid)
                        .then((currentRun) => {
                            if (currentRun?.cancellation_requested_at) {
                                onCancellation();
                                controller.abort(
                                    new Error('Deep Research was cancelled'),
                                );
                            }
                        })
                        .catch((error) => {
                            Logger.warn(
                                `[AiDeepResearch] Could not check cancellation: ${getErrorMessage(error)}`,
                            );
                        })
                        .finally(scheduleCancellationCheck);
            }, CANCELLATION_POLL_INTERVAL_MS);
            cancellationTimer.unref();
        };

        scheduleCancellationCheck();
        const heartbeat = setInterval(() => {
            void this.dependencies.aiDeepResearchRunModel
                .touch(run.ai_deep_research_run_uuid)
                .catch((error) => {
                    Logger.warn(
                        `[AiDeepResearch] Could not update heartbeat: ${getErrorMessage(error)}`,
                    );
                });
        }, HEARTBEAT_INTERVAL_MS);
        heartbeat.unref();

        const authorizationCheck = setInterval(() => {
            if (controller.signal.aborted || authorizationCheckInFlight) {
                return;
            }
            authorizationCheckInFlight = true;
            pendingAuthorizationCheck = this.dependencies.userService
                .getAccountByUserUuidAndOrg(
                    run.created_by_user_uuid,
                    run.organization_uuid,
                )
                .then(toSessionUser)
                .then((currentUser) =>
                    this.dependencies.aiAgentService.assertDeepResearchAccess(
                        currentUser,
                        {
                            agentUuid: run.agent_uuid,
                            organizationUuid: run.organization_uuid,
                            projectUuid: run.project_uuid,
                            threadUuid: run.ai_thread_uuid,
                        },
                    ),
                )
                .catch((error) => {
                    if (!isAuthorizationRevokedError(error)) {
                        Logger.warn(
                            `[AiDeepResearch] Could not revalidate access; retrying: ${getErrorMessage(error)}`,
                        );
                        return;
                    }
                    const reason =
                        getErrorMessage(error) ||
                        'Deep Research could not revalidate the creator’s access';
                    onAuthorizationRevoked(reason);
                    controller.abort(new Error(reason));
                })
                .finally(() => {
                    authorizationCheckInFlight = false;
                });
        }, ACCESS_RECHECK_INTERVAL_MS);
        authorizationCheck.unref();

        return async () => {
            stopped = true;
            if (cancellationTimer) {
                clearTimeout(cancellationTimer);
            }
            clearInterval(heartbeat);
            clearInterval(authorizationCheck);
            await Promise.all([
                pendingCancellationCheck,
                pendingAuthorizationCheck,
            ]);
        };
    }

    private async getProvenance(
        promptUuid: string,
        options: { includeSubagentToolCalls?: boolean } = {},
    ): Promise<ToolProvenance[]> {
        return (
            await this.dependencies.aiAgentModel.getToolCallsAndResultsForPrompt(
                promptUuid,
                options,
            )
        ).map(({ toolCall, toolResult }) => ({ toolCall, toolResult }));
    }

    execute: AiDeepResearchExecutorFn = async (
        run,
        { signal },
    ): Promise<AiDeepResearchExecutorResult> => {
        if (signal.aborted || run.cancellation_requested_at) {
            return {
                status: 'cancelled',
                terminalReason: run.cancellation_requested_at
                    ? 'user_cancellation'
                    : 'internal_error',
                failureStage: 'authorization',
            };
        }

        let user: SessionUser;
        try {
            const account =
                await this.dependencies.userService.getAccountByUserUuidAndOrg(
                    run.created_by_user_uuid,
                    run.organization_uuid,
                );
            user = toSessionUser(account);
            if (!user.isActive && !user.serviceAccount) {
                return {
                    status: 'failed',
                    errorMessage:
                        'Deep Research cannot run because its creator is inactive',
                    terminalReason: 'permission_revoked',
                    failureStage: 'authorization',
                };
            }
            await this.dependencies.aiAgentService.assertDeepResearchAccess(
                user,
                {
                    agentUuid: run.agent_uuid,
                    organizationUuid: run.organization_uuid,
                    projectUuid: run.project_uuid,
                    threadUuid: run.ai_thread_uuid,
                },
            );
        } catch (error) {
            if (!isAuthorizationRevokedError(error)) {
                throw new AiDeepResearchExecutorStageError(
                    'authorization',
                    error,
                );
            }
            return {
                status: 'failed',
                errorMessage: getErrorMessage(error),
                terminalReason: 'permission_revoked',
                failureStage: 'authorization',
            };
        }

        const budget = getAiDeepResearchRunBudget(run.budget_snapshot);
        const workerBudget = getAiDeepResearchWorkerBudget(budget);
        const controller = new AbortController();
        let cancelledByUser = false;
        let authorizationRevokedReason: string | null = null;
        let budgetExceeded:
            | 'maxTokens'
            | 'maxToolCalls'
            | 'maxWarehouseQueries'
            | 'deadlineMs'
            | null = null;
        const stopRunMonitor = this.startRunMonitor(
            run,
            controller,
            () => {
                cancelledByUser = true;
            },
            (reason) => {
                authorizationRevokedReason = reason;
            },
        );
        const deadline = setTimeout(() => {
            budgetExceeded = 'deadlineMs';
            controller.abort(
                new Error('Deep Research exceeded its time budget'),
            );
        }, budget.deadlineMs);
        deadline.unref();
        const runSignal = AbortSignal.any([signal, controller.signal]);
        const startedAt = Date.now();
        const countedToolCallIds = new Set<string>();
        let toolCalls = 0;
        let warehouseQueries = 0;
        let tokens = 0;
        let finalizerModel = run.execution_context_snapshot.model;

        // Stop expanding well before the hard ceilings so the run lands a
        // report instead of being aborted mid-thought.
        const isPastSoftStop = () =>
            toolCalls >=
                budget.maxToolCalls * AI_DEEP_RESEARCH_SOFT_STOP_RATIO ||
            warehouseQueries >=
                budget.maxWarehouseQueries * AI_DEEP_RESEARCH_SOFT_STOP_RATIO ||
            Date.now() - startedAt >=
                budget.deadlineMs * AI_DEEP_RESEARCH_SOFT_STOP_RATIO;

        const trackUsage = async ({
            tokens: stepUsage,
        }: AiDeepResearchStepUsage) => {
            await this.dependencies.aiDeepResearchRunModel.accumulateTokenUsage(
                run.ai_deep_research_run_uuid,
                stepUsage,
            );
            const stepTokens = stepUsage.totalTokens ?? 0;
            tokens += stepTokens;
            if (tokens > budget.maxTokens) {
                budgetExceeded = 'maxTokens';
                const error = new Error(
                    'Deep Research exceeded its token budget',
                );
                controller.abort(error);
            }
        };
        const trackWarehouseQuery = () => {
            warehouseQueries += 1;
            if (warehouseQueries > budget.maxWarehouseQueries) {
                budgetExceeded = 'maxWarehouseQueries';
                const error = new Error(
                    'Deep Research exceeded its warehouse-query budget',
                );
                controller.abort(error);
                throw error;
            }
        };

        // Aggregate budget accounting across every phase: the run-level
        // ceilings apply to the planner, all investigators, and the judge
        // combined, regardless of the per-phase slices in their prompts.
        const recordProgress = async (
            phase: AiDeepResearchPhase,
            toolName: string,
            toolCallId: string,
        ) => {
            if (countedToolCallIds.has(toolCallId)) {
                return;
            }
            countedToolCallIds.add(toolCallId);

            const isSubmission = SUBMISSION_TOOL_NAMES.has(toolName);
            let toolCallOrdinal = toolCalls;
            let warehouseQueryOrdinal = warehouseQueries;
            if (!isSubmission) {
                toolCalls += 1;
                toolCallOrdinal = toolCalls;
                if (isDeepResearchWarehouseMcpTool(toolName)) {
                    warehouseQueries += 1;
                    warehouseQueryOrdinal = warehouseQueries;
                }
            }

            if (toolCallOrdinal > budget.maxToolCalls) {
                budgetExceeded = 'maxToolCalls';
                const error = new Error(
                    'Deep Research exceeded its tool-call budget',
                );
                controller.abort(error);
                throw error;
            }
            if (warehouseQueryOrdinal > budget.maxWarehouseQueries) {
                budgetExceeded = 'maxWarehouseQueries';
                const error = new Error(
                    'Deep Research exceeded its warehouse-query budget',
                );
                controller.abort(error);
                throw error;
            }

            const progress: AiDeepResearchProgress = {
                phase,
                activity: getActivity(toolName),
                current: toolCalls,
                total: budget.maxToolCalls,
            };
            await Promise.all([
                this.dependencies.aiDeepResearchRunModel.appendProgressEvent(
                    run.ai_deep_research_run_uuid,
                    progress,
                ),
                this.dependencies.aiDeepResearchRunModel.touch(
                    run.ai_deep_research_run_uuid,
                ),
            ]);
        };

        const makeStepProgressHandler =
            (getPhase: (toolName: string) => AiDeepResearchPhase) =>
            async (
                _progress: string,
                toolName?: string,
                toolCallId?: string,
                status: 'in_progress' | 'complete' | 'error' = 'in_progress',
            ) => {
                if (status === 'in_progress' && toolName && toolCallId) {
                    await recordProgress(
                        getPhase(toolName),
                        toolName,
                        toolCallId,
                    );
                }
            };

        // Delegation is the coordinator's choice, but the ceiling is not: the
        // cap is counted here rather than asked for in the prompt.
        let delegations = 0;
        let hadWorkerExecutionFailure = false;

        const runWorker = async (
            input: AiDeepResearchWorkerTaskInput,
        ): Promise<AiDeepResearchWorkerResult> => {
            const task = toAiDeepResearchWorkerTask(input, delegations);
            if (delegations >= AI_DEEP_RESEARCH_MAX_WORKERS) {
                return {
                    task,
                    findings: null,
                    failureReason: `This run already used its ${AI_DEEP_RESEARCH_MAX_WORKERS} delegated tasks. Investigate this question yourself.`,
                };
            }
            if (runSignal.aborted) {
                return {
                    task,
                    findings: null,
                    failureReason:
                        'Deep Research stopped before this task started',
                };
            }
            if (isPastSoftStop()) {
                return {
                    task,
                    findings: null,
                    failureReason:
                        'This run is close to its limits. Stop investigating and submit the report with what you already have.',
                };
            }
            delegations += 1;

            let findings: AiDeepResearchWorkerFindings | null = null;
            let failureReason: string | null = null;
            try {
                await this.dependencies.aiAgentService.generateAgentThreadResponse(
                    user,
                    {
                        agentUuid: run.agent_uuid,
                        threadUuid: run.ai_thread_uuid,
                        promptUuid: run.prompt_uuid,
                        autoApproveSql: true,
                        execution: {
                            mode: 'deep_research',
                            runUuid: run.ai_deep_research_run_uuid,
                            phase: 'investigating',
                            budget: workerBudget,
                            canUseRawSql:
                                run.execution_context_snapshot
                                    .effectivePermissions.canRunSql,
                            abortSignal: runSignal,
                            initialTokenUsage: 0,
                            onStepUsage: trackUsage,
                            onWarehouseQuery: trackWarehouseQuery,
                            research: {
                                role: 'worker',
                                task,
                                onFindings: (submitted) => {
                                    findings = submitted;
                                },
                            },
                            parentToolCallId: `deep-research:${run.ai_deep_research_run_uuid}:${task.id}`,
                        },
                        onStepProgress: makeStepProgressHandler(
                            () => 'investigating',
                        ),
                    },
                );
            } catch (error) {
                // A crash after the packet was submitted (budget abort,
                // provider error) still yields usable findings — keep them.
                hadWorkerExecutionFailure = true;
                failureReason = getErrorMessage(error);
            }

            if (findings) {
                return { task, findings, failureReason: null };
            }

            hadWorkerExecutionFailure = true;
            return {
                task,
                findings: null,
                failureReason:
                    failureReason ??
                    'The task ended without submitting findings',
            };
        };

        let resumeContext: string | null = null;
        const runCoordinator = () =>
            this.dependencies.aiAgentService.generateAgentThreadResponse(user, {
                agentUuid: run.agent_uuid,
                threadUuid: run.ai_thread_uuid,
                promptUuid: run.prompt_uuid,
                autoApproveSql: true,
                execution: {
                    mode: 'deep_research',
                    runUuid: run.ai_deep_research_run_uuid,
                    phase: 'planning',
                    budget,
                    canUseRawSql:
                        run.execution_context_snapshot.effectivePermissions
                            .canRunSql,
                    abortSignal: runSignal,
                    initialTokenUsage: tokens,
                    resumeContext: resumeContext ?? undefined,
                    onStepUsage: trackUsage,
                    onWarehouseQuery: trackWarehouseQuery,
                    onExecutionContextResolved: async (snapshot) => {
                        finalizerModel = snapshot.model;
                        await this.dependencies.aiDeepResearchRunModel.updateExecutionContextSnapshot(
                            run.ai_deep_research_run_uuid,
                            snapshot,
                        );
                    },
                    research: { role: 'coordinator', runTask: runWorker },
                },
                onStepProgress: makeStepProgressHandler(getCoordinatorPhase),
            });

        /**
         * The report is always written here, from evidence the server rebuilt
         * out of the run's own executions — never by the research loop and
         * never by replaying its conversation. So a run that was cut off
         * mid-investigation reports exactly like one that finished, and
         * finalization costs the same either way.
         */
        const finalize = async (reason: string) => {
            let evidencePack: AiDeepResearchEvidencePack | null = null;
            const attemptFinalization = async (
                attempt: number,
            ): Promise<
                | { outcome: 'reported'; report: AiDeepResearchSubmittedReport }
                | { outcome: 'failed' }
                | { outcome: 'no_relevant_data' }
            > => {
                try {
                    const evidenceBuild =
                        await this.dependencies.buildEvidencePack(run);
                    evidencePack = evidenceBuild.evidencePack;
                    if (isAiDeepResearchEvidencePackEmpty(evidencePack)) {
                        if (
                            hadWorkerExecutionFailure ||
                            evidenceBuild.hasEvidenceBuildFailures
                        ) {
                            return { outcome: 'failed' } as const;
                        }
                        return { outcome: 'no_relevant_data' } as const;
                    }
                    const report =
                        await this.dependencies.aiAgentService.generateDeepResearchReport(
                            user,
                            {
                                agentUuid: run.agent_uuid,
                                threadUuid: run.ai_thread_uuid,
                                evidencePack,
                                reason,
                                model: finalizerModel,
                            },
                        );
                    return { outcome: 'reported', report } as const;
                } catch (error) {
                    Logger.warn(
                        `[AiDeepResearch] Could not finalize run ${run.ai_deep_research_run_uuid}${attempt === 0 ? '; retrying' : ''}: ${getErrorMessage(error)}`,
                    );
                    if (attempt === 0) {
                        await sleep(FINALIZATION_RETRY_DELAY_MS);
                        return attemptFinalization(attempt + 1);
                    }
                    throw error;
                }
            };

            try {
                return await attemptFinalization(0);
            } catch {
                if (
                    evidencePack &&
                    !isAiDeepResearchEvidencePackEmpty(evidencePack)
                ) {
                    return {
                        outcome: 'checkpointed',
                        report: getEvidenceCheckpointReport(
                            evidencePack,
                            reason,
                        ),
                    } as const;
                }
                return { outcome: 'failed' } as const;
            }
        };

        let executionError: unknown = null;
        if (run.resume_from_run_uuid) {
            const sourceRun =
                await this.dependencies.aiDeepResearchRunModel.findByUuid(
                    run.resume_from_run_uuid,
                );
            if (sourceRun) {
                const sourceEvidence =
                    await this.dependencies.buildEvidencePack(sourceRun);
                resumeContext = getResumeContext(sourceEvidence.evidencePack);
            }
        }
        try {
            await runCoordinator();
        } catch (error) {
            executionError = error;
        } finally {
            clearTimeout(deadline);
        }

        // Cancellation is the user's decision to stop; everything else still
        // owes a report.
        const finalization =
            cancelledByUser || signal.aborted || authorizationRevokedReason
                ? null
                : await finalize(
                      budgetExceeded
                          ? `the ${budgetExceeded} budget was exhausted`
                          : 'the investigation ran to completion',
                  );
        const finalizedReport =
            finalization?.outcome === 'reported' ||
            finalization?.outcome === 'checkpointed'
                ? finalization.report
                : null;
        await stopRunMonitor();

        if (cancelledByUser || signal.aborted) {
            return {
                status: 'cancelled',
                terminalReason: cancelledByUser
                    ? 'user_cancellation'
                    : 'internal_error',
                failureStage: 'investigation',
            };
        }
        if (authorizationRevokedReason) {
            return {
                status: 'failed',
                errorMessage: authorizationRevokedReason,
                terminalReason: 'permission_revoked',
                failureStage: 'authorization',
            };
        }

        // Charts cite executions from anywhere in the run — the coordinator's
        // calls are top-level, a worker's are subagent children.
        const queryUuids = getQueryUuids(
            await this.getProvenance(run.prompt_uuid, {
                includeSubagentToolCalls: true,
            }),
        );

        if (budgetExceeded) {
            return {
                status: 'partially_completed',
                report:
                    finalizedReport ??
                    getPartialReport(
                        run,
                        `The ${budgetExceeded} budget was exhausted.`,
                    ),
                warehouseQueryUuids: queryUuids,
                terminalReason: {
                    maxTokens: 'token_limit' as const,
                    maxToolCalls: 'tool_limit' as const,
                    maxWarehouseQueries: 'query_limit' as const,
                    deadlineMs: 'time_limit' as const,
                }[budgetExceeded],
                failureStage: 'investigation',
            };
        }
        if (finalization?.outcome === 'checkpointed') {
            return {
                status: 'partially_completed',
                report: finalization.report,
                warehouseQueryUuids: queryUuids,
                terminalReason: 'provider_error',
                failureStage: 'finalization',
            };
        }
        if (executionError) {
            // Research that produced evidence still reports, even when the
            // loop itself ended badly.
            if (finalizedReport) {
                return {
                    status: 'partially_completed',
                    report: finalizedReport,
                    warehouseQueryUuids: queryUuids,
                    terminalReason: 'provider_error',
                    failureStage: 'investigation',
                };
            }
            return {
                status: 'failed',
                errorMessage: getErrorMessage(executionError),
                terminalReason: 'provider_error',
                failureStage: 'investigation',
            };
        }
        if (finalization?.outcome === 'no_relevant_data') {
            return {
                status: 'failed',
                errorMessage: AI_DEEP_RESEARCH_NO_RELEVANT_DATA_ERROR_MESSAGE,
                terminalReason: 'no_relevant_data',
                failureStage: 'finalization',
            };
        }
        if (!finalizedReport) {
            return {
                status: 'failed',
                errorMessage:
                    'Deep Research finished without producing a report',
                terminalReason: 'provider_error',
                failureStage: 'finalization',
            };
        }

        return {
            status: 'completed',
            report: finalizedReport,
            warehouseQueryUuids: queryUuids,
            terminalReason: null,
        };
    };
}
