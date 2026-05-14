import {
    AnyType,
    DbtProjectType,
    GroupType,
    ProjectDefaults,
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
    organization_warehouse_credentials_uuid: string | null;
    table_selection_type: TableSelectionType;
    table_selection_value: string[] | null;
    copied_from_project_uuid: string | null;
    dbt_version: string;
    scheduler_timezone: string;
    query_timezone: string | null;
    use_project_timezone_in_filters: boolean;
    scheduler_failure_notify_recipients: boolean;
    scheduler_failure_include_contact: boolean;
    scheduler_failure_contact_override: string | null;
    created_by_user_uuid: string | null;
    has_default_user_spaces: boolean;
    project_defaults: ProjectDefaults | null;
    color_palette_uuid: string | null;
    table_groups: Record<string, GroupType> | null;
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
    | 'organization_warehouse_credentials_uuid'
> & {
    scheduler_timezone?: string; // On create it will default to 'UTC' as per migration
    query_timezone?: string | null;
    use_project_timezone_in_filters?: boolean; // On create it will default to false as per migration
};
type UpdateDbProject = Partial<
    Pick<
        DbProject,
        | 'name'
        | 'dbt_connection'
        | 'dbt_connection_type'
        | 'organization_warehouse_credentials_uuid'
        | 'table_selection_type'
        | 'table_selection_value'
        | 'dbt_version'
        | 'copied_from_project_uuid'
        | 'scheduler_timezone'
        | 'query_timezone'
        | 'use_project_timezone_in_filters'
        | 'scheduler_failure_notify_recipients'
        | 'scheduler_failure_include_contact'
        | 'scheduler_failure_contact_override'
        | 'has_default_user_spaces'
        | 'project_defaults'
        | 'color_palette_uuid'
        | 'table_groups'
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
