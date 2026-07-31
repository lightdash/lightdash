import {
    AI_DEEP_RESEARCH_HYPOTHESES_TOOL_NAME,
    AI_DEEP_RESEARCH_INVESTIGATION_TOOL_NAME,
    AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    countDeepResearchFindings,
    getErrorMessage,
    type AiDeepResearchBudget,
    type AiDeepResearchChartDataMap,
    type AiDeepResearchEntryPoint,
    type AiDeepResearchEventPayload,
    type AiDeepResearchEventPayloadMap,
    type AiDeepResearchEventType,
    type AiDeepResearchExecutionContextSnapshot,
    type AiDeepResearchProgress,
    type AiDeepResearchRunStatus,
    type AiDeepResearchTerminalReason,
} from '@lightdash/common';
import { Knex } from 'knex';
import type { AiUsageTokens } from '../../analytics/aiUsage';
import Logger from '../../logging/logger';
import {
    AiAgentToolCallErrorTableName,
    AiAgentToolCallTableName,
    AiAgentToolResultTableName,
    type AiAgentToolCallErrorTable,
    type AiAgentToolCallTable,
    type AiAgentToolResultTable,
} from '../database/entities/ai';
import {
    AiDeepResearchAnalyticsOutboxTableName,
    AiDeepResearchEventsTable,
    AiDeepResearchEventsTableName,
    AiDeepResearchRunsTable,
    AiDeepResearchRunsTableName,
    type AiDeepResearchAnalyticsEventType,
    type AiDeepResearchAnalyticsOutboxTable,
    type DbAiDeepResearchAnalyticsOutbox,
    type DbAiDeepResearchEvent,
    type DbAiDeepResearchRun,
} from '../database/entities/aiDeepResearch';
import { isDeepResearchWarehouseTool } from '../services/AiDeepResearchService/toolClassification';

type Dependencies = {
    database: Knex;
};

type CreateAiDeepResearchRun = {
    organizationUuid: string;
    projectUuid: string;
    createdByUserUuid: string;
    agentUuid: string;
    aiThreadUuid: string;
    promptUuid: string;
    toolCallId: string | null;
    prompt: string;
    entryPoint: AiDeepResearchEntryPoint;
    budget: AiDeepResearchBudget;
    executionContextSnapshot: AiDeepResearchExecutionContextSnapshot;
};

export type AiDeepResearchRunContextRow = Pick<
    DbAiDeepResearchRun,
    | 'ai_deep_research_run_uuid'
    | 'prompt'
    | 'status'
    | 'created_at'
    | 'started_at'
    | 'completed_at'
> & {
    has_report: boolean;
};

export type AiDeepResearchReportSummaryRow = Pick<
    DbAiDeepResearchRun,
    | 'ai_deep_research_run_uuid'
    | 'organization_uuid'
    | 'project_uuid'
    | 'created_by_user_uuid'
    | 'prompt'
    | 'created_at'
    | 'updated_at'
> & {
    content_size_bytes: number;
};

type EventCursor = {
    createdAt: string;
    eventUuid: string;
};

export type DbAiDeepResearchEventWithCursor = DbAiDeepResearchEvent & {
    cursor_created_at: string;
};

type Queryable = Knex | Knex.Transaction;

type TerminalMetrics = Pick<
    DbAiDeepResearchRun,
    | 'tool_call_count'
    | 'tool_error_count'
    | 'warehouse_query_count'
    | 'findings_count'
    | 'chart_count'
>;

export type AiDeepResearchReportCleanupResult = {
    scanned: number;
    expired: number;
    failed: number;
};

export class AiDeepResearchRunModel {
    private readonly database: Knex;

    constructor({ database }: Dependencies) {
        this.database = database;
    }

    private static async insertEvent<EventType extends AiDeepResearchEventType>(
        database: Queryable,
        aiDeepResearchRunUuid: string,
        eventType: EventType,
        payload: AiDeepResearchEventPayloadMap[EventType],
    ): Promise<void> {
        await database<AiDeepResearchEventsTable>(
            AiDeepResearchEventsTableName,
        ).insert({
            ai_deep_research_run_uuid: aiDeepResearchRunUuid,
            event_type: eventType,
            payload: payload as AiDeepResearchEventPayload,
            created_at: database.raw('clock_timestamp()') as unknown as Date,
        });
    }

    private static async insertAnalyticsEvent(
        database: Queryable,
        aiDeepResearchRunUuid: string,
        eventType: AiDeepResearchAnalyticsEventType,
        terminalReason: AiDeepResearchTerminalReason | null = null,
    ): Promise<void> {
        await database<AiDeepResearchAnalyticsOutboxTable>(
            AiDeepResearchAnalyticsOutboxTableName,
        )
            .insert({
                ai_deep_research_run_uuid: aiDeepResearchRunUuid,
                event_type: eventType,
                terminal_reason: terminalReason,
            })
            .onConflict(['ai_deep_research_run_uuid', 'event_type'])
            .ignore();
    }

