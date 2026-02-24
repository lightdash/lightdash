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
    any_attributes: Record<string, string | string[]> | null;
    chart_usage: number | null;
    icon: CatalogItemIcon | null;
    table_name: string;
    spotlight_show: boolean;
    yaml_tags: string[] | null;
    ai_hints: string[] | null;
    joined_tables: string[] | null;
    owner_user_uuid: string | null;
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
    | 'any_attributes'
    | 'chart_usage'
    | 'table_name'
    | 'spotlight_show'
    | 'yaml_tags'
    | 'ai_hints'
    | 'joined_tables'
    | 'owner_user_uuid'
>;
export type DbCatalogRemove = Pick<DbCatalog, 'project_uuid' | 'name'>;
export type DbCatalogUpdate = Partial<
    Pick<
        DbCatalog,
        | 'label'
        | 'description'
        | 'ai_hints'
        | 'embedding_vector'
        | 'chart_usage'
        | 'icon'
        | 'table_name'
    >
>;
export type CatalogTable = Knex.CompositeTableType<
    DbCatalog,
    DbCatalogIn,
    DbCatalogUpdate
>;

// Utility to get the column name in the `catalog` table from a `CatalogItem` property
// Also accepts 'tableLabel' and 'owner' which are only in CatalogField but needed for sorting/filtering
export function getDbCatalogColumnFromCatalogProperty(
    property: keyof CatalogItem | 'tableLabel' | 'owner',
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
        case 'anyAttributes':
            return 'any_attributes';
        case 'catalogSearchUuid':
            return 'catalog_search_uuid';
        case 'aiHints':
            return 'ai_hints';
        case 'icon':
            return 'icon';
        case 'tableLabel':
            return 'table_name';
        case 'owner':
            return 'owner_user_uuid';
        case 'searchRank':
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
    is_from_yaml: boolean;
};

export type DbCatalogTagIn = Omit<DbCatalogTag, 'created_at'>;

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
    project_uuid: string;
    source: 'yaml' | 'ui';
};

export type DbMetricsTreeEdgeIn = Pick<
    DbMetricsTreeEdge,
    | 'source_metric_catalog_search_uuid'
    | 'target_metric_catalog_search_uuid'
    | 'created_by_user_uuid'
    | 'project_uuid'
    | 'source'
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

// --- Metrics Trees ---

export const MetricsTreesTableName = 'metrics_trees';

export type DbMetricsTree = {
    metrics_tree_uuid: string;
    project_uuid: string;
    slug: string;
    name: string;
    description: string | null;
    source: 'yaml' | 'ui';
    created_by_user_uuid: string | null;
    updated_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
    generation: number;
};

export type DbMetricsTreeIn = Pick<
    DbMetricsTree,
    | 'project_uuid'
    | 'slug'
    | 'name'
    | 'description'
    | 'source'
    | 'created_by_user_uuid'
>;

export type DbMetricsTreeUpdate = Pick<
    DbMetricsTree,
    | 'name'
    | 'description'
    | 'updated_at'
    | 'updated_by_user_uuid'
    | 'generation'
>;

export type MetricsTreesTable = Knex.CompositeTableType<
    DbMetricsTree,
    DbMetricsTreeIn,
    Partial<DbMetricsTreeUpdate>
>;

// --- Metrics Tree Nodes ---

export const MetricsTreeNodesTableName = 'metrics_tree_nodes';

export type DbMetricsTreeNode = {
    metrics_tree_uuid: string;
    catalog_search_uuid: string;
    x_position: number | null;
    y_position: number | null;
    source: 'yaml' | 'ui';
    created_at: Date;
    updated_at: Date;
};

export type DbMetricsTreeNodeIn = Pick<
    DbMetricsTreeNode,
    | 'metrics_tree_uuid'
    | 'catalog_search_uuid'
    | 'x_position'
    | 'y_position'
    | 'source'
> &
    Partial<Pick<DbMetricsTreeNode, 'created_at'>>;

export type DbMetricsTreeNodeUpdate = Pick<
    DbMetricsTreeNode,
    'x_position' | 'y_position'
>;

export type MetricsTreeNodesTable = Knex.CompositeTableType<
    DbMetricsTreeNode,
    DbMetricsTreeNodeIn,
    Partial<DbMetricsTreeNodeUpdate>
>;

// --- Metrics Tree Locks ---

export const MetricsTreeLocksTableName = 'metrics_tree_locks';

export type DbMetricsTreeLock = {
    metrics_tree_uuid: string;
    locked_by_user_uuid: string;
    acquired_at: Date;
    last_heartbeat_at: Date;
};

export type DbMetricsTreeLockIn = Pick<
    DbMetricsTreeLock,
    'metrics_tree_uuid' | 'locked_by_user_uuid'
>;

export type DbMetricsTreeLockUpdate = Pick<
    DbMetricsTreeLock,
    'locked_by_user_uuid' | 'acquired_at' | 'last_heartbeat_at'
>;

export type MetricsTreeLocksTable = Knex.CompositeTableType<
    DbMetricsTreeLock,
    DbMetricsTreeLockIn,
    Partial<DbMetricsTreeLockUpdate>
>;
