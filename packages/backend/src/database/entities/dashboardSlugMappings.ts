import { Knex } from 'knex';

export const DashboardSlugMappingsTableName = 'dashboard_slug_mappings';
// varchar(255) in the database; longer slugs are never recorded as aliases
export const MAX_SLUG_ALIAS_LENGTH = 255;

export type DbDashboardSlugMapping = {
    dashboard_slug_mapping_uuid: string;
    project_uuid: string;
    dashboard_uuid: string;
    slug: string;
    created_at: Date;
};

export type DashboardSlugMappingTable = Knex.CompositeTableType<
    DbDashboardSlugMapping,
    Pick<DbDashboardSlugMapping, 'project_uuid' | 'dashboard_uuid' | 'slug'>,
    never
>;
