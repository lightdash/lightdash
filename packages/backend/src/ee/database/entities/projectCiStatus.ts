import { Knex } from 'knex';

export const ProjectCiStatusTableName = 'project_ci_status';

export type DbProjectCiStatus = {
    project_ci_status_uuid: string;
    project_uuid: string;
    has_preview_deploy_workflow: boolean;
    workflow_path: string | null;
    detected_commit_sha: string | null;
    checked_at: Date;
};

export type DbProjectCiStatusInsert = Omit<
    DbProjectCiStatus,
    'project_ci_status_uuid' | 'checked_at'
> & { checked_at?: Date };

export type ProjectCiStatusTable = Knex.CompositeTableType<
    DbProjectCiStatus,
    DbProjectCiStatusInsert,
    Partial<DbProjectCiStatusInsert>
>;
