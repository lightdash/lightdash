import { CatalogType } from '@lightdash/common';
import { Knex } from 'knex';

export type DbCatalog = {
    cached_explore_uuid: string;
    project_uuid: string;
    name: string;
    description: string | null;
    type: CatalogType;
    search_vector: string;
    embedding_vector?: string;
};

export type DbCatalogIn = Pick<
    DbCatalog,
    'cached_explore_uuid' | 'project_uuid' | 'name' | 'description' | 'type'
>;
export type DbCatalogRemove = Pick<DbCatalog, 'project_uuid' | 'name'>;
export type DbCatalogUpdate = Pick<DbCatalog, 'embedding_vector'>;

export type CatalogTable = Knex.CompositeTableType<
    DbCatalog,
    DbCatalogIn,
    DbCatalogUpdate
>;

export const CatalogTableName = 'catalog_search';
