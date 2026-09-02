import {
    type ExternalSourceConnection,
    type ExternalSourceScope,
    type ExternalSourceStatus,
    type ExternalSourceType,
    type ResultColumns,
} from '@lightdash/common';
import { Knex } from 'knex';
import { type PreAggregateDuckdbLocator } from '../../utils/duckdb/duckdbSqlTables';

export const ExternalSourcesTableName = 'external_sources';
export const ExternalSourceTablesTableName = 'external_source_tables';
export const ExternalSourceCredentialsTableName = 'external_source_credentials';
export const ExternalSourceIngestAttemptsTableName =
    'external_source_ingest_attempts';
export const ExternalSourceObjectsTableName = 'external_source_objects';

export type ExternalSourceIngestAttemptPhase =
    | 'queued'
    | 'running'
    | 'publishing'
    | 'succeeded'
    | 'failed'
    | 'cancelled';

// Attachment-prefixed states keep rolling-deploy legacy workers from claiming
// private attachment jobs through the catalog recovery queue.
export type ExternalSourceIngestAttemptStatus =
    | ExternalSourceIngestAttemptPhase
    | `attachment_${ExternalSourceIngestAttemptPhase}`;

export type ExternalSourceObjectStatus =
    | 'uploading'
    | 'active'
    | 'pending_delete'
    | 'deleted';

export type DbExternalSource = {
    external_source_uuid: string;
    project_uuid: string;
    type: ExternalSourceType;
    scope: ExternalSourceScope | null;
    name: string;
    status: ExternalSourceStatus;
    error_message: string | null;
    connection: ExternalSourceConnection;
    created_by_user_uuid: string | null;
    refresh_cron: string | null;
    last_refreshed_at: Date | null;
    created_at: Date;
    updated_at: Date;
};

export type DbExternalSourceIn = Omit<
    DbExternalSource,
    | 'external_source_uuid'
    | 'error_message'
    | 'refresh_cron'
    | 'last_refreshed_at'
    | 'created_at'
    | 'updated_at'
> &
    Partial<Omit<DbExternalSource, 'created_at' | 'updated_at'>>;

export type DbExternalSourceUpdate = Partial<
    Pick<
        DbExternalSource,
        | 'name'
        | 'scope'
        | 'status'
        | 'error_message'
        | 'connection'
        | 'refresh_cron'
        | 'last_refreshed_at'
        | 'updated_at'
    >
>;

export type ExternalSourcesTable = Knex.CompositeTableType<
    DbExternalSource,
    DbExternalSourceIn,
    DbExternalSourceUpdate
>;

export type DbExternalSourceTable = {
    external_source_table_uuid: string;
    external_source_uuid: string;
    project_uuid: string;
    name: string;
    label: string;
    columns: ResultColumns | null;
    locator: PreAggregateDuckdbLocator | null;
    row_count: number | null;
    total_bytes: number | null;
    version: number;
    last_ingested_at: Date | null;
    created_at: Date;
    updated_at: Date;
};

export type DbExternalSourceTableIn = Pick<
    DbExternalSourceTable,
    'external_source_uuid' | 'project_uuid' | 'name' | 'label'
> &
    Partial<Omit<DbExternalSourceTable, 'created_at' | 'updated_at'>>;

export type DbExternalSourceTableUpdate = Partial<
    Pick<
        DbExternalSourceTable,
        | 'label'
        | 'columns'
        | 'locator'
        | 'row_count'
        | 'total_bytes'
        | 'version'
        | 'last_ingested_at'
        | 'updated_at'
    >
>;

export type ExternalSourceTablesTable = Knex.CompositeTableType<
    DbExternalSourceTable,
    DbExternalSourceTableIn,
    DbExternalSourceTableUpdate
>;

export type DbExternalSourceCredential = {
    external_source_uuid: string;
    provider: string;
    encrypted_refresh_token: Buffer;
    connected_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type ExternalSourceCredentialsTable = Knex.CompositeTableType<
    DbExternalSourceCredential,
    Pick<
        DbExternalSourceCredential,
        | 'external_source_uuid'
        | 'provider'
        | 'encrypted_refresh_token'
        | 'connected_by_user_uuid'
    >,
    Partial<
        Pick<
            DbExternalSourceCredential,
            | 'provider'
            | 'encrypted_refresh_token'
            | 'connected_by_user_uuid'
            | 'updated_at'
        >
    >
>;

export type DbExternalSourceIngestAttempt = {
    external_source_ingest_attempt_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    external_source_uuid: string;
    external_source_table_uuid: string;
    requested_by_user_uuid: string | null;
    target_version: number;
    status: ExternalSourceIngestAttemptStatus;
    execution_uuid: string | null;
    lease_expires_at: Date | null;
    run_count: number;
    columns: ResultColumns | null;
    locator: PreAggregateDuckdbLocator | null;
    row_count: number | null;
    total_bytes: number | null;
    error_message: string | null;
    created_at: Date;
    updated_at: Date;
    finished_at: Date | null;
};

type DbExternalSourceIngestAttemptIn = Pick<
    DbExternalSourceIngestAttempt,
    | 'organization_uuid'
    | 'project_uuid'
    | 'external_source_uuid'
    | 'external_source_table_uuid'
    | 'requested_by_user_uuid'
    | 'target_version'
> &
    Partial<DbExternalSourceIngestAttempt>;

type DbExternalSourceIngestAttemptUpdate = Partial<
    Omit<DbExternalSourceIngestAttempt, 'external_source_ingest_attempt_uuid'>
>;

export type ExternalSourceIngestAttemptsTable = Knex.CompositeTableType<
    DbExternalSourceIngestAttempt,
    DbExternalSourceIngestAttemptIn,
    DbExternalSourceIngestAttemptUpdate
>;

export type DbExternalSourceObject = {
    external_source_object_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    external_source_uuid: string;
    external_source_ingest_attempt_uuid: string | null;
    object_key: string;
    purpose: 'raw' | 'parquet';
    status: ExternalSourceObjectStatus;
    size_bytes: number | null;
    delete_after: Date | null;
    delete_attempts: number;
    last_error: string | null;
    created_at: Date;
    updated_at: Date;
};

type DbExternalSourceObjectIn = Pick<
    DbExternalSourceObject,
    | 'organization_uuid'
    | 'project_uuid'
    | 'external_source_uuid'
    | 'external_source_ingest_attempt_uuid'
    | 'object_key'
    | 'purpose'
> &
    Partial<DbExternalSourceObject>;

type DbExternalSourceObjectUpdate = Partial<
    Omit<DbExternalSourceObject, 'external_source_object_uuid'>
>;

export type ExternalSourceObjectsTable = Knex.CompositeTableType<
    DbExternalSourceObject,
    DbExternalSourceObjectIn,
    DbExternalSourceObjectUpdate
>;