    private static async getTerminalMetrics(
        database: Queryable,
        promptUuid: string,
        resultMarkdown: string | null,
        resultChartData: AiDeepResearchChartDataMap | null,
    ): Promise<TerminalMetrics> {
        const [toolCalls, toolResults, toolCallErrors] = await Promise.all([
            database<AiAgentToolCallTable>(AiAgentToolCallTableName)
                .select('tool_call_id', 'tool_name', 'created_at')
                .where('ai_prompt_uuid', promptUuid),
            database<AiAgentToolResultTable>(AiAgentToolResultTableName)
                .select('tool_call_id', 'metadata')
                .where('ai_prompt_uuid', promptUuid),
            database<AiAgentToolCallErrorTable>(AiAgentToolCallErrorTableName)
                .select('tool_call_id')
                .where('ai_prompt_uuid', promptUuid),
        ]);
        const errorResultIds = toolResults
            .filter(
                ({ metadata }) =>
                    metadata !== null &&
                    'status' in metadata &&
                    metadata.status === 'error',
            )
            .map(({ tool_call_id: toolCallId }) => toolCallId);
        const toolErrorIds = new Set([
            ...toolCallErrors.map(({ tool_call_id: toolCallId }) => toolCallId),
            ...errorResultIds,
        ]);
        const successfulResultIds = new Set(
            toolResults
                .filter(
                    ({ metadata }) =>
                        metadata === null ||
                        !('status' in metadata) ||
                        metadata.status !== 'error',
                )
                .map(({ tool_call_id: toolCallId }) => toolCallId),
        );
        const successfulReportSubmissionId = toolCalls
            .filter(
                ({ tool_call_id: toolCallId, tool_name: toolName }) =>
                    toolName === AI_DEEP_RESEARCH_REPORT_TOOL_NAME &&
                    successfulResultIds.has(toolCallId),
            )
            .sort(
                (left, right) =>
                    right.created_at.getTime() - left.created_at.getTime(),
            )[0]?.tool_call_id;
        const attemptedToolCallIds = new Set([
            ...toolCalls.map(({ tool_call_id: toolCallId }) => toolCallId),
            ...toolCallErrors.map(({ tool_call_id: toolCallId }) => toolCallId),
        ]);
        if (successfulReportSubmissionId !== undefined) {
            attemptedToolCallIds.delete(successfulReportSubmissionId);
        }

        return {
            tool_call_count: attemptedToolCallIds.size,
            tool_error_count: toolErrorIds.size,
            warehouse_query_count: new Set(
                toolCalls
                    .filter(({ tool_name: toolName }) =>
                        isDeepResearchWarehouseTool(toolName),
                    )
                    .map(({ tool_call_id: toolCallId }) => toolCallId),
            ).size,
            findings_count:
                resultMarkdown === null
                    ? 0
                    : countDeepResearchFindings(resultMarkdown),
            chart_count:
                resultChartData === null
                    ? 0
                    : Object.keys(resultChartData).length,
        };
    }

    private static getDurationMs(database: Queryable) {
        return database.raw(
            'greatest(0, floor(extract(epoch from (now() - coalesce(started_at, created_at))) * 1000))::integer',
        ) as unknown as number;
    }

    async create(data: CreateAiDeepResearchRun): Promise<DbAiDeepResearchRun> {
        return this.database.transaction(async (transaction) => {
            const [run] = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .insert({
                    organization_uuid: data.organizationUuid,
                    project_uuid: data.projectUuid,
                    created_by_user_uuid: data.createdByUserUuid,
                    agent_uuid: data.agentUuid,
                    ai_thread_uuid: data.aiThreadUuid,
                    prompt_uuid: data.promptUuid,
                    tool_call_id: data.toolCallId,
                    prompt: data.prompt,
                    entry_point: data.entryPoint,
                    budget_snapshot: data.budget,
                    execution_context_snapshot: data.executionContextSnapshot,
                })
                .returning('*');

            await AiDeepResearchRunModel.insertEvent(
                transaction,
                run.ai_deep_research_run_uuid,
                'status_changed',
                { status: 'queued' },
            );
            return run;
        });
    }

    async recordRunAccepted(aiDeepResearchRunUuid: string): Promise<void> {
        await this.database.transaction(async (transaction) => {
            const run = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
                .first();
            if (!run) {
                return;
            }
            await AiDeepResearchRunModel.insertAnalyticsEvent(
                transaction,
                aiDeepResearchRunUuid,
                'run_started',
            );
        });
    }

