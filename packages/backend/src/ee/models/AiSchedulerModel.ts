import {
    type AiSchedulerConfig,
    type UpsertAiSchedulerConfig,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    AiSchedulerTableName,
    DbAiScheduler,
} from '../database/entities/aiScheduler';

const fromRow = (row: DbAiScheduler): AiSchedulerConfig => ({
    schedulerUuid: row.scheduler_uuid,
    agentUuid: row.agent_uuid,
    prompt: row.prompt,
    sourceThreadUuid: row.source_thread_uuid,
    includeSourceThread: row.include_source_thread,
    includeRunHistory: row.include_run_history,
});

export class AiSchedulerModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async find(schedulerUuid: string): Promise<AiSchedulerConfig | null> {
        const row = await this.database(AiSchedulerTableName)
            .where('scheduler_uuid', schedulerUuid)
            .first();
        return row ? fromRow(row) : null;
    }

    async upsert(
        schedulerUuid: string,
        config: UpsertAiSchedulerConfig,
        trx?: Knex,
    ): Promise<void> {
        await (trx ?? this.database)(AiSchedulerTableName)
            .insert({
                scheduler_uuid: schedulerUuid,
                agent_uuid: config.agentUuid,
                prompt: config.prompt,
                source_thread_uuid: config.sourceThreadUuid,
                include_source_thread: config.includeSourceThread,
                include_run_history: config.includeRunHistory,
            })
            .onConflict('scheduler_uuid')
            .merge({
                agent_uuid: config.agentUuid,
                prompt: config.prompt,
                source_thread_uuid: config.sourceThreadUuid,
                include_source_thread: config.includeSourceThread,
                include_run_history: config.includeRunHistory,
                updated_at: new Date(),
            });
    }

    // Explicit detach. Deleting the agent needs no code — agent_uuid is ON DELETE
    // CASCADE.
    async remove(schedulerUuid: string, trx?: Knex): Promise<void> {
        await (trx ?? this.database)(AiSchedulerTableName)
            .where('scheduler_uuid', schedulerUuid)
            .delete();
    }
}
