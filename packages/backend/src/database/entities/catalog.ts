import {
    assertUnreachable,
    CatalogItemIcon,
    CatalogType,
    type CatalogItem,
} from '@lightdash/common';
import { Knex } from 'knex';

export type DbCatalog = {
    catalog_search_uuid: string;
    cached_explore_uuid: string;
    project_uuid: string;
    name: string;
    label: string | null;
    description: string | null;
    type: CatalogType;
    search_vector: string;
    embedding_vector?: string;
    field_type?: string;
    required_attributes: Record<string, string | string[]> | null;
    chart_usage: number | null;
    icon: CatalogItemIcon | null;
    table_name: string;
    spotlight_show: boolean;
};

export type DbCatalogIn = Pick<
    DbCatalog,
    | 'cached_explore_uuid'
    | 'project_uuid'
    | 'name'
    | 'label'
    | 'description'
    | 'type'
    | 'field_type'
    | 'required_attributes'
    | 'chart_usage'
    | 'table_name'
    | 'spotlight_show'
>;
export type DbCatalogRemove = Pick<DbCatalog, 'project_uuid' | 'name'>;
export type DbCatalogUpdate =
    | Pick<DbCatalog, 'embedding_vector'>
    | Pick<DbCatalog, 'chart_usage'>
    | Pick<DbCatalog, 'icon'>
    | Pick<DbCatalog, 'table_name'>;
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
        case 'label':
            return 'label';
        case 'description':
            return 'description';
        case 'type':
            return 'type';
        case 'chartUsage':
            return 'chart_usage';
        case 'requiredAttributes':
            return 'required_attributes';
        case 'catalogSearchUuid':
            return 'catalog_search_uuid';
        case 'icon':
            return 'icon';
        case 'categories':
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

export type DbCatalogTag = {
    catalog_search_uuid: string;
    tag_uuid: string;
    created_at: Date;
    created_by_user_uuid: string | null;
};

export type DbCatalogTagIn = Pick<
    DbCatalogTag,
    'catalog_search_uuid' | 'tag_uuid' | 'created_by_user_uuid'
>;

export type CatalogTagsTable = Knex.CompositeTableType<
    DbCatalogTag,
    DbCatalogTagIn
>;

export type DbCatalogTagsMigrateIn = DbCatalogTag;

export type DbCatalogItemsMigrateIn = Pick<
    DbCatalog,
    'catalog_search_uuid' | 'icon'
>;

export const CatalogTagsTableName = 'catalog_search_tags';

export type DbMetricsTreeEdge = {
    source_metric_catalog_search_uuid: string;
    target_metric_catalog_search_uuid: string;
    created_at: Date;
    created_by_user_uuid: string | null;
};

export type DbMetricsTreeEdgeIn = Pick<
    DbMetricsTreeEdge,
    | 'source_metric_catalog_search_uuid'
    | 'target_metric_catalog_search_uuid'
    | 'created_by_user_uuid'
>;

export type DbMetricsTreeEdgeDelete = Pick<
    DbMetricsTreeEdge,
    'source_metric_catalog_search_uuid' | 'target_metric_catalog_search_uuid'
>;

export type MetricsTreeEdgesTable = Knex.CompositeTableType<
    DbMetricsTreeEdge,
    DbMetricsTreeEdgeIn
>;

export const MetricsTreeEdgesTableName = 'metrics_tree_edges';