    async updateExecutionContextSnapshot(
        aiDeepResearchRunUuid: string,
        snapshot: AiDeepResearchExecutionContextSnapshot,
    ): Promise<void> {
        await this.database<AiDeepResearchRunsTable>(
            AiDeepResearchRunsTableName,
        )
            .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
            .update({
                execution_context_snapshot: snapshot,
                updated_at: new Date(),
            });
    }

    async findByUuid(
        aiDeepResearchRunUuid: string,
    ): Promise<DbAiDeepResearchRun | undefined> {
        return this.database<AiDeepResearchRunsTable>(
            AiDeepResearchRunsTableName,
        )
            .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
            .first();
    }

    async findByUuidScoped(args: {
        aiDeepResearchRunUuid: string;
        organizationUuid: string;
        projectUuid: string;
    }): Promise<DbAiDeepResearchRun | undefined> {
        return this.database<AiDeepResearchRunsTable>(
            AiDeepResearchRunsTableName,
        )
            .where('ai_deep_research_run_uuid', args.aiDeepResearchRunUuid)
            .where('organization_uuid', args.organizationUuid)
            .where('project_uuid', args.projectUuid)
            .first();
    }

    async findByPromptScoped(args: {
        promptUuid: string;
        organizationUuid: string;
        projectUuid: string;
        createdByUserUuid: string;
    }): Promise<DbAiDeepResearchRun | undefined> {
        return this.database<AiDeepResearchRunsTable>(
            AiDeepResearchRunsTableName,
        )
            .where('prompt_uuid', args.promptUuid)
            .where('organization_uuid', args.organizationUuid)
            .where('project_uuid', args.projectUuid)
            .where('created_by_user_uuid', args.createdByUserUuid)
            .first();
    }

    async findByPromptUuidsScoped(args: {
        promptUuids: string[];
        organizationUuid: string;
        projectUuid: string;
    }): Promise<
        Pick<DbAiDeepResearchRun, 'prompt_uuid' | 'result_markdown'>[]
    > {
        if (args.promptUuids.length === 0) {
            return [];
        }

        return this.database<AiDeepResearchRunsTable>(
            AiDeepResearchRunsTableName,
        )
            .select('prompt_uuid', 'result_markdown')
            .whereIn('prompt_uuid', args.promptUuids)
            .where('organization_uuid', args.organizationUuid)
            .where('project_uuid', args.projectUuid)
            .whereNull('report_expired_at')
            .whereRaw(
                "coalesce(report_expires_at, completed_at + interval '30 days') > now()",
            );
    }

    async findByThreadScoped(args: {
        aiThreadUuid: string;
        organizationUuid: string;
        projectUuid: string;
        createdByUserUuid: string;
    }): Promise<DbAiDeepResearchRun[]> {
        return this.database<AiDeepResearchRunsTable>(
            AiDeepResearchRunsTableName,
        )
            .where('ai_thread_uuid', args.aiThreadUuid)
            .where('organization_uuid', args.organizationUuid)
            .where('project_uuid', args.projectUuid)
            .where('created_by_user_uuid', args.createdByUserUuid)
            .orderBy('created_at', 'asc');
    }

    async findAgentContextByThreadScoped(args: {
        aiThreadUuid: string;
        organizationUuid: string;
        projectUuid: string;
        createdByUserUuid: string;
    }): Promise<AiDeepResearchRunContextRow[]> {
        const rows = await this.database<AiDeepResearchRunsTable>(
            AiDeepResearchRunsTableName,
        )
            .select(
                'ai_deep_research_run_uuid',
                'prompt',
                'status',
                'created_at',
                'started_at',
                'completed_at',
                this.database.raw(
                    `(
                        report_expired_at is null
                        and coalesce(
                            report_expires_at,
                            completed_at + interval '30 days'
                        ) > now()
                        and coalesce(octet_length(result_markdown), 0) > 0
                    ) as has_report`,
                ),
            )
            .where('ai_thread_uuid', args.aiThreadUuid)
            .where('organization_uuid', args.organizationUuid)
            .where('project_uuid', args.projectUuid)
            .where('created_by_user_uuid', args.createdByUserUuid)
            .orderBy('created_at', 'asc');

        return rows as unknown as AiDeepResearchRunContextRow[];
    }

