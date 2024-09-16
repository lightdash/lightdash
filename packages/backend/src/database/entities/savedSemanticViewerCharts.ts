import { ChartKind } from '@lightdash/common';
import { Knex } from 'knex';

export const SavedSemanticViewerChartsTableName =
    'saved_semantic_viewer_charts';
export const SavedSemanticViewerChartVersionsTableName =
    'saved_semantic_viewer_chart_versions';

export type DbSavedSemanticViewerChart = {
    saved_semantic_viewer_chart_uuid: string;
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

type DBInsertSemanticViewerChartBase = Pick<
    DbSavedSemanticViewerChart,
    'name' | 'description' | 'project_uuid' | 'created_by_user_uuid' | 'slug'
>;

type DBInsertSemanticViewerChartInSpace = DBInsertSemanticViewerChartBase & {
    space_uuid: string;
    dashboard_uuid: null;
};

type DBInsertSemanticViewerChartInDashboard =
    DBInsertSemanticViewerChartBase & {
        space_uuid: null;
        dashboard_uuid: string;
    };

export type DBInsertSemanticViewerChart =
    | DBInsertSemanticViewerChartInSpace
    | DBInsertSemanticViewerChartInDashboard;

type DBUpdateSemanticViewerChart = Partial<
    Pick<
        DbSavedSemanticViewerChart,
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

export type SavedSemanticViewerChartsTable = Knex.CompositeTableType<
    DbSavedSemanticViewerChart,
    DBInsertSemanticViewerChart,
    DBUpdateSemanticViewerChart
>;

export type DBSavedSemanticViewerChartVersion = {
    saved_semantic_viewer_chart_version_uuid: string;
    saved_semantic_viewer_chart_uuid: string;
    created_at: Date;
    config: object;
    semantic_layer_view: string | null;
    semantic_layer_query: object;
    chart_kind: ChartKind;
    created_by_user_uuid: string;
};

export type DBInsertSavedSemanticViewerChartVersion = Pick<
    DBSavedSemanticViewerChartVersion,
    | 'saved_semantic_viewer_chart_uuid'
    | 'semantic_layer_view'
    | 'semantic_layer_query'
    | 'config'
    | 'chart_kind'
    | 'created_by_user_uuid'
>;

export type SavedSemanticViewerChartVersionsTable = Knex.CompositeTableType<
    DBSavedSemanticViewerChartVersion,
    DBInsertSavedSemanticViewerChartVersion,
    never
>;
