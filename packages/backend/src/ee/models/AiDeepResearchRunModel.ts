import {
    type AiDeepResearchBudget,
    type AiDeepResearchEventPayload,
    type AiDeepResearchEventPayloadMap,
    type AiDeepResearchEventType,
    type AiDeepResearchProgress,
    type AiDeepResearchRunStatus,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    AiDeepResearchEventsTable,
    AiDeepResearchEventsTableName,
    AiDeepResearchRunsTable,
    AiDeepResearchRunsTableName,
    type DbAiDeepResearchEvent,
    type DbAiDeepResearchRun,
} from '../database/entities/aiDeepResearch';

type Dependencies = {
    database: Knex;
};

type CreateAiDeepResearchRun = {
    organizationUuid: string;
    projectUuid: string;
    createdByUserUuid: string;
    aiThreadUuid: string | null;
    promptUuid: string | null;
    toolCallId: string | null;
    prompt: string;
    budget: AiDeepResearchBudget;
};

type EventCursor = {
    createdAt: string;
    eventUuid: string;
};

export type DbAiDeepResearchEventWithCursor = DbAiDeepResearchEvent & {
    cursor_created_at: string;
};

type Queryable = Knex | Knex.Transaction;

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

    async create(data: CreateAiDeepResearchRun): Promise<DbAiDeepResearchRun> {
        return this.database.transaction(async (transaction) => {
            const [run] = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .insert({
                    organization_uuid: data.organizationUuid,
                    project_uuid: data.projectUuid,
                    created_by_user_uuid: data.createdByUserUuid,
                    ai_thread_uuid: data.aiThreadUuid,
                    prompt_uuid: data.promptUuid,
                    tool_call_id: data.toolCallId,
                    prompt: data.prompt,
                    budget_snapshot: data.budget,
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

    async setClaudeSessionId(
        aiDeepResearchRunUuid: string,
        claudeSessionId: string,
    ): Promise<boolean> {
        const updated = await this.database<AiDeepResearchRunsTable>(
            AiDeepResearchRunsTableName,
        )
            .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
            .where('status', 'running')
            .update({
                claude_session_id: claudeSessionId,
                updated_at: this.database.fn.now() as unknown as Date,
            });
        return updated > 0;
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

    private async markWithReport(
        aiDeepResearchRunUuid: string,
        status: 'completed' | 'partially_completed',
        resultMarkdown: string,
    ): Promise<boolean> {
        return this.database.transaction(async (transaction) => {
            const [run] = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
                .where('status', 'running')
                .whereNull('cancellation_requested_at')
                .update({
                    status,
                    result_markdown: resultMarkdown,
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
            return true;
        });
    }

    async markCompleted(
        aiDeepResearchRunUuid: string,
        resultMarkdown: string,
    ): Promise<boolean> {
        return this.markWithReport(
            aiDeepResearchRunUuid,
            'completed',
            resultMarkdown,
        );
    }

    async markPartiallyCompleted(
        aiDeepResearchRunUuid: string,
        resultMarkdown: string,
    ): Promise<boolean> {
        return this.markWithReport(
            aiDeepResearchRunUuid,
            'partially_completed',
            resultMarkdown,
        );
    }

    async markFailed(
        aiDeepResearchRunUuid: string,
        errorMessage: string,
    ): Promise<boolean> {
        return this.database.transaction(async (transaction) => {
            const [run] = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
                .whereIn('status', ['queued', 'running'])
                .update({
                    status: 'failed',
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
            return true;
        });
    }

    async markCancelled(aiDeepResearchRunUuid: string): Promise<boolean> {
        return this.database.transaction(async (transaction) => {
            const [run] = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
                .where('status', 'running')
                .whereNotNull('cancellation_requested_at')
                .update({
                    status: 'cancelled',
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
                return queuedRun;
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

            await Promise.all(
                runs.map((run) =>
                    AiDeepResearchRunModel.insertEvent(
                        transaction,
                        run.ai_deep_research_run_uuid,
                        'status_changed',
                        { status: 'failed' },
                    ),
                ),
            );
            return runs;
        });
    }
}
