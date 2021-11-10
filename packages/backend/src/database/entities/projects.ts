import { Knex } from 'knex';
import { ProjectType, TableSelectionType } from 'common';

export const ProjectTableName = 'projects';

type DbProject = {
    project_id: number;
    project_uuid: string;
    name: string;
    created_at: Date;
    organization_id: number;
    dbt_connection_type: ProjectType | null;
    dbt_connection: Buffer | null;
    table_selection_type: TableSelectionType;
    table_selection_value: string[];
};

type CreateDbProject = Pick<
    DbProject,
    'name' | 'organization_id' | 'dbt_connection' | 'dbt_connection_type'
>;
type UpdateDbProject = Partial<
    Pick<
        DbProject,
        | 'name'
        | 'dbt_connection'
        | 'dbt_connection_type'
        | 'table_selection_type'
        | 'table_selection_value'
    >
>;

export type ProjectTable = Knex.CompositeTableType<
    DbProject,
    CreateDbProject,
    UpdateDbProject
>;
