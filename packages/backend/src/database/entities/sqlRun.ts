import { SqlRunResultsPreview, SupportedDbtAdapter } from '@lightdash/common';
import { Knex } from 'knex';

export const SqlRunTableName = 'sql_run_history';

export type DbSqlRun = {
    sql_run_uuid: string;
    sql: string;
    project_uuid: string;
    created_by_organization_id: number | null;
    created_by_user_id: number | null;
    results_preview: SqlRunResultsPreview;
    created_at: Date;
    target_database: SupportedDbtAdapter;
};

export type DbCreateSqlRun = Pick<
    DbSqlRun,
    | 'sql'
    | 'project_uuid'
    | 'created_by_organization_id'
    | 'created_by_user_id'
    | 'results_preview'
    | 'target_database'
>;

export type SqlRunHistoryTable = Knex.CompositeTableType<
    DbSqlRun,
    DbCreateSqlRun
>;
