import {
    AI_DEEP_RESEARCH_MAX_WORKERS,
    AI_DEEP_RESEARCH_SOFT_STOP_RATIO,
    getErrorMessage,
    toAiDeepResearchWorkerTask,
    type AiAgentToolCall,
    type AiAgentToolResult,
    type AiDeepResearchActivity,
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
    AI_DEEP_RESEARCH_FINALIZE_DEADLINE_MS,
    AI_DEEP_RESEARCH_FINALIZE_MAX_STEPS,
    AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    AI_DEEP_RESEARCH_WORKER_FINDINGS_TOOL_NAME,
    getAiDeepResearchWorkerBudget,
    parseAiDeepResearchReport,
} from './AiDeepResearchAgent';
import {
    getAiDeepResearchRunBudget,
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
const SUBMISSION_TOOL_NAMES = new Set([
    AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    AI_DEEP_RESEARCH_WORKER_FINDINGS_TOOL_NAME,
]);

type ToolProvenance = {
    toolCall: AiAgentToolCall;
    toolResult: AiAgentToolResult | null;
};

type Dependencies = {
    aiAgentService: Pick<
        AiAgentService,
        'assertDeepResearchAccess' | 'generateAgentThreadResponse'
    >;
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

const parseJson = (value: string): unknown => {
    try {
        return JSON.parse(value) as unknown;
    } catch {
        return value;
    }
};

const findStringValues = (value: unknown, key: string): string[] => {
    if (Array.isArray(value)) {
        return value.flatMap((item) => findStringValues(item, key));
    }
    if (value === null || typeof value !== 'object') {
        return [];
    }

    return Object.entries(value).flatMap(([entryKey, entryValue]) => [
        ...(entryKey === key && typeof entryValue === 'string'
            ? [entryValue]
            : []),
        ...findStringValues(entryValue, key),
    ]);
};

const getQueryUuids = (provenance: ToolProvenance[]): string[] => [
    ...new Set(
        provenance.flatMap(({ toolResult }) =>
            toolResult && isDeepResearchWarehouseTool(toolResult.toolName)
                ? findStringValues(parseJson(toolResult.result), 'queryUuid')
                : [],
        ),
    ),
];

const getLatestReport = (
    provenance: ToolProvenance[],
): AiDeepResearchSubmittedReport | null => {
    const submissions = provenance.filter(
        ({ toolCall }) =>
            toolCall.toolName === AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    );
    for (let index = submissions.length - 1; index >= 0; index -= 1) {
        try {
            return parseAiDeepResearchReport(
                submissions[index].toolCall.toolArgs,
            );
        } catch {
            // Invalid drafts are returned to the model for correction.
        }
    }
    return null;
};

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
    charts: [],
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
            };
        }

        const account =
            await this.dependencies.userService.getAccountByUserUuidAndOrg(
                run.created_by_user_uuid,
                run.organization_uuid,
            );
        const user: SessionUser = toSessionUser(account);
        if (!user.isActive && !user.serviceAccount) {
            return {
                status: 'failed',
                errorMessage:
                    'Deep Research cannot run because its creator is inactive',
                terminalReason: 'permission_revoked',
            };
        }
        try {
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
            return {
                status: 'failed',
                errorMessage: getErrorMessage(error),
                terminalReason: 'permission_revoked',
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
                failureReason = getErrorMessage(error);
            }

            return findings
                ? { task, findings, failureReason: null }
                : {
                      task,
                      findings: null,
                      failureReason:
                          failureReason ??
                          'The task ended without submitting findings',
                  };
        };

        const runCoordinator = (forceSubmission: boolean) =>
            this.dependencies.aiAgentService.generateAgentThreadResponse(user, {
                agentUuid: run.agent_uuid,
                threadUuid: run.ai_thread_uuid,
                promptUuid: run.prompt_uuid,
                autoApproveSql: true,
                ...(forceSubmission
                    ? {
                          toolHints: [AI_DEEP_RESEARCH_REPORT_TOOL_NAME],
                          forceToolHints: true,
                      }
                    : {}),
                execution: {
                    mode: 'deep_research',
                    runUuid: run.ai_deep_research_run_uuid,
                    phase: 'planning',
                    budget,
                    abortSignal: runSignal,
                    initialTokenUsage: tokens,
                    onStepUsage: trackUsage,
                    onWarehouseQuery: trackWarehouseQuery,
                    onExecutionContextResolved: (snapshot) =>
                        this.dependencies.aiDeepResearchRunModel.updateExecutionContextSnapshot(
                            run.ai_deep_research_run_uuid,
                            snapshot,
                        ),
                    research: { role: 'coordinator', runTask: runWorker },
                },
                onStepProgress: makeStepProgressHandler(getCoordinatorPhase),
            });

        /**
         * The research budget is spent, but the run still owes the user a
         * report. This pass is deliberately outside that budget and off the
         * aborted signal — otherwise the one case that most needs a report
         * (a run cut off mid-investigation) is the one case that never writes
         * one.
         */
        const finalize = async (reason: string) => {
            const finalizeController = new AbortController();
            const finalizeDeadline = setTimeout(
                () =>
                    finalizeController.abort(
                        new Error('Deep Research could not finalize in time'),
                    ),
                AI_DEEP_RESEARCH_FINALIZE_DEADLINE_MS,
            );
            finalizeDeadline.unref();
            try {
                await this.dependencies.aiAgentService.generateAgentThreadResponse(
                    user,
                    {
                        agentUuid: run.agent_uuid,
                        threadUuid: run.ai_thread_uuid,
                        promptUuid: run.prompt_uuid,
                        autoApproveSql: true,
                        toolHints: [AI_DEEP_RESEARCH_REPORT_TOOL_NAME],
                        forceToolHints: true,
                        execution: {
                            mode: 'deep_research',
                            runUuid: run.ai_deep_research_run_uuid,
                            phase: 'synthesizing',
                            budget: {
                                ...budget,
                                maxSteps: AI_DEEP_RESEARCH_FINALIZE_MAX_STEPS,
                            },
                            abortSignal: AbortSignal.any([
                                signal,
                                finalizeController.signal,
                            ]),
                            initialTokenUsage: tokens,
                            onStepUsage: trackUsage,
                            research: { role: 'finalizer', reason },
                        },
                        onStepProgress: makeStepProgressHandler(
                            () => 'synthesizing',
                        ),
                    },
                );
            } catch (error) {
                Logger.warn(
                    `[AiDeepResearch] Could not finalize run ${run.ai_deep_research_run_uuid}: ${getErrorMessage(error)}`,
                );
            } finally {
                clearTimeout(finalizeDeadline);
            }
        };

        let executionError: unknown = null;
        try {
            await runCoordinator(false);
            if (
                !getLatestReport(await this.getProvenance(run.prompt_uuid)) &&
                !runSignal.aborted
            ) {
                await runCoordinator(true);
            }
        } catch (error) {
            executionError = error;
        } finally {
            clearTimeout(deadline);
        }

        // Cancellation is the user's decision to stop; everything else still
        // owes a report.
        if (
            !cancelledByUser &&
            !signal.aborted &&
            !authorizationRevokedReason &&
            !getLatestReport(await this.getProvenance(run.prompt_uuid))
        ) {
            await finalize(
                budgetExceeded
                    ? `the ${budgetExceeded} budget was exhausted`
                    : 'the investigation stopped early',
            );
        }
        await stopRunMonitor();

        if (cancelledByUser || signal.aborted) {
            return {
                status: 'cancelled',
                terminalReason: cancelledByUser
                    ? 'user_cancellation'
                    : 'internal_error',
            };
        }
        if (authorizationRevokedReason) {
            return {
                status: 'failed',
                errorMessage: authorizationRevokedReason,
                terminalReason: 'permission_revoked',
            };
        }

        // Chart evidence (queryUuids) lives in investigator subagent child
        // rows; the report itself is the judge's top-level submission.
        const provenance = await this.getProvenance(run.prompt_uuid, {
            includeSubagentToolCalls: true,
        });
        const queryUuids = getQueryUuids(provenance);
        const report = getLatestReport(provenance);

        if (budgetExceeded) {
            return {
                status: 'partially_completed',
                report:
                    report ??
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
            };
        }
        if (executionError) {
            if (report) {
                return {
                    status: 'partially_completed',
                    report,
                    warehouseQueryUuids: queryUuids,
                    terminalReason: 'provider_error',
                };
            }
            return {
                status: 'failed',
                errorMessage: getErrorMessage(executionError),
                terminalReason: 'provider_error',
            };
        }
        if (!report) {
            return {
                status: 'failed',
                errorMessage:
                    'Deep Research finished without submitting a report',
                terminalReason: 'provider_error',
            };
        }

        return {
            status: 'completed',
            report,
            warehouseQueryUuids: queryUuids,
            terminalReason: null,
        };
    };
}
