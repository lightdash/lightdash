import { AiIdentityStatus } from '@lightdash/common';
import { Knex } from 'knex';

export const AiIdentitiesTableName = 'ai_identities';

export type DbAiIdentity = {
    ai_identity_uuid: string;
    project_uuid: string;
    user_uuid: string;
    snowflake_login: string | null;
    twin_name_override: string | null;
    public_key: string;
    public_key_fingerprint: string;
    encrypted_private_key: Buffer;
    status: AiIdentityStatus;
    status_message: string | null;
    checked_at: Date | null;
    created_at: Date;
    updated_at: Date;
};

export type AiIdentitiesTable = Knex.CompositeTableType<
    DbAiIdentity,
    Pick<
        DbAiIdentity,
        | 'project_uuid'
        | 'user_uuid'
        | 'snowflake_login'
        | 'public_key'
        | 'public_key_fingerprint'
        | 'encrypted_private_key'
    >,
    Partial<
        Pick<
            DbAiIdentity,
            | 'snowflake_login'
            | 'twin_name_override'
            | 'public_key'
            | 'public_key_fingerprint'
            | 'encrypted_private_key'
            | 'status'
            | 'status_message'
            | 'checked_at'
            | 'updated_at'
        >
    >
>;
