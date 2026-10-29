import {
    type ApiKeyLocation,
    type ExternalConnectionAuthType,
    type ExternalConnectionKind,
    type ExternalConnectionMethod,
    type OAuthClientAuthMethod,
} from '@lightdash/common';
import { type Knex } from 'knex';

export const ExternalConnectionsTableName = 'external_connections';
export const ExternalConnectionSecretsTableName = 'external_connection_secrets';
export const AppExternalConnectionsTableName = 'app_external_connections';
export const ExternalConnectionRateCountersTableName =
    'external_connection_rate_counters';
export const ExternalConnectionSamplesTableName = 'external_connection_samples';
export const ApiSourceCallCountersTableName = 'api_source_call_counters';
export const ApiSourceCallLeasesTableName = 'api_source_call_leases';
export const ApiSourceCallsTableName = 'api_source_calls';

export type DbExternalConnection = {
    external_connection_uuid: string;
    project_uuid: string;
    organization_uuid: string;
    name: string;
    // Portable identity: unique per project among live rows, stable across renames
    slug: string;
    type: ExternalConnectionAuthType;
    origin: string;
    allow_browser_images: boolean;
    allow_data_app_builder_linking: boolean;
    forward_user_identity: boolean;
    instructions: string | null;
    allowed_path_prefixes: string[];
    allowed_methods: ExternalConnectionMethod[];
    allowed_content_types: string[];
    response_max_bytes: number;
    request_max_bytes: number;
    timeout_ms: number;
    rate_limit_per_minute: number | null;
    api_key_name: string | null;
    api_key_location: ApiKeyLocation | null;
    oauth_scopes: string[] | null;
    oauth_token_url: string | null;
    oauth_client_id: string | null;
    oauth_client_auth_method: OAuthClientAuthMethod | null;
    custom_headers: Record<string, string> | null;
    connection_kind: ExternalConnectionKind;
    // Parsed against the connector schema on read
    api_source: unknown;
    created_by_user_uuid: string | null;
    updated_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
};

export type ExternalConnectionsTable = Knex.CompositeTableType<
    DbExternalConnection,
    Pick<
        DbExternalConnection,
        | 'project_uuid'
        | 'organization_uuid'
        | 'name'
        | 'slug'
        | 'type'
        | 'origin'
        | 'connection_kind'
    > & {
        // jsonb columns are written as serialized JSON strings (read back as arrays)
        allowed_path_prefixes: string;
        allowed_methods: string;
        allowed_content_types: string;
        oauth_scopes?: string | null;
        custom_headers?: string | null;
        api_source?: string | null;
    } & Partial<
            Pick<
                DbExternalConnection,
                | 'external_connection_uuid'
                | 'instructions'
                | 'response_max_bytes'
                | 'request_max_bytes'
                | 'timeout_ms'
                | 'rate_limit_per_minute'
                | 'api_key_name'
                | 'api_key_location'
                | 'oauth_token_url'
                | 'oauth_client_id'
                | 'oauth_client_auth_method'
                | 'allow_browser_images'
                | 'allow_data_app_builder_linking'
                | 'forward_user_identity'
                | 'created_by_user_uuid'
                | 'updated_by_user_uuid'
            >
        >,
    Partial<
        Pick<
            DbExternalConnection,
            | 'name'
            | 'type'
            | 'origin'
            | 'instructions'
            | 'response_max_bytes'
            | 'request_max_bytes'
            | 'timeout_ms'
            | 'rate_limit_per_minute'
            | 'api_key_name'
            | 'api_key_location'
            | 'oauth_token_url'
            | 'oauth_client_id'
            | 'oauth_client_auth_method'
            | 'allow_browser_images'
            | 'allow_data_app_builder_linking'
            | 'forward_user_identity'
            | 'updated_by_user_uuid'
            | 'updated_at'
            | 'deleted_at'
        > & {
            // jsonb columns written as serialized JSON strings
            allowed_path_prefixes: string;
            allowed_methods: string;
            allowed_content_types: string;
            oauth_scopes: string | null;
            custom_headers: string | null;
            api_source: string | null;
        }
    >
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

/** Calls a live source made in one window of `window_seconds`. */
export type DbApiSourceCallCounter = {
    external_connection_uuid: string;
    window_seconds: number;
    window_started_at: Date;
    call_count: number;
};

export type ApiSourceCallCountersTable = Knex.CompositeTableType<
    DbApiSourceCallCounter,
    Pick<
        DbApiSourceCallCounter,
        'external_connection_uuid' | 'window_seconds' | 'window_started_at'
    > &
        Partial<Pick<DbApiSourceCallCounter, 'call_count'>>,
    Partial<Pick<DbApiSourceCallCounter, 'call_count'>>
>;

/** One of a live source's concurrent call slots, held until `expires_at`. */
export type DbApiSourceCallLease = {
    external_connection_uuid: string;
    slot: number;
    lease_uuid: string;
    expires_at: Date;
};

export type ApiSourceCallLeasesTable = Knex.CompositeTableType<
    DbApiSourceCallLease,
    DbApiSourceCallLease,
    Partial<Pick<DbApiSourceCallLease, 'lease_uuid' | 'expires_at'>>
>;

/** One query a live source sent to its integration, written once it finished. */
export type DbApiSourceCall = {
    api_source_call_uuid: string;
    external_connection_uuid: string;
    project_uuid: string;
    user_uuid: string | null;
    context: string;
    query_uuid: string;
    query: string;
    row_limit: number;
    outcome: string;
    error_message: string | null;
    provider_status: number | null;
    api_calls: number;
    duration_ms: number;
    row_count: number | null;
    column_count: number | null;
    truncated: boolean | null;
    response_bytes: number | null;
    created_at: Date;
};

export type ApiSourceCallsTable = Knex.CompositeTableType<
    DbApiSourceCall,
    Omit<DbApiSourceCall, 'api_source_call_uuid' | 'created_at'>,
    never
>;

export type DbExternalConnectionSample = {
    sample_uuid: string;
    external_connection_uuid: string;
    label: string | null;
    // jsonb columns come back as parsed objects on read
    request: unknown;
    response: unknown;
    created_by_user_uuid: string | null;
    created_at: Date;
};

export type ExternalConnectionSamplesTable = Knex.CompositeTableType<
    DbExternalConnectionSample,
    // INSERT shape — jsonb columns written as serialized JSON strings
    Pick<DbExternalConnectionSample, 'external_connection_uuid'> & {
        request: string;
        response: string;
    } & Partial<
            Pick<
                DbExternalConnectionSample,
                'sample_uuid' | 'label' | 'created_by_user_uuid'
            >
        >,
    // UPDATE shape — not used
    never
>;
