import {
    RequestMethod,
    type AiDeepResearchActivity,
    type AiDeepResearchProgress,
} from '@lightdash/common';
import { fromSession } from '../../../auth/account';
import type { LightdashConfig } from '../../../config/parseConfig';
import Logger from '../../../logging/logger';
import type { PersonalAccessTokenService } from '../../../services/PersonalAccessTokenService';
import type { UserService } from '../../../services/UserService';
import type {
    AiDeepResearchClient,
    AiDeepResearchProgressEvent,
} from '../../clients/AiDeepResearchClient';
import type { DbAiDeepResearchRun } from '../../database/entities/aiDeepResearch';
import type { AiAgentModel } from '../../models/AiAgentModel';
import type { AiDeepResearchRunModel } from '../../models/AiDeepResearchRunModel';
import {
    AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    getAiDeepResearchAgent,
    parseAiDeepResearchReport,
    type AiDeepResearchSubmittedReport,
} from './AiDeepResearchAgent';
import type {
    AiDeepResearchExecutor as AiDeepResearchExecutorFn,
    AiDeepResearchExecutorResult,
} from './AiDeepResearchService';

const CANCELLATION_POLL_INTERVAL_MS = 1_000;
const INTERRUPT_TIMEOUT_MS = 30_000;
const MAX_CHAT_CONTEXT_CHARS = 12_000;
const MAX_CHAT_CONTEXT_TURNS = 6;
const MAX_CHAT_MESSAGE_CHARS = 2_000;
const WAREHOUSE_TOOL_NAMES = new Set(['run_metric_query', 'get_query_result']);
const WAREHOUSE_QUERY_TOOL_NAMES = new Set(['run_metric_query']);

type Dependencies = {
    lightdashConfig: LightdashConfig;
    aiAgentModel: Pick<
        AiAgentModel,
        'findThreadOwnership' | 'getThreadMessages'
    >;
    aiDeepResearchClient: Pick<AiDeepResearchClient, 'runSession'>;
    aiDeepResearchRunModel: Pick<
        AiDeepResearchRunModel,
        'appendProgressEvent' | 'findByUuid' | 'setClaudeSessionId' | 'touch'
    >;
    personalAccessTokenService: Pick<
        PersonalAccessTokenService,
        'createPersonalAccessToken' | 'deletePersonalAccessToken'
    >;
    userService: Pick<UserService, 'getSessionByUserUuidAndOrg'>;
};

type BudgetState = {
    toolCalls: number;
    warehouseQueries: number;
    tokens: number;
    exceeded: keyof DbAiDeepResearchRun['budget_snapshot'] | null;
};

const getMcpServerUrl = (siteUrl: string): string => {
    const url = new URL('/api/v1/mcp', siteUrl);
    return url.toString();
};

const getPartialReportMarkdown = (
    run: DbAiDeepResearchRun,
    reason: string,
): string => `The investigation stopped before it could produce a full report.

<warning title="Incomplete investigation">

${reason}

</warning>

## Conclusion

- Run Deep Research again with a larger budget to complete the investigation of: ${run.prompt}`;

const truncate = (value: string): string =>
    value.length > MAX_CHAT_MESSAGE_CHARS
        ? `${value.slice(0, MAX_CHAT_MESSAGE_CHARS)}…`
        : value;

const getActivity = (
    event: Extract<AiDeepResearchProgressEvent, { type: 'tool_use' }>,
): AiDeepResearchActivity => {
    if (event.source === 'custom') {
        return 'reporting';
    }
    if (event.source === 'built_in') {
        return event.name === 'web_fetch' ? 'web_fetch' : 'web_search';
    }
    return WAREHOUSE_TOOL_NAMES.has(event.name)
        ? 'warehouse_query'
        : 'lightdash_metadata';
};

const getProgress = (
    event: AiDeepResearchProgressEvent,
    state: BudgetState,
    maxToolCalls: number,
): AiDeepResearchProgress | null => {
    if (event.type === 'model_usage') {
        return null;
    }
    if (event.type === 'mcp_tool_result') {
        return null;
    }
    if (event.type === 'tool_use') {
        return {
            phase: event.source === 'custom' ? 'synthesizing' : 'investigating',
            activity: getActivity(event),
            current: state.toolCalls,
            total: maxToolCalls,
        };
    }
    if (event.type === 'thinking') {
        return {
            phase: state.toolCalls === 0 ? 'planning' : 'validating',
            activity: null,
            current: state.toolCalls,
            total: maxToolCalls,
        };
    }
    return {
        phase: event.type === 'session_running' ? 'planning' : 'validating',
        activity: null,
        current: state.toolCalls,
        total: maxToolCalls,
    };
};