    async findReportSummariesByThreadScoped(args: {
        aiThreadUuid: string;
        organizationUuid: string;
        projectUuid: string;
        createdByUserUuid: string;
    }): Promise<AiDeepResearchReportSummaryRow[]> {
        const rows = await this.database<AiDeepResearchRunsTable>(
            AiDeepResearchRunsTableName,
        )
            .select(
                'ai_deep_research_run_uuid',
                'organization_uuid',
                'project_uuid',
                'created_by_user_uuid',
                'prompt',
                'created_at',
                'updated_at',
                this.database.raw(
                    'octet_length(result_markdown) as content_size_bytes',
                ),
            )
            .where('ai_thread_uuid', args.aiThreadUuid)
            .where('organization_uuid', args.organizationUuid)
            .where('project_uuid', args.projectUuid)
            .where('created_by_user_uuid', args.createdByUserUuid)
            .whereNull('report_expired_at')
            .whereRaw(
                "coalesce(report_expires_at, completed_at + interval '30 days') > now()",
            )
            .whereRaw('octet_length(result_markdown) > 0')
            .orderBy('created_at', 'asc');

        return rows as unknown as AiDeepResearchReportSummaryRow[];
    }

    async findReportByUuidThreadScoped(args: {
        aiDeepResearchRunUuid: string;
        aiThreadUuid: string;
        organizationUuid: string;
        projectUuid: string;
        createdByUserUuid: string;
    }): Promise<
        | Pick<
              DbAiDeepResearchRun,
              'ai_deep_research_run_uuid' | 'prompt' | 'result_markdown'
          >
        | undefined
    > {
        return this.database<AiDeepResearchRunsTable>(
            AiDeepResearchRunsTableName,
        )
            .select('ai_deep_research_run_uuid', 'prompt', 'result_markdown')
            .where('ai_deep_research_run_uuid', args.aiDeepResearchRunUuid)
            .where('ai_thread_uuid', args.aiThreadUuid)
            .where('organization_uuid', args.organizationUuid)
            .where('project_uuid', args.projectUuid)
            .where('created_by_user_uuid', args.createdByUserUuid)
            .whereNull('report_expired_at')
            .whereRaw(
                "coalesce(report_expires_at, completed_at + interval '30 days') > now()",
            )
            .whereRaw('octet_length(result_markdown) > 0')
            .first();
    }

    async findLatestProgressByRunUuids(
        aiDeepResearchRunUuids: string[],
    ): Promise<DbAiDeepResearchEvent[]> {
        if (aiDeepResearchRunUuids.length === 0) {
            return [];
        }

        return this.database<AiDeepResearchEventsTable>(
            AiDeepResearchEventsTableName,
        )
            .distinctOn('ai_deep_research_run_uuid')
            .select('*')
            .whereIn('ai_deep_research_run_uuid', aiDeepResearchRunUuids)
            .where('event_type', 'progress')
            .orderBy('ai_deep_research_run_uuid', 'asc')
            .orderBy('created_at', 'desc')
            .orderBy('ai_deep_research_event_uuid', 'desc');
    }

    async deleteUnstartedFailedRun(
        aiDeepResearchRunUuid: string,
    ): Promise<boolean> {
        const deleted = await this.database<AiDeepResearchRunsTable>(
            AiDeepResearchRunsTableName,
        )
            .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
            .where('status', 'failed')
            .whereNull('started_at')
            .delete();
        return deleted > 0;
    }

    async claimQueuedRun(
        aiDeepResearchRunUuid: string,
    ): Promise<DbAiDeepResearchRun | undefined> {
        return this.database.transaction(async (transaction) => {
            const [run] = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
                .where('status', 'queued')
                .whereNull('cancellation_requested_at')
                .update({
                    status: 'running',
                    started_at: transaction.fn.now() as unknown as Date,
                    updated_at: transaction.fn.now() as unknown as Date,
                })
                .returning('*');

            if (!run) {
                return undefined;
            }

            await AiDeepResearchRunModel.insertEvent(
                transaction,
                aiDeepResearchRunUuid,
                'status_changed',
                { status: 'running' },
            );
            return run;
        });
    }

    async touch(aiDeepResearchRunUuid: string): Promise<boolean> {
        const updated = await this.database<AiDeepResearchRunsTable>(
            AiDeepResearchRunsTableName,
        )
            .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
            .where('status', 'running')
            .update({
                updated_at: this.database.fn.now() as unknown as Date,
            });
        return updated > 0;
    }

