import {
    UnexpectedDatabaseError,
    type AiSchedulerAgentPromptConfig,
    type AiSchedulerSavedContentConfig,
    type UpsertAiSchedulerConfig,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    AiSchedulerTableName,
    DbAiScheduler,
} from '../database/entities/aiScheduler';

// Server-only view: adds the persistent report thread the worker builds on
// across runs. Kept out of the API-facing AiSchedulerConfig.
export type AiSchedulerAgentPromptConfigInternal =
    AiSchedulerAgentPromptConfig & {
        reportThreadUuid: string | null;
    };

export type AiSchedulerConfigInternal =
    | AiSchedulerAgentPromptConfigInternal
    | AiSchedulerSavedContentConfig;

const fromRow = (row: DbAiScheduler): AiSchedulerConfigInternal => {
    if (row.type === 'savedContent') {
        return {
            type: 'savedContent',
            schedulerUuid: row.scheduler_uuid,
            prompt: row.prompt,
        };
    }
    if (!row.agent_uuid) {
        throw new UnexpectedDatabaseError(
            `Agent scheduler config ${row.scheduler_uuid} is missing an agent`,
        );
    }
    return {
        type: 'agentPrompt',
        schedulerUuid: row.scheduler_uuid,
        agentUuid: row.agent_uuid,
        prompt: row.prompt,
        sourceThreadUuid: row.source_thread_uuid,
        includeSourceThread: row.include_source_thread,
        includeRunHistory: row.include_run_history,
        reportThreadUuid: row.report_thread_uuid,
    };
};

const toRow = (config: UpsertAiSchedulerConfig) =>
    config.type === 'agentPrompt'
        ? {
              type: 'agentPrompt' as const,
              agent_uuid: config.agentUuid,
              prompt: config.prompt,
              source_thread_uuid: config.sourceThreadUuid,
              include_source_thread: config.includeSourceThread,
              include_run_history: config.includeRunHistory,
          }
        : {
              type: 'savedContent' as const,
              agent_uuid: null,
              prompt: config.prompt,
              source_thread_uuid: null,
              include_source_thread: false,
              include_run_history: false,
          };

export class AiSchedulerModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async find(
        schedulerUuid: string,
    ): Promise<AiSchedulerConfigInternal | null> {
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
        const row = toRow(config);
        await (trx ?? this.database)(AiSchedulerTableName)
            .insert({ scheduler_uuid: schedulerUuid, ...row })
            .onConflict('scheduler_uuid')
            .merge({ ...row, updated_at: new Date() });
    }

    // Remembers the thread an agent run built on so the next run can continue it.
    async setReportThread(
        schedulerUuid: string,
        reportThreadUuid: string,
        trx?: Knex,
    ): Promise<void> {
        await (trx ?? this.database)(AiSchedulerTableName)
            .where('scheduler_uuid', schedulerUuid)
            .update({ report_thread_uuid: reportThreadUuid });
    }

    // Explicit detach. Deleting the agent needs no code — agent_uuid is ON DELETE
    // CASCADE.
    async remove(schedulerUuid: string, trx?: Knex): Promise<void> {
        await (trx ?? this.database)(AiSchedulerTableName)
            .where('scheduler_uuid', schedulerUuid)
            .delete();
    }
}
