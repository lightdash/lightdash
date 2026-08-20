import {
    type ExternalSourceConnection,
    type ExternalSourceStatus,
    type ExternalSourceType,
    type ResultColumns,
} from '@lightdash/common';
import { Knex } from 'knex';
import { type PreAggregateDuckdbLocator } from '../../utils/duckdb/duckdbSqlTables';

export const ExternalSourcesTableName = 'external_sources';
export const ExternalSourceTablesTableName = 'external_source_tables';

export type DbExternalSource = {
    external_source_uuid: string;
    project_uuid: string;
    type: ExternalSourceType;
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
