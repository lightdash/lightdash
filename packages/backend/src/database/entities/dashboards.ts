import { Knex } from 'knex';
import { DashboardTileTypes } from 'common';

export const DashboardsTableName = 'dashboards';
export const DashboardVersionsTableName = 'dashboard_versions';
export const DashboardTilesTableName = 'dashboard_tiles';
export const DashboardTileTypesTableName = 'dashboard_tile_types';
export const DashboardTileChartTableName = 'dashboard_tile_charts';

type DbDashboard = {
    dashboard_id: number;
    dashboard_uuid: string;
    name: string;
    description?: string;
    space_id: number;
    created_at: Date;
};

type DbDashboardVersion = {
    dashboard_version_id: number;
    dashboard_id: number;
    created_at: Date;
};

type DbDashboardTile = {
    dashboard_version_id: number;
    rank: number;
    type: DashboardTileTypes;
    x_offset: number;
    y_offset: number;
    height: number;
    width: number;
};

type DbDashboardTileChart = {
    dashboard_version_id: number;
    rank: number;
    saved_chart_id: number;
};

export type DashboardTable = Knex.CompositeTableType<
    DbDashboard,
    Pick<DbDashboard, 'name' | 'description' | 'space_id'>,
    Pick<DbDashboard, 'name' | 'description'>
>;

export type DashboardVersionTable = Knex.CompositeTableType<
    DbDashboardVersion,
    Pick<DbDashboardVersion, 'dashboard_id'>
>;
export type DashboardTileTable = Knex.CompositeTableType<DbDashboardTile>;
export type DashboardTileChartTable =
    Knex.CompositeTableType<DbDashboardTileChart>;
