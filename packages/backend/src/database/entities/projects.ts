import {
    AgentSqlScope,
    AnyType,
    CompiledField,
    CompiledTable,
    DbtProjectType,
    Explore,
    ExploreError,
    GroupType,
    ProjectDefaults,
    ProjectType,
    TableSelectionType,
} from '@lightdash/common';
import { Knex } from 'knex';

export const ProjectTableName = 'projects';
export const CachedExploresTableName = 'cached_explores';
export const CachedExploreTableName = 'cached_explore';
export const CachedExploreStagingTableName = 'cached_explore_staging';
export const CachedWarehouseTableName = 'cached_warehouse';

export type DbProject = {
    project_id: number;
    project_uuid: string;
    slug: string;
    name: string;
    project_type: ProjectType;
    created_at: Date;
    organization_id: number;
    dbt_connection_type: DbtProjectType | null;
    dbt_connection: Buffer | null;
    dbt_source_uuid: string | null;
    dbt_source_name: string;
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
    expires_at: Date | null;
    default_preview_expiration_hours: number;
    max_preview_expiration_hours: number;
    results_cache_ttl_seconds: number | null;
    provisioning_source: string | null;
    agent_sql_scope: AgentSqlScope | null;
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
    slug?: string;
    scheduler_timezone?: string; // On create it will default to 'UTC' as per migration
    query_timezone?: string | null;
    use_project_timezone_in_filters?: boolean; // On create it will default to false as per migration
    provisioning_source?: string | null;
};
type UpdateDbProject = Partial<
    Pick<
        DbProject,
        | 'name'
        | 'dbt_connection'
        | 'dbt_connection_type'
        | 'dbt_source_name'
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
        | 'expires_at'
        | 'default_preview_expiration_hours'
        | 'max_preview_expiration_hours'
        | 'results_cache_ttl_seconds'
        | 'provisioning_source'
        | 'agent_sql_scope'
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

// Only metadata used by omnibar matching, result display and authorization.
// Keep in sync with the cached_explore_search_metadata database function.
export type CachedExploreSearchField = Pick<
    CompiledField,
    | 'name'
    | 'label'
    | 'description'
    | 'type'
    | 'fieldType'
    | 'table'
    | 'tableLabel'
    | 'hidden'
    | 'requiredAttributes'
    | 'anyAttributes'
    | 'tablesRequiredAttributes'
    | 'tablesAnyAttributes'
>;

export type CachedExploreSearchMetadata = Pick<Explore, 'name' | 'label'> &
    Partial<Pick<Explore, 'tags' | 'type'>> & {
        errors?: ExploreError['errors'];
        tables: Record<
            string,
            Pick<
                CompiledTable,
                | 'name'
                | 'label'
                | 'description'
                | 'requiredAttributes'
                | 'anyAttributes'
            > & {
                dimensions: Record<string, CachedExploreSearchField>;
                metrics: Record<string, CachedExploreSearchField>;
            }
        >;
    };

export type DbCachedExplore = {
    cached_explore_uuid: string;
    project_uuid: string;
    name: string;
    table_names: string[];
    explore: AnyType;
    search_metadata: CachedExploreSearchMetadata | null;
};

export type CachedExploreTable = Knex.CompositeTableType<
    DbCachedExplore,
    Omit<DbCachedExplore, 'cached_explore_uuid' | 'search_metadata'>
>;

export type DbCachedExploreStaging = Omit<
    DbCachedExplore,
    'search_metadata'
> & {
    save_uuid: string;
    created_at: Date;
};

export type DbCachedWarehouse = {
    project_uuid: string;
    warehouse: AnyType;
};

export type CachedWarehouseTable = Knex.CompositeTableType<DbCachedWarehouse>;
