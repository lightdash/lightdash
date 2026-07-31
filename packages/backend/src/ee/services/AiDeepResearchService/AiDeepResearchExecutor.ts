import {
    aiDeepResearchChartDefinitionSchema,
    getErrorMessage,
    toolRunQueryArgsSchema,
    type AiAgentToolCall,
    type AiAgentToolResult,
    type AiDeepResearchActivity,
    type AiDeepResearchHypothesis,
    type AiDeepResearchInvestigation,
    type AiDeepResearchInvestigationReport,
    type AiDeepResearchPhase,
    type AiDeepResearchProgress,
    type AiDeepResearchSubmittedReport,
    type AiDeepResearchWarehouseChart,
    type SessionUser,
} from '@lightdash/common';
import Logger from '../../../logging/logger';
import type { UserService } from '../../../services/UserService';
import type { DbAiDeepResearchRun } from '../../database/entities/aiDeepResearch';
import type { AiAgentModel } from '../../models/AiAgentModel';
import type { AiDeepResearchRunModel } from '../../models/AiDeepResearchRunModel';
import type { AiDeepResearchStepUsage } from '../ai/types/aiAgent';
import type { AiAgentService } from '../AiAgentService/AiAgentService';
import {
    AI_DEEP_RESEARCH_HYPOTHESES_TOOL_NAME,
    AI_DEEP_RESEARCH_INVESTIGATION_TOOL_NAME,
    AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    getAiDeepResearchPhaseBudgets,
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
    AI_DEEP_RESEARCH_HYPOTHESES_TOOL_NAME,
    AI_DEEP_RESEARCH_INVESTIGATION_TOOL_NAME,
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
    userService: Pick<UserService, 'getSessionByUserUuidAndOrg'>;
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
                ? [
                      ...findStringValues(
                          parseJson(toolResult.result),
                          'queryUuid',
                      ),
                      ...findStringValues(toolResult.metadata, 'queryUuid'),
                  ]
                : [],
        ),
    ),
];

