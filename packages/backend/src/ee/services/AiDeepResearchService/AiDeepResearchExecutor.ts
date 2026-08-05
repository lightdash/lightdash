import {
    AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    aiDeepResearchReportSchema,
    getErrorMessage,
    type AiAgentToolCall,
    type AiAgentToolResult,
    type AiDeepResearchActivity,
    type AiDeepResearchProgress,
    type AiDeepResearchSubmittedReport,
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
            return aiDeepResearchReportSchema.parse(
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
    if (toolName === AI_DEEP_RESEARCH_REPORT_TOOL_NAME) {
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

    private async getProvenance(promptUuid: string): Promise<ToolProvenance[]> {
        return (
            await this.dependencies.aiAgentModel.getToolCallsAndResultsForPrompt(
                promptUuid,
                { includeSubagentToolCalls: true },
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

        const recordProgress = async (toolName: string, toolCallId: string) => {
            if (countedToolCallIds.has(toolCallId)) {
                return;
            }
            countedToolCallIds.add(toolCallId);

            const isSubmission = toolName === AI_DEEP_RESEARCH_REPORT_TOOL_NAME;
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

        const handleStepProgress = async (
            _progress: string,
            toolName?: string,
            toolCallId?: string,
            status: 'in_progress' | 'complete' | 'error' = 'in_progress',
        ) => {
            if (status === 'in_progress' && toolName && toolCallId) {
                await recordProgress(toolName, toolCallId);
            }
        };

        const runResearch = async (forceSubmission: boolean) =>
            this.dependencies.aiAgentService.generateAgentThreadResponse(user, {
                agentUuid: run.agent_uuid,
                threadUuid: run.ai_thread_uuid,
                promptUuid: run.prompt_uuid,
                autoApproveSql: true,
                includeSubagentToolCalls: forceSubmission,
                ...(forceSubmission
                    ? {
                          toolHints: [AI_DEEP_RESEARCH_REPORT_TOOL_NAME],
                          forceToolHints: true,
                      }
                    : {}),
                execution: {
                    mode: 'deep_research',
                    runUuid: run.ai_deep_research_run_uuid,
                    budget,
                    abortSignal: runSignal,
                    initialTokenUsage: tokens,
                    onStepUsage: trackUsage,
                    onWarehouseQuery: trackWarehouseQuery,
                    ...(!forceSubmission
                        ? {
                              onExecutionContextResolved: (snapshot) =>
                                  this.dependencies.aiDeepResearchRunModel.updateExecutionContextSnapshot(
                                      run.ai_deep_research_run_uuid,
                                      snapshot,
                                  ),
                          }
                        : {}),
                },
                onStepProgress: handleStepProgress,
            });

        const hasReport = async () =>
            getLatestReport(await this.getProvenance(run.prompt_uuid)) !== null;

        let executionError: unknown = null;
        try {
            await runResearch(false);
            if (!(await hasReport()) && !runSignal.aborted) {
                await runResearch(true);
            }
            if (!(await hasReport()) && !runSignal.aborted) {
                throw new Error(
                    'Deep Research finished without submitting a report',
                );
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

        const provenance = await this.getProvenance(run.prompt_uuid);
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
