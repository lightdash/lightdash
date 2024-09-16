import { DashboardFilters, DashboardTileTypes } from '@lightdash/common';
import { Knex } from 'knex';

export const DashboardsTableName = 'dashboards';
export const DashboardVersionsTableName = 'dashboard_versions';
export const DashboardViewsTableName = 'dashboard_views';
export const DashboardTilesTableName = 'dashboard_tiles';
export const DashboardTileTypesTableName = 'dashboard_tile_types';
export const DashboardTileChartTableName = 'dashboard_tile_charts';
export const DashboardTileSqlChartTableName = 'dashboard_tile_sql_charts';
export const DashboardTileSemanticViewerChartTableName =
    'dashboard_tile_semantic_viewer_charts';
export const DashboardTileMarkdownsTableName = 'dashboard_tile_markdowns';
export const DashboardTileLoomsTableName = 'dashboard_tile_looms';
export const DashboardTabsTableName = 'dashboard_tabs';

export type DbDashboard = {
    dashboard_id: number;
    dashboard_uuid: string;
    name: string;
    description?: string;
    search_vector: string;
    space_id: number;
    created_at: Date;
    slug: string;
    views_count: number;
    first_viewed_at: Date | null;
};

type DbDashboardVersion = {
    dashboard_version_id: number;
    dashboard_id: number;
    created_at: Date;
    updated_by_user_uuid: string | undefined;
};

type DbDashboardView = {
    dashboard_view_uuid: string;
    dashboard_version_id: number;
    created_at: Date;
    name: string;
    filters: DashboardFilters;
};

type DbCreateDashboardTile = {
    dashboard_tile_uuid: string;
    dashboard_version_id: number;
    type: DashboardTileTypes;
    x_offset: number;
    y_offset: number;
    height: number;
    width: number;
    tab_uuid: string | undefined;
};

type DbDashboardTile = Required<DbCreateDashboardTile>;

type DbDashboardTileChart = {
    dashboard_version_id: number;
    dashboard_tile_uuid: string;
    saved_chart_id: number | null;
    hide_title?: boolean;
    title?: string;
};

export type DashboardTable = Knex.CompositeTableType<
    DbDashboard,
    Pick<DbDashboard, 'name' | 'description' | 'space_id' | 'slug'>,
    Partial<
        Pick<
            DbDashboard,
            'name' | 'description' | 'views_count' | 'first_viewed_at'
        >
    >
>;

export type DashboardVersionTable = Knex.CompositeTableType<
    DbDashboardVersion,
    Pick<DbDashboardVersion, 'dashboard_id' | 'updated_by_user_uuid'>
>;

export type DashboardViewTable = Knex.CompositeTableType<
    DbDashboardView,
    Pick<DbDashboardView, 'dashboard_version_id' | 'name' | 'filters'>
>;

export type DashboardTileTable = Knex.CompositeTableType<
    DbDashboardTile,
    DbCreateDashboardTile
>;
export type DashboardTileChartTable =
    Knex.CompositeTableType<DbDashboardTileChart>;

type DbDashboardTileLooms = {
    dashboard_version_id: number;
    dashboard_tile_uuid: string;
    title: string;
    url: string;
    hide_title?: boolean;
};

export type DashboardTileLoomsTable =
    Knex.CompositeTableType<DbDashboardTileLooms>;

type DbDashboardTileMarkdowns = {
    dashboard_version_id: number;
    dashboard_tile_uuid: string;
    title: string;
    content: string;
};

export type DashboardTileMarkdownsTable =
    Knex.CompositeTableType<DbDashboardTileMarkdowns>;

export type DbDashboardTabs = {
    name: string;
    uuid: string;
    dashboard_id: number;
    dashboard_version_id: number;
    order: number;
    created_at: Date;
    updated_at: Date;
};

export type CreateDashboardTabs = Omit<
    DbDashboardTabs,
    'uuid' | 'created_at' | 'updated_at'
> & { uuid?: string };
export type UpdateDashboardTabs = Omit<DbDashboardTabs, 'uuid' | 'created_at'>;

export type DashboardTabsTable = Knex.CompositeTableType<
    DbDashboardTabs,
    CreateDashboardTabs,
    UpdateDashboardTabs
>;
