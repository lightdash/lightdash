import {
    type CredentialOwnerKind,
    type CredentialPurpose,
    type WarehouseTypes,
} from '@lightdash/common';
import { type Knex } from 'knex';

export const CredentialsTableName = 'credentials';

export type DbCredentials = {
    credential_uuid: string;
    organization_uuid: string;
    owner_kind: CredentialOwnerKind;
    owner_user_uuid: string | null;
    owner_project_uuid: string | null;
    owner_warehouse_connection_uuid: string | null;
    purpose: CredentialPurpose;
    warehouse_type: WarehouseTypes | null;
    auth_mode: string;
    subject_user_uuid: string | null;
    subject_label: string | null;
    issuer_credential_uuid: string | null;
    oauth_grant_uuid: string | null;
    generation: string;
    expires_at: Date | null;
    rotated_at: Date | null;
    created_at: Date;
    updated_at: Date;
    created_by_user_uuid: string | null;
    updated_by_user_uuid: string | null;
    identity: Record<string, unknown>;
    encrypted_secrets: Buffer;
    source_table: string | null;
    source_key: string | null;
    source_fingerprint: string | null;
};

export type DbCredentialsInsert = Pick<
    DbCredentials,
    | 'organization_uuid'
    | 'owner_kind'
    | 'purpose'
    | 'auth_mode'
    | 'encrypted_secrets'
> &
    Partial<DbCredentials>;

export type CredentialsTable = Knex.CompositeTableType<
    DbCredentials,
    DbCredentialsInsert,
    Knex.MaybeRawRecord<Partial<DbCredentialsInsert>>
>;