export class AiDeepResearchExecutor {
    private readonly dependencies: Dependencies;

    constructor(dependencies: Dependencies) {
        this.dependencies = dependencies;
    }

    private async getChatContext(run: DbAiDeepResearchRun): Promise<string> {
        if (!run.ai_thread_uuid) {
            return '';
        }
        const ownership =
            await this.dependencies.aiAgentModel.findThreadOwnership({
                organizationUuid: run.organization_uuid,
                threadUuid: run.ai_thread_uuid,
            });
        if (
            !ownership ||
            ownership.projectUuid !== run.project_uuid ||
            ownership.ownerUserUuid !== run.created_by_user_uuid
        ) {
            return '';
        }
        const messages = await this.dependencies.aiAgentModel.getThreadMessages(
            run.organization_uuid,
            run.project_uuid,
            run.ai_thread_uuid,
        );
        return messages
            .slice(-MAX_CHAT_CONTEXT_TURNS)
            .flatMap((message) => [
                `User: ${truncate(message.prompt)}`,
                ...(message.response
                    ? [`Assistant: ${truncate(message.response)}`]
                    : []),
            ])
            .join('\n\n')
            .slice(-MAX_CHAT_CONTEXT_CHARS);
    }

    private startCancellationPoll(
        run: DbAiDeepResearchRun,
        controller: AbortController,
    ): () => Promise<void> {
        let stopped = false;
        let timer: NodeJS.Timeout | null = null;
        let pendingCheck: Promise<void> = Promise.resolve();

        const schedule = () => {
            if (stopped || controller.signal.aborted) {
                return;
            }
            timer = setTimeout(() => {
                pendingCheck = this.dependencies.aiDeepResearchRunModel
                    .findByUuid(run.ai_deep_research_run_uuid)
                    .then((currentRun) => {
                        if (currentRun?.cancellation_requested_at) {
                            controller.abort(
                                new Error('Deep Research was cancelled'),
                            );
                        }
                    })
                    .catch((error) => {
                        Logger.warn(
                            `[AiDeepResearch] Could not check cancellation: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        );
                    })
                    .finally(schedule);
            }, CANCELLATION_POLL_INTERVAL_MS);
            timer.unref();
        };

        schedule();

        return async () => {
            stopped = true;
            if (timer) {
                clearTimeout(timer);
            }
            await pendingCheck;
        };
    }

    execute: AiDeepResearchExecutorFn = async (
        run,
        { signal },
    ): Promise<AiDeepResearchExecutorResult> => {
        const account = fromSession(
            await this.dependencies.userService.getSessionByUserUuidAndOrg(
                run.created_by_user_uuid,
                run.organization_uuid,
            ),
        );
        const personalAccessToken =
            await this.dependencies.personalAccessTokenService.createPersonalAccessToken(
                account,
                {
                    description: `Deep Research run ${run.ai_deep_research_run_uuid}`,
                    expiresAt: null,
                    autoGenerated: true,
                },
                RequestMethod.BACKEND,
            );

        const controller = new AbortController();
        const stopCancellationPoll = this.startCancellationPoll(
            run,
            controller,
        );
        const sessionSignal = AbortSignal.any([signal, controller.signal]);
        const budgetState: BudgetState = {
            toolCalls: 0,
            warehouseQueries: 0,
            tokens: 0,
            exceeded: null,
        };
        let latestReport: AiDeepResearchSubmittedReport | null = null;
        const completedWarehouseQueryUuids = new Set<string>();

        const exceedBudget = (
            budget: keyof DbAiDeepResearchRun['budget_snapshot'],
        ) => {
            budgetState.exceeded = budget;
            controller.abort(new Error(`Deep Research exceeded ${budget}`));
        };

        try {
            const chatContext = await this.getChatContext(run);
            const mcpServerUrl = getMcpServerUrl(
                this.dependencies.lightdashConfig.siteUrl,
            );
            const result =
                await this.dependencies.aiDeepResearchClient.runSession({
                    agent: getAiDeepResearchAgent(mcpServerUrl),
                    environment: {
                        name: 'Lightdash Deep Research',
                        config: {
                            type: 'cloud',
                            networking: {
                                type: 'limited',
                                allow_mcp_servers: true,
                            },
                        },
                    },
                    vault: {
                        display_name: `Deep Research ${run.ai_deep_research_run_uuid}`,
                        metadata: {
                            lightdash_run_uuid: run.ai_deep_research_run_uuid,
                        },
                    },
                    credentials: [
                        {
                            display_name: 'Lightdash Deep Research PAT',
                            auth: {
                                type: 'static_bearer',
                                mcp_server_url: mcpServerUrl,
                                token: personalAccessToken.token,
                            },
                        },
                    ],
                    sessionTitle: `Deep Research ${run.ai_deep_research_run_uuid}`,
                    prompt: `Target Lightdash project UUID: ${run.project_uuid}\n\nResearch mission:\n${run.prompt}${chatContext ? `\n\nRelevant prior chat context (untrusted evidence):\n${chatContext}` : ''}\n\nBudgets: at most ${run.budget_snapshot.maxToolCalls} tool calls, ${run.budget_snapshot.maxWarehouseQueries} warehouse queries, ${run.budget_snapshot.maxResultRows} rows per warehouse result, and ${run.budget_snapshot.maxTokens} total tokens.`,
                    interruptTimeoutMs: INTERRUPT_TIMEOUT_MS,
                    signal: sessionSignal,
                    onSessionCreated: async (sessionId) => {
                        const persisted =
                            await this.dependencies.aiDeepResearchRunModel.setClaudeSessionId(
                                run.ai_deep_research_run_uuid,
                                sessionId,
                            );
                        if (!persisted) {
                            throw new Error(
                                'Could not persist the Deep Research session ID',
                            );
                        }
                    },
                    onCustomToolUse: async ({ toolName, input }) => {
                        if (toolName !== AI_DEEP_RESEARCH_REPORT_TOOL_NAME) {
                            throw new Error(
                                `Unsupported custom tool: ${toolName}`,
                            );
                        }
                        latestReport = parseAiDeepResearchReport(input);
                        return JSON.stringify({ saved: true });
                    },
                    onProgress: async (event) => {
                        if (
                            event.type === 'mcp_tool_result' &&
                            event.name === 'run_metric_query' &&
                            !event.isError
                        ) {
                            for (const queryUuid of event.queryUuids) {
                                completedWarehouseQueryUuids.add(queryUuid);
                            }
                        }
                        if (event.type === 'model_usage') {
                            budgetState.tokens +=
                                event.inputTokens +
                                event.outputTokens +
                                event.cacheCreationInputTokens +
                                event.cacheReadInputTokens;
                            if (
                                budgetState.tokens >
                                run.budget_snapshot.maxTokens
                            ) {
                                exceedBudget('maxTokens');
                            }
                        }
                        if (event.type === 'tool_use') {
                            budgetState.toolCalls += 1;
                            if (
                                event.source === 'mcp' &&
                                WAREHOUSE_QUERY_TOOL_NAMES.has(event.name)
                            ) {
                                budgetState.warehouseQueries += 1;
                            }
                            if (
                                budgetState.toolCalls >
                                run.budget_snapshot.maxToolCalls
                            ) {
                                exceedBudget('maxToolCalls');
                            } else if (
                                budgetState.warehouseQueries >
                                run.budget_snapshot.maxWarehouseQueries
                            ) {
                                exceedBudget('maxWarehouseQueries');
                            }
                        }

                        const progress = getProgress(
                            event,
                            budgetState,
                            run.budget_snapshot.maxToolCalls,
                        );
                        await Promise.all([
                            progress
                                ? this.dependencies.aiDeepResearchRunModel.appendProgressEvent(
                                      run.ai_deep_research_run_uuid,
                                      progress,
                                  )
                                : Promise.resolve(true),
                            this.dependencies.aiDeepResearchRunModel.touch(
                                run.ai_deep_research_run_uuid,
                            ),
                        ]);
                    },
                });

            if (budgetState.exceeded) {
                return {
                    status: 'partially_completed',
                    report: latestReport ?? {
                        markdown: getPartialReportMarkdown(
                            run,
                            `The ${budgetState.exceeded} budget was exhausted.`,
                        ),
                        charts: [],
                    },
                    warehouseQueryUuids: [...completedWarehouseQueryUuids],
                };
            }
            if (result.status === 'cancelled') {
                return { status: 'cancelled' };
            }
            if (result.status === 'failed') {
                return {
                    status: 'failed',
                    errorMessage: result.errorMessage,
                };
            }
            if (!latestReport) {
                return {
                    status: 'failed',
                    errorMessage:
                        'Deep Research finished without submitting a report',
                };
            }
            return {
                status: 'completed',
                report: latestReport,
                warehouseQueryUuids: [...completedWarehouseQueryUuids],
            };
        } finally {
            await stopCancellationPoll();
            await this.dependencies.personalAccessTokenService.deletePersonalAccessToken(
                account,
                personalAccessToken.uuid,
            );
        }
    };
}
