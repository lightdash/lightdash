import {
    DbtProjectType,
    ProjectBaseType,
    TableSelectionType,
} from '@lightdash/common';
import { Knex } from 'knex';

export const ProjectTableName = 'projects';
export const CachedExploresTableName = 'cached_explores';
export const CachedWarehouseTableName = 'cached_warehouse';

export type DbProject = {
    project_id: number;
    project_uuid: string;
    name: string;
    project_type: ProjectBaseType;
    created_at: Date;
    organization_id: number;
    dbt_connection_type: DbtProjectType | null;
    dbt_connection: Buffer | null;
    table_selection_type: TableSelectionType;
    table_selection_value: string[] | null;
};

type CreateDbProject = Pick<
    DbProject,
    | 'name'
    | 'organization_id'
    | 'project_type'
    | 'dbt_connection'
    | 'dbt_connection_type'
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

export type DbCachedExplores = {
    project_uuid: string;
    explores: any;
};

export type CachedExploresTable = Knex.CompositeTableType<DbCachedExplores>;

export type DbCachedWarehouse = {
    project_uuid: string;
    warehouse: any;
};

export type CachedWarehouseTable = Knex.CompositeTableType<DbCachedWarehouse>;
