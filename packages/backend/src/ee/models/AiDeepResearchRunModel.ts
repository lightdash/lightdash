import {
    type AiDeepResearchArtifact,
    type AiDeepResearchBudget,
    type AiDeepResearchCheckpoint,
    type AiDeepResearchEventPayload,
    type AiDeepResearchEventPayloadMap,
    type AiDeepResearchEventType,
    type AiDeepResearchExecutionContextSnapshot,
    type AiDeepResearchPolicy,
    type AiDeepResearchProgress,
    type AiDeepResearchReport,
    type AiDeepResearchRunStatus,
    type AiDeepResearchTimings,
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
    agentUuid?: string;
    aiThreadUuid: string | null;
    promptUuid: string | null;
    toolCallId: string | null;
    prompt: string;
    budget: AiDeepResearchBudget;
    policy?: AiDeepResearchPolicy;
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
                    agent_uuid: data.agentUuid ?? null,
                    ai_thread_uuid: data.aiThreadUuid,
                    prompt_uuid: data.promptUuid,
                    tool_call_id: data.toolCallId,
                    prompt: data.prompt,
                    budget_snapshot: data.budget,
                    policy_snapshot: data.policy ?? {
                        instructions: null,
                        maxSteps: 40,
                        maxToolCalls: data.budget.maxToolCalls,
                        maxWarehouseQueries: data.budget.maxWarehouseQueries,
                        maxRuntimeMs: data.budget.maxRuntimeMs,
                    },
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

    async claimRun(
        aiDeepResearchRunUuid: string,
    ): Promise<DbAiDeepResearchRun | undefined> {
        return this.database.transaction(async (transaction) => {
            const [run] = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
                .where((builder) =>
                    builder
                        .where('status', 'queued')
                        .orWhere((running) =>
                            running
                                .where('status', 'running')
                                .andWhere(
                                    'updated_at',
                                    '<',
                                    transaction.raw(
                                        "now() - interval '1 minute'",
                                    ),
                                ),
                        ),
                )
                .whereNull('cancellation_requested_at')
                .update({
                    status: 'running',
                    started_at: transaction.raw(
                        'COALESCE(started_at, now())',
                    ) as unknown as Date,
                    execution_attempts: transaction.raw(
                        'execution_attempts + 1',
                    ) as unknown as number,
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

    async claimQueuedRun(
        aiDeepResearchRunUuid: string,
    ): Promise<DbAiDeepResearchRun | undefined> {
        return this.claimRun(aiDeepResearchRunUuid);
    }

    async appendEvent<EventType extends AiDeepResearchEventType>(
        aiDeepResearchRunUuid: string,
        eventType: EventType,
        payload: AiDeepResearchEventPayloadMap[EventType],
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
                eventType,
                payload,
            );
            await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
                .update({
                    updated_at: transaction.fn.now() as unknown as Date,
                });
            return true;
        });
    }

    async saveExecutionContext(
        aiDeepResearchRunUuid: string,
        snapshot: AiDeepResearchExecutionContextSnapshot,
    ): Promise<boolean> {
        return this.saveCheckpoint(aiDeepResearchRunUuid, 'context_resolved', {
            execution_context_snapshot: snapshot,
        });
    }

    async saveArtifact(
        aiDeepResearchRunUuid: string,
        artifact: AiDeepResearchArtifact,
    ): Promise<boolean> {
        return this.saveCheckpoint(aiDeepResearchRunUuid, 'artifact_created', {
            result: artifact,
        });
    }

    async saveArtifactWithEvents(
        aiDeepResearchRunUuid: string,
        artifact: AiDeepResearchArtifact,
        queries: AiDeepResearchEventPayloadMap['query_provenance'][],
    ): Promise<boolean> {
        return this.database.transaction(async (transaction) => {
            const [run] = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
                .where('status', 'running')
                .whereNull('result')
                .update({
                    result: artifact,
                    checkpoint: 'artifact_created',
                    updated_at: transaction.fn.now() as unknown as Date,
                })
                .returning('*');
            if (!run) {
                return false;
            }
            await AiDeepResearchRunModel.insertEvent(
                transaction,
                aiDeepResearchRunUuid,
                'checkpoint',
                { checkpoint: 'artifact_created' },
            );
            await AiDeepResearchRunModel.insertEvent(
                transaction,
                aiDeepResearchRunUuid,
                'artifact_created',
                {
                    evidenceCount: artifact.evidence.length,
                    queryCount: artifact.queryUuids.length,
                },
            );
            await Promise.all(
                queries.map((query) =>
                    AiDeepResearchRunModel.insertEvent(
                        transaction,
                        aiDeepResearchRunUuid,
                        'query_provenance',
                        query,
                    ),
                ),
            );
            return true;
        });
    }

    async saveCheckpoint(
        aiDeepResearchRunUuid: string,
        checkpoint: AiDeepResearchCheckpoint,
        update: Partial<
            Pick<
                DbAiDeepResearchRun,
                'execution_context_snapshot' | 'result' | 'timings'
            >
        > = {},
    ): Promise<boolean> {
        return this.database.transaction(async (transaction) => {
            const [run] = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
                .where('status', 'running')
                .update({
                    ...update,
                    checkpoint,
                    updated_at: transaction.fn.now() as unknown as Date,
                })
                .returning('*');

            if (!run) {
                return false;
            }

            await AiDeepResearchRunModel.insertEvent(
                transaction,
                aiDeepResearchRunUuid,
                'checkpoint',
                { checkpoint },
            );
            return true;
        });
    }

    async saveTimings(
        aiDeepResearchRunUuid: string,
        timings: AiDeepResearchTimings,
    ): Promise<boolean> {
        const updated = await this.database<AiDeepResearchRunsTable>(
            AiDeepResearchRunsTableName,
        )
            .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
            .update({
                timings,
                updated_at: this.database.fn.now() as unknown as Date,
            });
        return updated > 0;
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

    async releaseForRetry(aiDeepResearchRunUuid: string): Promise<boolean> {
        return this.database.transaction(async (transaction) => {
            const [run] = await transaction<AiDeepResearchRunsTable>(
                AiDeepResearchRunsTableName,
            )
                .where('ai_deep_research_run_uuid', aiDeepResearchRunUuid)
                .where('status', 'running')
                .whereNull('cancellation_requested_at')
                .update({
                    status: 'queued',
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
                { status: 'queued' },
            );
            return true;
        });
    }

    private async markWithReport(
        aiDeepResearchRunUuid: string,
        status: 'completed' | 'partially_completed',
        artifact: AiDeepResearchArtifact,
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
                    result: artifact,
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
        artifact: AiDeepResearchArtifact | AiDeepResearchReport,
    ): Promise<boolean> {
        return this.markWithReport(
            aiDeepResearchRunUuid,
            'completed',
            'finalReport' in artifact
                ? artifact
                : {
                      findings: artifact.findings.map(
                          (finding) => finding.title,
                      ),
                      evidence: [],
                      queryUuids: [],
                      metricDefinitions: [],
                      hypotheses: [],
                      contradictions: [],
                      confidence: 'medium',
                      limitations: artifact.caveats,
                      finalReport: artifact.summary,
                  },
        );
    }

    async markPartiallyCompleted(
        aiDeepResearchRunUuid: string,
        artifact: AiDeepResearchArtifact | AiDeepResearchReport,
    ): Promise<boolean> {
        return this.markWithReport(
            aiDeepResearchRunUuid,
            'partially_completed',
            'finalReport' in artifact
                ? artifact
                : {
                      findings: artifact.findings.map(
                          (finding) => finding.title,
                      ),
                      evidence: [],
                      queryUuids: [],
                      metricDefinitions: [],
                      hypotheses: [],
                      contradictions: [],
                      confidence: 'medium',
                      limitations: artifact.caveats,
                      finalReport: artifact.summary,
                  },
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
