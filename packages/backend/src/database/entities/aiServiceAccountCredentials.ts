import {
    type WarehouseServiceAuthMethod,
    type WarehouseTypes,
} from '@lightdash/common';
import { type Knex } from 'knex';

export const AiServiceAccountCredentialsTableName =
    'ai_service_account_credentials';

export type DbAiServiceAccountCredentials = {
    ai_service_account_credential_uuid: string;
    identity_uuid: string;
    project_uuid: string;
    warehouse_connection_uuid: string | null;
    kind: 'ai_service_account';
    scope: 'connection';
    created_by_user_uuid: string | null;
    updated_by_user_uuid: string | null;
    credential_subject_user_uuid: string | null;
    warehouse_type: WarehouseTypes;
    authentication_method: WarehouseServiceAuthMethod;
    encrypted_credentials: Buffer;
    created_at: Date;
    updated_at: Date;
};

export type DbAiServiceAccountCredentialsInsert = Pick<
    DbAiServiceAccountCredentials,
    | 'project_uuid'
    | 'warehouse_connection_uuid'
    | 'warehouse_type'
    | 'authentication_method'
    | 'encrypted_credentials'
> &
    Partial<
        Omit<
            DbAiServiceAccountCredentials,
            | 'project_uuid'
            | 'warehouse_connection_uuid'
            | 'warehouse_type'
            | 'authentication_method'
            | 'encrypted_credentials'
        >
    >;

export type AiServiceAccountCredentialsTable = Knex.CompositeTableType<
    DbAiServiceAccountCredentials,
    DbAiServiceAccountCredentialsInsert,
    Partial<DbAiServiceAccountCredentialsInsert>
>;