const getChartCandidates = (
    provenance: ToolProvenance[],
): AiDeepResearchWarehouseChart[] => {
    const candidates = provenance.flatMap(({ toolCall, toolResult }) => {
        if (
            toolCall.toolName !== 'generateVisualization' ||
            toolResult?.metadata?.status !== 'success'
        ) {
            return [];
        }

        const queryUuid = findStringValues(toolResult.metadata, 'queryUuid')[0];
        const toolArgs = toolRunQueryArgsSchema.safeParse(toolCall.toolArgs);
        if (!queryUuid || !toolArgs.success || !toolArgs.data.chartConfig) {
            return [];
        }

        const chart = aiDeepResearchChartDefinitionSchema.safeParse({
            source: 'warehouse',
            queryUuid,
            title: toolArgs.data.title,
            chartConfig: {
                ...toolArgs.data.chartConfig,
                defaultVizType: toolArgs.data.chartConfig.groupBy?.length
                    ? 'table'
                    : toolArgs.data.chartConfig.defaultVizType,
                groupBy: null,
                funnelDataInput: null,
                stackBars: toolArgs.data.chartConfig.groupBy?.length
                    ? null
                    : toolArgs.data.chartConfig.stackBars,
            },
        });

        return chart.success && chart.data.source === 'warehouse'
            ? [chart.data]
            : [];
    });

    return [
        ...new Map(
            candidates.map((candidate) => [candidate.queryUuid, candidate]),
        ).values(),
    ];
};

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
                .getSessionByUserUuidAndOrg(
                    run.created_by_user_uuid,
                    run.organization_uuid,
                )
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

        const user: SessionUser =
            await this.dependencies.userService.getSessionByUserUuidAndOrg(
                run.created_by_user_uuid,
                run.organization_uuid,
            );
        if (!user.isActive) {
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
        const phaseBudgets = getAiDeepResearchPhaseBudgets(budget);
        const controller = new AbortController();
        let cancelledByUser = false;
        let authorizationRevokedReason: string | null = null;
        let budgetExceeded:
            | 'maxTokens'
            | 'maxToolCalls'
            | 'maxWarehouseQueries'
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
        const runSignal = AbortSignal.any([signal, controller.signal]);
        const countedToolCallIds = new Set<string>();
        let toolCalls = 0;
        let warehouseQueries = 0;
        let tokens = 0;

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
            (phase: AiDeepResearchPhase) =>
            async (
                _progress: string,
                toolName?: string,
                toolCallId?: string,
                status: 'in_progress' | 'complete' | 'error' = 'in_progress',
            ) => {
                if (status === 'in_progress' && toolName && toolCallId) {
                    await recordProgress(phase, toolName, toolCallId);
                }
            };

        const runPlanner = async (): Promise<
            AiDeepResearchHypothesis[] | null
        > => {
            let hypotheses: AiDeepResearchHypothesis[] | null = null;
            await this.dependencies.aiAgentService.generateAgentThreadResponse(
                user,
                {
                    agentUuid: run.agent_uuid,
                    threadUuid: run.ai_thread_uuid,
                    promptUuid: run.prompt_uuid,
                    autoApproveSql: true,
                    toolHints: [AI_DEEP_RESEARCH_HYPOTHESES_TOOL_NAME],
                    forceToolHints: true,
                    execution: {
                        mode: 'deep_research',
                        runUuid: run.ai_deep_research_run_uuid,
                        phase: 'planning',
                        budget: phaseBudgets.planner,
                        abortSignal: runSignal,
                        initialTokenUsage: 0,
                        onStepUsage: trackUsage,
                        onWarehouseQuery: trackWarehouseQuery,
                        research: {
                            role: 'planner',
                            maxHypotheses: budget.maxHypotheses,
                            onHypotheses: (planned) => {
                                hypotheses = planned;
                            },
                        },
                        parentToolCallId: `deep-research:${run.ai_deep_research_run_uuid}:planner`,
                    },
                    onStepProgress: makeStepProgressHandler('planning'),
                },
            );
            return hypotheses;
        };

        const runInvestigator = async (
            hypothesis: AiDeepResearchHypothesis,
            index: number,
        ): Promise<AiDeepResearchInvestigationReport> => {
            if (runSignal.aborted) {
                throw new Error(
                    'Deep Research stopped before this investigation started',
                );
            }
            let report: AiDeepResearchInvestigationReport | null = null;
            const invoke = (forceSubmission: boolean) =>
                this.dependencies.aiAgentService.generateAgentThreadResponse(
                    user,
                    {
                        agentUuid: run.agent_uuid,
                        threadUuid: run.ai_thread_uuid,
                        promptUuid: run.prompt_uuid,
                        autoApproveSql: true,
                        ...(forceSubmission
                            ? {
                                  toolHints: [
                                      AI_DEEP_RESEARCH_INVESTIGATION_TOOL_NAME,
                                  ],
                                  forceToolHints: true,
                              }
                            : {}),
                        execution: {
                            mode: 'deep_research',
                            runUuid: run.ai_deep_research_run_uuid,
                            phase: 'investigating',
                            budget: phaseBudgets.investigator,
                            abortSignal: runSignal,
                            initialTokenUsage: 0,
                            onStepUsage: trackUsage,
                            onWarehouseQuery: trackWarehouseQuery,
                            ...(index === 0
                                ? {
                                      onExecutionContextResolved: (snapshot) =>
                                          this.dependencies.aiDeepResearchRunModel.updateExecutionContextSnapshot(
                                              run.ai_deep_research_run_uuid,
                                              snapshot,
                                          ),
                                  }
                                : {}),
                            research: {
                                role: 'investigator',
                                hypothesis,
                                onReport: (submitted) => {
                                    report = submitted;
                                },
                            },
                            parentToolCallId: `deep-research:${run.ai_deep_research_run_uuid}:${hypothesis.id}`,
                        },
                        onStepProgress:
                            makeStepProgressHandler('investigating'),
                    },
                );

            // A crash after the report was submitted (budget abort, provider
            // error) still yields a usable investigation — keep the report.
            const attempt = async (forceSubmission: boolean) => {
                try {
                    await invoke(forceSubmission);
                } catch (error) {
                    if (!report) {
                        throw error;
                    }
                }
            };

            await attempt(false);
            if (!report && !runSignal.aborted) {
                await attempt(true);
            }
            if (!report) {
                throw new Error(
                    'The investigation ended without submitting a report',
                );
            }
            return report;
        };

        const runJudge = async (
            investigations: AiDeepResearchInvestigation[],
            chartCandidates: AiDeepResearchWarehouseChart[],
            forceSubmission: boolean,
        ) =>
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
                    phase: 'synthesizing',
                    budget: phaseBudgets.judge,
                    abortSignal: runSignal,
                    initialTokenUsage: tokens,
                    onStepUsage: trackUsage,
                    onWarehouseQuery: trackWarehouseQuery,
                    research: {
                        role: 'judge',
                        investigations,
                        chartCandidates,
                    },
                },
                onStepProgress: makeStepProgressHandler('synthesizing'),
            });

        let executionError: unknown = null;
        let investigations: AiDeepResearchInvestigation[] = [];
        try {
            const hypotheses = await runPlanner();
            if (!hypotheses && !runSignal.aborted) {
                throw new Error(
                    'Deep Research could not produce competing hypotheses to investigate',
                );
            }

            if (hypotheses && !runSignal.aborted) {
                // Deterministic fan-out: every investigator starts here, in
                // parallel — never at the model's discretion.
                const settled = await Promise.allSettled(
                    hypotheses.map((hypothesis, index) =>
                        runInvestigator(hypothesis, index),
                    ),
                );
                investigations = hypotheses.map((hypothesis, index) => {
                    const outcome = settled[index];
                    return outcome.status === 'fulfilled'
                        ? {
                              hypothesis,
                              report: outcome.value,
                              failureReason: null,
                          }
                        : {
                              hypothesis,
                              report: null,
                              failureReason: getErrorMessage(outcome.reason),
                          };
                });

                const completed = investigations.filter(
                    (investigation) => investigation.report !== null,
                );
                if (completed.length < 2 && !runSignal.aborted) {
                    const failureSummary = investigations
                        .filter(
                            (investigation) =>
                                investigation.failureReason !== null,
                        )
                        .map(
                            (investigation) =>
                                `${investigation.hypothesis.id}: ${investigation.failureReason}`,
                        )
                        .join('; ');
                    throw new Error(
                        `Deep Research completed only ${completed.length} of ${hypotheses.length} hypothesis investigations, but comparing hypotheses requires at least two (${failureSummary})`,
                    );
                }

                if (!runSignal.aborted) {
                    const investigationProvenance = await this.getProvenance(
                        run.prompt_uuid,
                        { includeSubagentToolCalls: true },
                    );
                    const chartCandidates = getChartCandidates(
                        investigationProvenance,
                    );
                    await runJudge(investigations, chartCandidates, false);
                    const judgedReport = getLatestReport(
                        await this.getProvenance(run.prompt_uuid),
                    );
                    if (!judgedReport && !runSignal.aborted) {
                        await runJudge(investigations, chartCandidates, true);
                    }
                }
            }
        } catch (error) {
            executionError = error;
        } finally {
            await stopRunMonitor();
        }

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