    async accumulateTokenUsage(
        aiDeepResearchRunUuid: string,
        tokens: AiUsageTokens,
    ): Promise<boolean> {
        const accumulate = (
            column: keyof Pick<
                DbAiDeepResearchRun,
                | 'input_tokens'
                | 'output_tokens'
                | 'cache_read_tokens'
                | 'cache_write_tokens'
                | 'reasoning_tokens'
                | 'total_tokens'
            >,
            value: number | null,
        ) =>
            this.database.raw(
                'case when ?::integer is null then ?? else coalesce(??, 0) + ?::integer end',
                [value, column, column, value],
            ) as unknown as number;
        const isComplete = Object.values(tokens).every(
            (value) => value !== null,
        );
        const updated = await this.database<AiDeepResearchRunsTable>(
            AiDeepResearchRunsTableName,
        )
            .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
            .where('status', 'running')
            .update({
                input_tokens: accumulate('input_tokens', tokens.inputTokens),
                output_tokens: accumulate('output_tokens', tokens.outputTokens),
                cache_read_tokens: accumulate(
                    'cache_read_tokens',
                    tokens.cacheReadTokens,
                ),
                cache_write_tokens: accumulate(
                    'cache_write_tokens',
                    tokens.cacheWriteTokens,
                ),
                reasoning_tokens: accumulate(
                    'reasoning_tokens',
                    tokens.reasoningTokens,
                ),
                total_tokens: accumulate('total_tokens', tokens.totalTokens),
                token_usage_complete: this.database.raw(
                    'coalesce(??, true) and ?',
                    ['token_usage_complete', isComplete],
                ) as unknown as boolean,
                updated_at: this.database.fn.now() as unknown as Date,
            });
        return updated > 0;
    }

    private async markWithReport(
        aiDeepResearchRunUuid: string,
        status: 'completed' | 'partially_completed',
        resultMarkdown: string,
        resultChartData: AiDeepResearchChartDataMap,
        terminalReason: AiDeepResearchTerminalReason | null,
    ): Promise<boolean> {
        return this.database.transaction(async (transaction) => {
            const currentRun = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
                .where('status', 'running')
                .whereNull('cancellation_requested_at')
                .forUpdate()
                .first();
            if (!currentRun) {
                return false;
            }
            const metrics = await AiDeepResearchRunModel.getTerminalMetrics(
                transaction,
                currentRun.prompt_uuid,
                resultMarkdown,
                resultChartData,
            );
            const [run] = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
                .where('status', 'running')
                .whereNull('cancellation_requested_at')
                .update({
                    status,
                    result_markdown: resultMarkdown,
                    result_chart_data: JSON.stringify(
                        resultChartData,
                    ) as unknown as AiDeepResearchChartDataMap,
                    report_expires_at: transaction.raw(
                        "now() + interval '30 days'",
                    ) as unknown as Date,
                    report_expired_at: null,
                    ...metrics,
                    duration_ms:
                        AiDeepResearchRunModel.getDurationMs(transaction),
                    error_message: null,
                    completed_at: transaction.fn.now() as unknown as Date,
                    updated_at: transaction.fn.now() as unknown as Date,
                })
                .returning('*');

            if (!run) {
                return false;
            }

            await AiDeepResearchRunModel.insertEvent(
                transaction,
                aiDeepResearchRunUuid,
                'status_changed',
                { status },
            );
            await AiDeepResearchRunModel.insertAnalyticsEvent(
                transaction,
                aiDeepResearchRunUuid,
                'run_completed',
                terminalReason,
            );
            return true;
        });
    }

    async markCompleted(
        aiDeepResearchRunUuid: string,
        resultMarkdown: string,
        resultChartData: AiDeepResearchChartDataMap,
    ): Promise<boolean> {
        return this.markWithReport(
            aiDeepResearchRunUuid,
            'completed',
            resultMarkdown,
            resultChartData,
            null,
        );
    }

    async markPartiallyCompleted(
        aiDeepResearchRunUuid: string,
        resultMarkdown: string,
        resultChartData: AiDeepResearchChartDataMap,
        terminalReason: AiDeepResearchTerminalReason,
    ): Promise<boolean> {
        return this.markWithReport(
            aiDeepResearchRunUuid,
            'partially_completed',
            resultMarkdown,
            resultChartData,
            terminalReason,
        );
    }

    async markFailed(
        aiDeepResearchRunUuid: string,
        errorMessage: string,
        terminalReason: AiDeepResearchTerminalReason,
    ): Promise<boolean> {
        return this.database.transaction(async (transaction) => {
            const currentRun = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
                .whereIn('status', ['queued', 'running'])
                .forUpdate()
                .first();
            if (!currentRun) {
                return false;
            }
            const metrics = await AiDeepResearchRunModel.getTerminalMetrics(
                transaction,
                currentRun.prompt_uuid,
                null,
                null,
            );
            const [run] = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
                .whereIn('status', ['queued', 'running'])
                .update({
                    status: 'failed',
                    ...metrics,
                    duration_ms:
                        AiDeepResearchRunModel.getDurationMs(transaction),
                    error_message: errorMessage,
                    completed_at: transaction.fn.now() as unknown as Date,
                    updated_at: transaction.fn.now() as unknown as Date,
                })
                .returning('*');

            if (!run) {
                return false;
            }

            await AiDeepResearchRunModel.insertEvent(
                transaction,
                aiDeepResearchRunUuid,
                'status_changed',
                { status: 'failed' },
            );
            await AiDeepResearchRunModel.insertAnalyticsEvent(
                transaction,
                aiDeepResearchRunUuid,
                'run_completed',
                terminalReason,
            );
            return true;
        });
    }

