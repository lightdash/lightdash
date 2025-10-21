import { Knex } from 'knex';

export const DownloadAuditTableName = 'download_audit';

export type DbDownloadAudit = {
    download_audit_id: number;
    download_uuid: string;
    query_uuid: string;
    user_uuid: string | null;
    organization_uuid: string;
    project_uuid: string | null;
    file_type: string;
    downloaded_at: Date;
    original_query_context: string | null;
};

type CreateDownloadAudit = Pick<
    DbDownloadAudit,
    | 'query_uuid'
    | 'user_uuid'
    | 'organization_uuid'
    | 'project_uuid'
    | 'file_type'
    | 'original_query_context'
>;

export type DownloadAuditTable = Knex.CompositeTableType<
    DbDownloadAudit,
    CreateDownloadAudit
>;
