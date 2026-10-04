import { Knex } from 'knex';

export const AiThreadFileTableName = 'ai_thread_file';

export type DbAiThreadFile = {
    ai_thread_file_uuid: string;
    organization_uuid: string;
    created_by_user_uuid: string | null;
    ai_thread_uuid: string | null;
    ai_prompt_uuid: string | null;
    file_name: string;
    content: string;
    size_bytes: number;
    created_at: Date;
    claimed_at: Date | null;
};

export type AiThreadFileTable = Knex.CompositeTableType<
    DbAiThreadFile,
    Pick<
        DbAiThreadFile,
        | 'organization_uuid'
        | 'created_by_user_uuid'
        | 'file_name'
        | 'content'
        | 'size_bytes'
    >,
    Pick<DbAiThreadFile, 'ai_thread_uuid' | 'ai_prompt_uuid' | 'claimed_at'>
>;
