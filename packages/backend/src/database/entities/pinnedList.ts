import { Knex } from 'knex';

export const PinnedListTableName = 'pinned_list';
export const PinnedChartTableName = 'pinned_chart';
export const PinnedDashboardTableName = 'pinned_dashboard';

type PinnedList = {
    pinned_list_uuid: string;
    project_uuid: string;
    created_at: Date;
};

type PinnedChart = {
    pinned_item_uuid: string;
    pinned_list_uuid: string;
    saved_chart_uuid: string;
    created_at: Date;
};
type PinnedDashboard = {
    pinned_item_uuid: string;
    pinned_list_uuid: string;
    dashboard_uuid: string;
    created_at: Date;
};

export type CreatePinnedChart = Omit<
    PinnedChart,
    'pinned_item_uuid' | 'created_at'
>;
export type CreatePinnedDashboard = Omit<
    PinnedDashboard,
    'pinned_item_uuid' | 'created_at'
>;

export type PinnedListTable = Knex.CompositeTableType<
    PinnedList,
    Pick<PinnedList, 'project_uuid'>
>;
export type PinnedChartTable = Knex.CompositeTableType<
    PinnedChart,
    CreatePinnedChart
>;
export type PinnedDashboardTable = Knex.CompositeTableType<
    PinnedDashboard,
    CreatePinnedDashboard
>;
