import { Knex } from 'knex';

export const AiSchedulerTableName = 'ai_scheduler';

export type DbAiScheduler = {
    scheduler_uuid: string;
    type: 'agent' | 'resource';
    agent_uuid: string | null;
    prompt: string;
    source_thread_uuid: string | null;
    include_source_thread: boolean;
    include_run_history: boolean;
    report_thread_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type AiSchedulerTable = Knex.CompositeTableType<
    DbAiScheduler,
    Omit<DbAiScheduler, 'created_at' | 'updated_at' | 'report_thread_uuid'>,
    Partial<
        Pick<
            DbAiScheduler,
            | 'type'
            | 'agent_uuid'
            | 'prompt'
            | 'source_thread_uuid'
            | 'include_source_thread'
            | 'include_run_history'
            | 'report_thread_uuid'
            | 'updated_at'
        >
    >
>;
