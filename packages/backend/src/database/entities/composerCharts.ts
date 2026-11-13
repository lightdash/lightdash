import { Knex } from 'knex';

export const ComposerChartsTableName = 'composer_charts';
export const DashboardTileComposerChartsTableName =
    'dashboard_tile_composer_charts';

export type DbComposerChart = {
    composer_chart_uuid: string;
    project_uuid: string;
    dashboard_uuid: string | null;
    space_uuid: string | null;
    name: string;
    description: string | null;
    slug: string;
    created_at: Date;
    created_by_user_uuid: string | null;
    deleted_at: Date | null;
    deleted_by_user_uuid: string | null;
};

export type ComposerChartsTable = Knex.CompositeTableType<DbComposerChart>;

type DbDashboardTileComposerChart = {
    dashboard_version_id: number;
    dashboard_tile_uuid: string;
    composer_chart_uuid: string;
    title: string | null;
    hide_title: boolean;
};

export type DashboardTileComposerChartsTable =
    Knex.CompositeTableType<DbDashboardTileComposerChart>;
