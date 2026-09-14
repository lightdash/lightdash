import { Knex } from 'knex';

export const DashboardSlugMappingsTableName = 'dashboard_slug_mappings';

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
