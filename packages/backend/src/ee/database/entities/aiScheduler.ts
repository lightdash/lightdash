import { Knex } from 'knex';

export const AiSchedulerTableName = 'ai_scheduler';

export type DbAiScheduler = {
    scheduler_uuid: string;
    agent_uuid: string;
    prompt: string;
    source_thread_uuid: string | null;
    include_source_thread: boolean;
    include_run_history: boolean;
    created_at: Date;
    updated_at: Date;
};

export type AiSchedulerTable = Knex.CompositeTableType<
    DbAiScheduler,
    Omit<DbAiScheduler, 'created_at' | 'updated_at'>,
    Pick<
        DbAiScheduler,
        | 'agent_uuid'
        | 'prompt'
        | 'source_thread_uuid'
        | 'include_source_thread'
        | 'include_run_history'
        | 'updated_at'
    >
>;