    async markCancelled(
        aiDeepResearchRunUuid: string,
        terminalReason: AiDeepResearchTerminalReason = 'user_cancellation',
    ): Promise<boolean> {
        return this.database.transaction(async (transaction) => {
            const currentRun = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
                .where('status', 'running')
                .whereNotNull('cancellation_requested_at')
                .forUpdate()
                .first();
            if (!currentRun) {
                return false;
            }
            const metrics = await AiDeepResearchRunModel.getTerminalMetrics(
                transaction,
                currentRun.prompt_uuid,
                null,
                null,
            );
            const [run] = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
                .where('status', 'running')
                .whereNotNull('cancellation_requested_at')
                .update({
                    status: 'cancelled',
                    ...metrics,
                    duration_ms:
                        AiDeepResearchRunModel.getDurationMs(transaction),
                    completed_at: transaction.fn.now() as unknown as Date,
                    updated_at: transaction.fn.now() as unknown as Date,
                })
                .returning('*');

            if (!run) {
                return false;
            }

            await AiDeepResearchRunModel.insertEvent(
                transaction,
                aiDeepResearchRunUuid,
                'status_changed',
                { status: 'cancelled' },
            );
            await AiDeepResearchRunModel.insertAnalyticsEvent(
                transaction,
                aiDeepResearchRunUuid,
                'run_completed',
                terminalReason,
            );
            return true;
        });
    }

    async requestCancellation(
        aiDeepResearchRunUuid: string,
    ): Promise<DbAiDeepResearchRun | undefined> {
        return this.database.transaction(async (transaction) => {
            const now = transaction.fn.now() as unknown as Date;
            const [queuedRun] = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
                .where('status', 'queued')
                .whereNull('cancellation_requested_at')
                .update({
                    status: 'cancelled',
                    cancellation_requested_at: now,
                    completed_at: now,
                    updated_at: now,
                })
                .returning('*');

            if (queuedRun) {
                const metrics = await AiDeepResearchRunModel.getTerminalMetrics(
                    transaction,
                    queuedRun.prompt_uuid,
                    null,
                    null,
                );
                const [runWithMetrics] =
                    await transaction<AiDeepResearchRunsTable>(
                        AiDeepResearchRunsTableName,
                    )
                        .where(
                            'ai_deep_research_run_uuid',
                            aiDeepResearchRunUuid,
                        )
                        .update({
                            ...metrics,
                            duration_ms:
                                AiDeepResearchRunModel.getDurationMs(
                                    transaction,
                                ),
                        })
                        .returning('*');
                await AiDeepResearchRunModel.insertEvent(
                    transaction,
                    aiDeepResearchRunUuid,
                    'cancellation_requested',
                    {},
                );
                await AiDeepResearchRunModel.insertEvent(
                    transaction,
                    aiDeepResearchRunUuid,
                    'status_changed',
                    { status: 'cancelled' },
                );
                await AiDeepResearchRunModel.insertAnalyticsEvent(
                    transaction,
                    aiDeepResearchRunUuid,
                    'run_completed',
                    'user_cancellation',
                );
                return runWithMetrics ?? queuedRun;
            }

            const [runningRun] = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
                .where('status', 'running')
                .whereNull('cancellation_requested_at')
                .update({
                    cancellation_requested_at: now,
                    updated_at: now,
                })
                .returning('*');

            if (runningRun) {
                await AiDeepResearchRunModel.insertEvent(
                    transaction,
                    aiDeepResearchRunUuid,
                    'cancellation_requested',
                    {},
                );
                return runningRun;
            }

            return transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
                .first();
        });
    }

    async appendProgressEvent(
        aiDeepResearchRunUuid: string,
        progress: AiDeepResearchProgress,
    ): Promise<boolean> {
        return this.database.transaction(async (transaction) => {
            const run = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
                .where('status', 'running')
                .forUpdate()
                .first();

            if (!run) {
                return false;
            }

            await AiDeepResearchRunModel.insertEvent(
                transaction,
                aiDeepResearchRunUuid,
                'progress',
                { progress },
            );
            return true;
        });
    }

