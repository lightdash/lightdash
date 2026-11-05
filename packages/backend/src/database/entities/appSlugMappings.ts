import { Knex } from 'knex';

export const AppSlugMappingsTableName = 'app_slug_mappings';

export type DbAppSlugMapping = {
    app_slug_mapping_uuid: string;
    project_uuid: string;
    app_id: string;
    slug: string;
    created_at: Date;
};

export type AppSlugMappingTable = Knex.CompositeTableType<
    DbAppSlugMapping,
    Pick<DbAppSlugMapping, 'project_uuid' | 'app_id' | 'slug'>,
    never
>;
