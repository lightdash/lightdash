import { ChartKind } from '@lightdash/common';
import { Knex } from 'knex';

export const SavedSemanticLayerTableName = 'saved_semantic_layer';
export const SavedSemanticLayerVersionsTableName =
    'saved_semantic_layer_versions';

export type DbSavedSemanticLayer = {
    saved_semantic_layer_uuid: string;
    project_uuid: string;
    space_uuid: string | null;
    dashboard_uuid: string | null;
    name: string;
    created_at: Date;
    created_by_user_uuid: string | null;
    description: string | null;
    last_version_chart_kind: ChartKind;
    last_version_updated_at: Date;
    last_version_updated_by_user_uuid: string | undefined;
    search_vector: string;
    slug: string;
    views_count: number;
    first_viewed_at: Date | null;
    last_viewed_at: Date | null;
};

type InsertSemanticLayerBase = Pick<
    DbSavedSemanticLayer,
    'name' | 'description' | 'project_uuid' | 'created_by_user_uuid' | 'slug'
>;

type InsertSemanticLayerInSpace = InsertSemanticLayerBase & {
    space_uuid: string;
    dashboard_uuid: null;
};

type InsertSemanticLayerInDashboard = InsertSemanticLayerBase & {
    space_uuid: null;
    dashboard_uuid: string;
};

export type InsertSemanticLayer =
    | InsertSemanticLayerInSpace
    | InsertSemanticLayerInDashboard;

type UpdateSemanticLayer = Partial<
    Pick<
        DbSavedSemanticLayer,
        | 'name'
        | 'description'
        | 'last_version_chart_kind'
        | 'last_version_updated_at'
        | 'last_version_updated_by_user_uuid'
        | 'space_uuid'
        | 'dashboard_uuid'
        | 'slug'
        | 'views_count'
        | 'first_viewed_at'
    >
>;

export type SavedSemanticLayerTable = Knex.CompositeTableType<
    DbSavedSemanticLayer,
    InsertSemanticLayer,
    UpdateSemanticLayer
>;

export type DbSavedSemanticLayerVersion = {
    saved_semantic_layer_version_uuid: string;
    saved_semantic_layer_uuid: string;
    created_at: Date;
    config: object;
    semantic_layer_query: object;
    chart_kind: ChartKind;
    created_by_user_uuid: string;
};

export type InsertSavedSemanticLayerVersion = Pick<
    DbSavedSemanticLayerVersion,
    | 'saved_semantic_layer_uuid'
    | 'semantic_layer_query'
    | 'config'
    | 'chart_kind'
    | 'created_by_user_uuid'
>;

export type SavedSemanticLayerVersionsTable = Knex.CompositeTableType<
    DbSavedSemanticLayerVersion,
    InsertSavedSemanticLayerVersion,
    never
>;
