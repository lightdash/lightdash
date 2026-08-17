import { Knex } from 'knex';

export const SavedChartSlugMappingsTableName = 'saved_query_slug_mappings';

export type DbSavedChartSlugMapping = {
    saved_query_slug_mapping_uuid: string;
    project_uuid: string;
    saved_query_uuid: string;
    slug: string;
    created_at: Date;
};

export type SavedChartSlugMappingTable = Knex.CompositeTableType<
    DbSavedChartSlugMapping,
    Pick<DbSavedChartSlugMapping, 'project_uuid' | 'saved_query_uuid' | 'slug'>,
    never
>;