    async listEvents(args: {
        aiDeepResearchRunUuid: string;
        cursor: EventCursor | null;
        limit: number;
    }): Promise<DbAiDeepResearchEventWithCursor[]> {
        const query = this.database<AiDeepResearchEventsTable>(
            AiDeepResearchEventsTableName,
        )
            .select(
                '*',
                this.database.raw(
                    `to_char(created_at, 'YYYY-MM-DD HH24:MI:SS.US') as cursor_created_at`,
                ),
            )
            .where('ai_deep_research_run_uuid', args.aiDeepResearchRunUuid);

        const pageQuery = args.cursor
            ? query.andWhere(
                  this.database.raw(
                      '(created_at, ai_deep_research_event_uuid) > (?::timestamp, ?::uuid)',
                      [args.cursor.createdAt, args.cursor.eventUuid],
                  ),
              )
            : query;

        return pageQuery
            .orderBy('created_at', 'asc')
            .orderBy('ai_deep_research_event_uuid', 'asc')
            .limit(args.limit + 1);
    }

    async markStaleRunsAsFailed(
        thresholdMinutes: number,
        errorMessage: string,
    ): Promise<DbAiDeepResearchRun[]> {
        return this.database.transaction(async (transaction) => {
            const runs = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('status', 'running')
                .andWhere(
                    'updated_at',
                    '<',
                    transaction.raw("now() - (? * interval '1 minute')", [
                        thresholdMinutes,
                    ]),
                )
                .update({
                    status: 'failed',
                    error_message: errorMessage,
                    completed_at: transaction.fn.now() as unknown as Date,
                    updated_at: transaction.fn.now() as unknown as Date,
                })
                .returning('*');

            const runsWithMetrics = await Promise.all(
                runs.map(async (run) => {
                    const metrics =
                        await AiDeepResearchRunModel.getTerminalMetrics(
                            transaction,
                            run.prompt_uuid,
                            null,
                            null,
                        );
                    const [updatedRun] =
                        await transaction<AiDeepResearchRunsTable>(
                            AiDeepResearchRunsTableName,
                        )
                            .where(
                                'ai_deep_research_run_uuid',
                                run.ai_deep_research_run_uuid,
                            )
                            .update({
                                ...metrics,
                                duration_ms:
                                    AiDeepResearchRunModel.getDurationMs(
                                        transaction,
                                    ),
                            })
                            .returning('*');
                    return updatedRun ?? run;
                }),
            );

            await Promise.all(
                runsWithMetrics.map((run) =>
                    AiDeepResearchRunModel.insertEvent(
                        transaction,
                        run.ai_deep_research_run_uuid,
                        'status_changed',
                        { status: 'failed' },
                    ),
                ),
            );
            await Promise.all(
                runsWithMetrics.map((run) =>
                    AiDeepResearchRunModel.insertAnalyticsEvent(
                        transaction,
                        run.ai_deep_research_run_uuid,
                        'run_completed',
                        'internal_error',
                    ),
                ),
            );
            return runsWithMetrics;
        });
    }

