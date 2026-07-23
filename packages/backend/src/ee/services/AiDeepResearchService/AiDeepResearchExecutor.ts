import {
    getErrorMessage,
    type AiAgentToolCall,
    type AiAgentToolResult,
    type AiDeepResearchActivity,
    type AiDeepResearchProgress,
    type AiDeepResearchSubmittedReport,
    type SessionUser,
} from '@lightdash/common';
import Logger from '../../../logging/logger';
import type { UserService } from '../../../services/UserService';
import type { DbAiDeepResearchRun } from '../../database/entities/aiDeepResearch';
import type { AiAgentModel } from '../../models/AiAgentModel';
import type { AiDeepResearchRunModel } from '../../models/AiDeepResearchRunModel';
import type { AiAgentService } from '../AiAgentService/AiAgentService';
import {
    AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    parseAiDeepResearchReport,
} from './AiDeepResearchAgent';
import type {
    AiDeepResearchExecutor as AiDeepResearchExecutorFn,
    AiDeepResearchExecutorResult,
} from './AiDeepResearchService';

const CANCELLATION_POLL_INTERVAL_MS = 1_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const ACCESS_RECHECK_INTERVAL_MS = 15_000;
const WAREHOUSE_TOOL_NAMES = new Set([
    'generateVisualization',
    'runContentQuery',
    'runSavedChart',
    'runSql',
    'searchFieldValues',
]);
const WAREHOUSE_MCP_TOOL_RE =
    /__(?:run_metric_query|run_sql|search_field_values)(?:_\d+)?$/;

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
        | 'touch'
        | 'updateExecutionContextSnapshot'
    >;
    userService: Pick<UserService, 'getSessionByUserUuidAndOrg'>;
};

const isWarehouseTool = (toolName: string): boolean =>
    WAREHOUSE_TOOL_NAMES.has(toolName) || WAREHOUSE_MCP_TOOL_RE.test(toolName);

const isWarehouseMcpTool = (toolName: string): boolean =>
    WAREHOUSE_MCP_TOOL_RE.test(toolName);

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
            toolResult && isWarehouseTool(toolResult.toolName)
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

- Run Deep Research again with a larger depth to continue investigating: ${run.prompt}`,
    charts: [],
});

const getActivity = (toolName: string): AiDeepResearchActivity => {
    if (toolName === AI_DEEP_RESEARCH_REPORT_TOOL_NAME) {
        return 'reporting';
    }
    if (isWarehouseTool(toolName)) {
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

    private async getProvenance(promptUuid: string): Promise<ToolProvenance[]> {
        return (
            await this.dependencies.aiAgentModel.getToolCallsAndResultsForPrompt(
                promptUuid,
            )
        ).map(({ toolCall, toolResult }) => ({ toolCall, toolResult }));
    }

    execute: AiDeepResearchExecutorFn = async (
        run,
        { signal },
    ): Promise<AiDeepResearchExecutorResult> => {
        if (signal.aborted || run.cancellation_requested_at) {
            return { status: 'cancelled' };
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
            };
        }
        const controller = new AbortController();
        let cancelledByUser = false;
        let authorizationRevokedReason: string | null = null;
        let budgetExceeded:
            | keyof DbAiDeepResearchRun['budget_snapshot']
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

        const recordProgress = async (toolName: string, toolCallId: string) => {
            if (countedToolCallIds.has(toolCallId)) {
                return;
            }
            countedToolCallIds.add(toolCallId);

            const isReport = toolName === AI_DEEP_RESEARCH_REPORT_TOOL_NAME;
            let toolCallOrdinal = toolCalls;
            let warehouseQueryOrdinal = warehouseQueries;
            if (!isReport) {
                toolCalls += 1;
                toolCallOrdinal = toolCalls;
                if (isWarehouseMcpTool(toolName)) {
                    warehouseQueries += 1;
                    warehouseQueryOrdinal = warehouseQueries;
                }
            }

            if (toolCallOrdinal > run.budget_snapshot.maxToolCalls) {
                budgetExceeded = 'maxToolCalls';
                const error = new Error(
                    'Deep Research exceeded its tool-call budget',
                );
                controller.abort(error);
                throw error;
            }
            if (
                warehouseQueryOrdinal > run.budget_snapshot.maxWarehouseQueries
            ) {
                budgetExceeded = 'maxWarehouseQueries';
                const error = new Error(
                    'Deep Research exceeded its warehouse-query budget',
                );
                controller.abort(error);
                throw error;
            }

            const progress: AiDeepResearchProgress = {
                phase: isReport ? 'synthesizing' : 'investigating',
                activity: getActivity(toolName),
                current: toolCalls,
                total: run.budget_snapshot.maxToolCalls,
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

        let executionError: unknown = null;
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
                        budget: run.budget_snapshot,
                        selectedMcpServerUuids: run.selected_mcp_server_uuids,
                        abortSignal: runSignal,
                        onStepUsage: (stepTokens) => {
                            tokens += stepTokens;
                            if (tokens > run.budget_snapshot.maxTokens) {
                                budgetExceeded = 'maxTokens';
                                controller.abort(
                                    new Error(
                                        'Deep Research exceeded its token budget',
                                    ),
                                );
                                throw new Error(
                                    'Deep Research exceeded its token budget',
                                );
                            }
                        },
                        onWarehouseQuery: () => {
                            warehouseQueries += 1;
                            if (
                                warehouseQueries >
                                run.budget_snapshot.maxWarehouseQueries
                            ) {
                                budgetExceeded = 'maxWarehouseQueries';
                                const error = new Error(
                                    'Deep Research exceeded its warehouse-query budget',
                                );
                                controller.abort(error);
                                throw error;
                            }
                        },
                        onExecutionContextResolved: (snapshot) =>
                            this.dependencies.aiDeepResearchRunModel.updateExecutionContextSnapshot(
                                run.ai_deep_research_run_uuid,
                                snapshot,
                            ),
                    },
                    onStepProgress: async (
                        _progress,
                        toolName,
                        toolCallId,
                        status = 'in_progress',
                    ) => {
                        if (
                            status === 'in_progress' &&
                            toolName &&
                            toolCallId
                        ) {
                            await recordProgress(toolName, toolCallId);
                        }
                    },
                },
            );
        } catch (error) {
            executionError = error;
        } finally {
            await stopRunMonitor();
        }

        if (cancelledByUser || signal.aborted) {
            return { status: 'cancelled' };
        }
        if (authorizationRevokedReason) {
            return {
                status: 'failed',
                errorMessage: authorizationRevokedReason,
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
            };
        }
        if (executionError) {
            if (report) {
                return {
                    status: 'partially_completed',
                    report,
                    warehouseQueryUuids: queryUuids,
                };
            }
            return {
                status: 'failed',
                errorMessage: getErrorMessage(executionError),
            };
        }
        if (!report) {
            return {
                status: 'failed',
                errorMessage:
                    'Deep Research finished without submitting a report',
            };
        }

        return {
            status: 'completed',
            report,
            warehouseQueryUuids: queryUuids,
        };
    };
}
