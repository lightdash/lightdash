import { Knex } from 'knex';

export const ComposerChartsTableName = 'composer_charts';
export const ComposerChartVersionsTableName = 'composer_chart_versions';
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

export type ComposerChartsTable = Knex.CompositeTableType<
    DbComposerChart,
    Pick<DbComposerChart, 'project_uuid' | 'dashboard_uuid' | 'name' | 'slug'> &
        Partial<
            Pick<
                DbComposerChart,
                | 'composer_chart_uuid'
                | 'description'
                | 'created_at'
                | 'created_by_user_uuid'
            >
        >,
    Partial<Pick<DbComposerChart, 'deleted_at' | 'deleted_by_user_uuid'>>
>;

type DbComposerChartVersion = {
    composer_chart_version_uuid: string;
    composer_chart_uuid: string;
    // jsonb, read back as parsed JSON and checked by the strict parsers
    pipeline: unknown;
    chart: unknown;
    created_at: Date;
    created_by_user_uuid: string | null;
};

export type ComposerChartVersionsTable = Knex.CompositeTableType<
    DbComposerChartVersion,
    Pick<
        DbComposerChartVersion,
        'composer_chart_uuid' | 'created_by_user_uuid'
    > &
        Partial<Pick<DbComposerChartVersion, 'created_at'>> & {
            pipeline: string;
            chart: string;
        }
>;

type DbDashboardTileComposerChart = {
    dashboard_version_id: number;
    dashboard_tile_uuid: string;
    composer_chart_uuid: string;
    title: string | null;
    hide_title: boolean;
};

export type DashboardTileComposerChartsTable =
    Knex.CompositeTableType<DbDashboardTileComposerChart>;
