import { ProjectType } from 'common';
import { Knex } from 'knex';

export const ProjectTableName = 'projects';

type DbProject = {
    project_id: number;
    project_uuid: string;
    name: string;
    created_at: Date;
    organization_id: number;
    dbt_connection_type: ProjectType | null;
    dbt_connection: Buffer | null;
};

type CreateDbProject = Pick<
    DbProject,
    'name' | 'organization_id' | 'dbt_connection' | 'dbt_connection_type'
>;
type UpdateDbProject = Pick<
    DbProject,
    'name' | 'dbt_connection' | 'dbt_connection_type'
>;

export type ProjectTable = Knex.CompositeTableType<
    DbProject,
    CreateDbProject,
    UpdateDbProject
>;
