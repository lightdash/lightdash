import { type AiThreadImageMediaType } from '@lightdash/common';
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
    kind: 'text' | 'image';
    storage_key: string | null;
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
    > &
        Partial<
            Pick<DbAiThreadFile, 'ai_thread_file_uuid' | 'kind' | 'storage_key'>
        >,
    Pick<DbAiThreadFile, 'ai_thread_uuid' | 'ai_prompt_uuid' | 'claimed_at'>
>;

export const AiThreadImageObjectTableName = 'ai_thread_image_object';

/** Deliberately independent of cascading tenant and thread deletion. */
export type DbAiThreadImageObject = {
    storage_key: string;
    organization_uuid: string;
    media_type: AiThreadImageMediaType;
    width: number;
    height: number;
    size_bytes: number;
    created_at: Date;
    uploaded_at: Date | null;
    cleanup_attempted_at: Date | null;
    expires_at: Date;
    object_deleted_at: Date | null;
};

export type AiThreadImageObjectTable = Knex.CompositeTableType<
    DbAiThreadImageObject,
    Omit<
        DbAiThreadImageObject,
        'uploaded_at' | 'object_deleted_at' | 'cleanup_attempted_at'
    >,
    Partial<
        Pick<
            DbAiThreadImageObject,
            'uploaded_at' | 'object_deleted_at' | 'cleanup_attempted_at'
        >
    >
>;
