import { Knex } from 'knex';

export type DbScimRequestLog = {
    scim_request_log_uuid: string;
    organization_uuid: string;
    service_account_uuid: string | null;
    method: string;
    url: string;
    action: string;
    target_identity: string | null;
    target_uuid: string | null;
    affected_roles: string[];
    status: number;
    error_detail: string | null;
    scim_type: string | null;
    created_at: Date;
};

// affected_roles is JSON-stringified on insert (pg would treat a JS array
// as a Postgres array, not jsonb)
export type DbCreateScimRequestLog = Omit<
    DbScimRequestLog,
    'scim_request_log_uuid' | 'created_at' | 'affected_roles'
> & { affected_roles: string };

export type ScimRequestLogTable = Knex.CompositeTableType<
    DbScimRequestLog,
    DbCreateScimRequestLog
>;

export const ScimRequestLogsTableName = 'scim_request_logs';
