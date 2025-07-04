import {
    AnyType,
    DbtProjectType,
    ProjectType,
    TableSelectionType,
} from '@lightdash/common';
import { Knex } from 'knex';

export const ProjectTableName = 'projects';
export const CachedExploresTableName = 'cached_explores';
export const CachedExploreTableName = 'cached_explore';
export const CachedWarehouseTableName = 'cached_warehouse';

export type DbProject = {
    project_id: number;
    project_uuid: string;
    name: string;
    project_type: ProjectType;
    created_at: Date;
    organization_id: number;
    dbt_connection_type: DbtProjectType | null;
    dbt_connection: Buffer | null;
    table_selection_type: TableSelectionType;
    table_selection_value: string[] | null;
    copied_from_project_uuid: string | null;
    dbt_version: string;
    scheduler_timezone: string;
    created_by_user_uuid: string | null;
};

type CreateDbProject = Pick<
    DbProject,
    | 'name'
    | 'organization_id'
    | 'project_type'
    | 'dbt_connection'
    | 'dbt_connection_type'
    | 'copied_from_project_uuid'
    | 'dbt_version'
    | 'created_by_user_uuid'
> & {
    scheduler_timezone?: string; // On create it will default to 'UTC' as per migration
};
type UpdateDbProject = Partial<
    Pick<
        DbProject,
        | 'name'
        | 'dbt_connection'
        | 'dbt_connection_type'
        | 'table_selection_type'
        | 'table_selection_value'
        | 'dbt_version'
        | 'copied_from_project_uuid'
        | 'scheduler_timezone'
    >
>;

export type ProjectTable = Knex.CompositeTableType<
    DbProject,
    CreateDbProject,
    UpdateDbProject
>;

export type DbCachedExplores = {
    project_uuid: string;
    explores: AnyType;
};

export type CachedExploresTable = Knex.CompositeTableType<DbCachedExplores>;

export type DbCachedExplore = {
    cached_explore_uuid: string;
    project_uuid: string;
    name: string;
    table_names: string[];
    explore: AnyType;
};

export type CachedExploreTable = Knex.CompositeTableType<
    DbCachedExplore,
    Omit<DbCachedExplore, 'cached_explore_uuid'>
>;

export type DbCachedWarehouse = {
    project_uuid: string;
    warehouse: AnyType;
};

export type CachedWarehouseTable = Knex.CompositeTableType<DbCachedWarehouse>;
