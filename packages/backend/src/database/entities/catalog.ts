import {
    assertUnreachable,
    CatalogType,
    type CatalogItem,
} from '@lightdash/common';
import { Knex } from 'knex';

export type DbCatalog = {
    cached_explore_uuid: string;
    project_uuid: string;
    name: string;
    description: string | null;
    type: CatalogType;
    search_vector: string;
    embedding_vector?: string;
    field_type?: string;
    required_attributes: Record<string, string | string[]> | null;
    chart_usage: number | null;
};

export type DbCatalogIn = Pick<
    DbCatalog,
    | 'cached_explore_uuid'
    | 'project_uuid'
    | 'name'
    | 'description'
    | 'type'
    | 'field_type'
    | 'required_attributes'
    | 'chart_usage'
>;
export type DbCatalogRemove = Pick<DbCatalog, 'project_uuid' | 'name'>;
export type DbCatalogUpdate =
    | Pick<DbCatalog, 'embedding_vector'>
    | Pick<DbCatalog, 'chart_usage'>;

export type CatalogTable = Knex.CompositeTableType<
    DbCatalog,
    DbCatalogIn,
    DbCatalogUpdate
>;

// Utility to get the column name in the `catalog` table from a `CatalogItem` property
export function getDbCatalogColumnFromCatalogProperty(
    property: keyof CatalogItem,
): keyof DbCatalog {
    switch (property) {
        case 'name':
            return 'name';
        case 'description':
            return 'description';
        case 'type':
            return 'type';
        case 'chartUsage':
            return 'chart_usage';
        case 'requiredAttributes':
            return 'required_attributes';
        case 'label':
        case 'tags':
            throw new Error(
                'Property has no corresponding column in the catalog table',
            );
        default:
            return assertUnreachable(
                property,
                `Invalid catalog property ${property}`,
            );
    }
}

export const CatalogTableName = 'catalog_search';
