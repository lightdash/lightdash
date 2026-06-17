import {
    type ApiKeyLocation,
    type ExternalConnectionAuthType,
    type ExternalConnectionMethod,
} from '@lightdash/common';
import { type Knex } from 'knex';

export const ExternalConnectionsTableName = 'external_connections';
export const ExternalConnectionSecretsTableName = 'external_connection_secrets';
export const AppExternalConnectionsTableName = 'app_external_connections';
export const ExternalConnectionRateCountersTableName =
    'external_connection_rate_counters';

export type DbExternalConnection = {
    external_connection_uuid: string;
    project_uuid: string;
    organization_uuid: string;
    name: string;
    type: ExternalConnectionAuthType;
    origin: string;
    allowed_path_prefixes: string[];
    allowed_methods: ExternalConnectionMethod[];
    allowed_content_types: string[];
    response_max_bytes: number;
    request_max_bytes: number;
    timeout_ms: number;
    rate_limit_per_minute: number | null;
    api_key_name: string | null;
    api_key_location: ApiKeyLocation | null;
    created_by_user_uuid: string | null;
    updated_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
    last_test_sample: unknown | null; // jsonb; sanitized, never secrets
    last_tested_at: Date | null;
};

type DbSaveExternalConnectionSample = {
    last_test_sample: unknown | null;
    last_tested_at: Date;
};

export type ExternalConnectionsTable = Knex.CompositeTableType<
    DbExternalConnection,
    Pick<
        DbExternalConnection,
        'project_uuid' | 'organization_uuid' | 'name' | 'type' | 'origin'
    > & {
        // jsonb columns are written as serialized JSON strings (read back as arrays)
        allowed_path_prefixes: string;
        allowed_methods: string;
        allowed_content_types: string;
    } & Partial<
            Pick<
                DbExternalConnection,
                | 'external_connection_uuid'
                | 'response_max_bytes'
                | 'request_max_bytes'
                | 'timeout_ms'
                | 'rate_limit_per_minute'
                | 'api_key_name'
                | 'api_key_location'
                | 'created_by_user_uuid'
                | 'updated_by_user_uuid'
            >
        >,
    | Partial<
          Pick<
              DbExternalConnection,
              | 'name'
              | 'type'
              | 'origin'
              | 'response_max_bytes'
              | 'request_max_bytes'
              | 'timeout_ms'
              | 'rate_limit_per_minute'
              | 'api_key_name'
              | 'api_key_location'
              | 'updated_by_user_uuid'
              | 'updated_at'
              | 'deleted_at'
          > & {
              // jsonb columns written as serialized JSON strings
              allowed_path_prefixes: string;
              allowed_methods: string;
              allowed_content_types: string;
          }
      >
    | DbSaveExternalConnectionSample
>;

export type DbExternalConnectionSecret = {
    external_connection_uuid: string;
    encrypted_payload: Buffer;
    created_at: Date;
    rotated_at: Date | null;
};

export type ExternalConnectionSecretsTable = Knex.CompositeTableType<
    DbExternalConnectionSecret,
    Pick<
        DbExternalConnectionSecret,
        'external_connection_uuid' | 'encrypted_payload'
    >,
    Partial<
        Pick<DbExternalConnectionSecret, 'encrypted_payload' | 'rotated_at'>
    >
>;

export type DbAppExternalConnection = {
    app_id: string;
    external_connection_uuid: string;
    alias: string;
    created_at: Date;
};

export type AppExternalConnectionsTable = Knex.CompositeTableType<
    DbAppExternalConnection,
    Pick<
        DbAppExternalConnection,
        'app_id' | 'external_connection_uuid' | 'alias'
    >
>;

export type DbExternalConnectionRateCounter = {
    external_connection_uuid: string;
    app_id: string;
    window_started_at: Date;
    request_count: number;
};

export type ExternalConnectionRateCountersTable = Knex.CompositeTableType<
    DbExternalConnectionRateCounter,
    Pick<
        DbExternalConnectionRateCounter,
        'external_connection_uuid' | 'app_id' | 'window_started_at'
    > &
        Partial<Pick<DbExternalConnectionRateCounter, 'request_count'>>,
    Partial<Pick<DbExternalConnectionRateCounter, 'request_count'>>
>;
