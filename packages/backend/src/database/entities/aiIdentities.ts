import { AiIdentityFailureReason, AiIdentityStatus } from '@lightdash/common';
import { Knex } from 'knex';

export const AiIdentitiesTableName = 'ai_identities';

export type DbAiIdentity = {
    ai_identity_uuid: string;
    ai_identity_account_uuid: string;
    user_uuid: string;
    snowflake_login: string | null;
    twin_name_override: string | null;
    public_key: string | null;
    public_key_fingerprint: string | null;
    encrypted_private_key: Buffer | null;
    created_by_provisioner: boolean;
    provisioned_role: string | null;
    provisioned_user_name: string | null;
    provisioned_public_key_fingerprint: string | null;
    status: AiIdentityStatus;
    failure_reason: AiIdentityFailureReason | null;
    status_message: string | null;
    checked_at: Date | null;
    created_at: Date;
    updated_at: Date;
};

export type AiIdentitiesTable = Knex.CompositeTableType<
    DbAiIdentity,
    Pick<DbAiIdentity, 'ai_identity_account_uuid' | 'user_uuid'>,
    Partial<
        Omit<
            DbAiIdentity,
            | 'ai_identity_uuid'
            | 'ai_identity_account_uuid'
            | 'user_uuid'
            | 'created_at'
        >
    >
>;