    async cleanExpiredReports(
        batchSize: number,
    ): Promise<AiDeepResearchReportCleanupResult> {
        const candidates = await this.database<AiDeepResearchRunsTable>(
            AiDeepResearchRunsTableName,
        )
            .select('ai_deep_research_run_uuid', 'prompt_uuid')
            .whereNull('report_expired_at')
            .where((query) =>
                query
                    .where('report_expires_at', '<=', this.database.fn.now())
                    .orWhere((legacyQuery) =>
                        legacyQuery
                            .whereNull('report_expires_at')
                            .whereNotNull('completed_at')
                            .whereRaw(
                                "completed_at + interval '30 days' <= now()",
                            ),
                    ),
            )
            .where((query) =>
                query
                    .whereNotNull('result_markdown')
                    .orWhereNotNull('result_chart_data'),
            )
            .orderByRaw(
                "coalesce(report_expires_at, completed_at + interval '30 days') asc",
            )
            .limit(batchSize);

        const results = await Promise.all(
            candidates.map(async (candidate) => {
                try {
                    return await this.database.transaction(
                        async (transaction) => {
                            const lockedCandidate =
                                await transaction<AiDeepResearchRunsTable>(
                                    AiDeepResearchRunsTableName,
                                )
                                    .select('ai_deep_research_run_uuid')
                                    .where(
                                        'ai_deep_research_run_uuid',
                                        candidate.ai_deep_research_run_uuid,
                                    )
                                    .whereNull('report_expired_at')
                                    .whereRaw(
                                        "coalesce(report_expires_at, completed_at + interval '30 days') <= now()",
                                    )
                                    .where((query) =>
                                        query
                                            .whereNotNull('result_markdown')
                                            .orWhereNotNull(
                                                'result_chart_data',
                                            ),
                                    )
                                    .forUpdate()
                                    .first();
                            if (!lockedCandidate) {
                                return 'skipped' as const;
                            }

                            const toolCalls =
                                await transaction<AiAgentToolCallTable>(
                                    AiAgentToolCallTableName,
                                )
                                    .select(
                                        'ai_agent_tool_call_uuid',
                                        'tool_call_id',
                                    )
                                    .where(
                                        'ai_prompt_uuid',
                                        candidate.prompt_uuid,
                                    )
                                    .where((query) =>
                                        query
                                            .where(
                                                'parent_tool_call_id',
                                                'like',
                                                `deep-research:${candidate.ai_deep_research_run_uuid}:%`,
                                            )
                                            .orWhereIn('tool_name', [
                                                AI_DEEP_RESEARCH_HYPOTHESES_TOOL_NAME,
                                                AI_DEEP_RESEARCH_INVESTIGATION_TOOL_NAME,
                                                AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
                                            ]),
                                    );
                            const toolCallIds = toolCalls.map(
                                (toolCall) => toolCall.tool_call_id,
                            );

                            if (toolCallIds.length > 0) {
                                await transaction<AiAgentToolResultTable>(
                                    AiAgentToolResultTableName,
                                )
                                    .where(
                                        'ai_prompt_uuid',
                                        candidate.prompt_uuid,
                                    )
                                    .whereIn('tool_call_id', toolCallIds)
                                    .delete();
                                await transaction<AiAgentToolCallErrorTable>(
                                    AiAgentToolCallErrorTableName,
                                )
                                    .where(
                                        'ai_prompt_uuid',
                                        candidate.prompt_uuid,
                                    )
                                    .whereIn('tool_call_id', toolCallIds)
                                    .delete();
                                await transaction<AiAgentToolCallTable>(
                                    AiAgentToolCallTableName,
                                )
                                    .whereIn(
                                        'ai_agent_tool_call_uuid',
                                        toolCalls.map(
                                            (toolCall) =>
                                                toolCall.ai_agent_tool_call_uuid,
                                        ),
                                    )
                                    .delete();
                            }

                            const expired =
                                await transaction<AiDeepResearchRunsTable>(
                                    AiDeepResearchRunsTableName,
                                )
                                    .where(
                                        'ai_deep_research_run_uuid',
                                        candidate.ai_deep_research_run_uuid,
                                    )
                                    .whereNull('report_expired_at')
                                    .whereRaw(
                                        "coalesce(report_expires_at, completed_at + interval '30 days') <= now()",
                                    )
                                    .update({
                                        result_markdown: null,
                                        result_chart_data: null,
                                        report_expires_at: transaction.raw(
                                            "coalesce(report_expires_at, completed_at + interval '30 days')",
                                        ) as unknown as Date,
                                        report_expired_at:
                                            transaction.fn.now() as unknown as Date,
                                        updated_at:
                                            transaction.fn.now() as unknown as Date,
                                    });
                            return expired > 0
                                ? ('expired' as const)
                                : ('skipped' as const);
                        },
                    );
                } catch (error) {
                    Logger.error(
                        `Failed to clean Deep Research report ${candidate.ai_deep_research_run_uuid}: ${getErrorMessage(error)}`,
                    );
                    return 'failed' as const;
                }
            }),
        );

        const expired = results.filter((result) => result === 'expired').length;
        const failed = results.filter((result) => result === 'failed').length;
        return {
            scanned: candidates.length,
            expired,
            failed,
        };
    }

    async listPendingAnalyticsEvents(args?: {
        aiDeepResearchRunUuid?: string;
        limit?: number;
    }): Promise<DbAiDeepResearchAnalyticsOutbox[]> {
        const query = this.database<AiDeepResearchAnalyticsOutboxTable>(
            AiDeepResearchAnalyticsOutboxTableName,
        )
            .whereNull('delivered_at')
            .orderBy('created_at', 'asc')
            .limit(args?.limit ?? 100);

        return args?.aiDeepResearchRunUuid
            ? query.where(
                  'ai_deep_research_run_uuid',
                  args.aiDeepResearchRunUuid,
              )
            : query;
    }

    async markAnalyticsEventDelivered(
        aiDeepResearchAnalyticsEventUuid: string,
    ): Promise<boolean> {
        const updated = await this.database<AiDeepResearchAnalyticsOutboxTable>(
            AiDeepResearchAnalyticsOutboxTableName,
        )
            .where(
                'ai_deep_research_analytics_event_uuid',
                aiDeepResearchAnalyticsEventUuid,
            )
            .whereNull('delivered_at')
            .update({
                delivered_at: this.database.fn.now() as unknown as Date,
            });
        return updated > 0;
    }
}
