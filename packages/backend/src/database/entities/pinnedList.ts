import { Knex } from 'knex';

export const PinnedListTableName = 'pinned_list';
export const PinnedChartTableName = 'pinned_chart';
export const PinnedDashboardTableName = 'pinned_dashboard';
export const PinnedSpaceTableName = 'pinned_space';

export type DbPinnedList = {
    pinned_list_uuid: string;
    project_uuid: string;
    created_at?: Date;
};

export type DbPinnedChart = {
    pinned_item_uuid: string;
    pinned_list_uuid: string;
    saved_chart_uuid: string;
    created_at: Date;
    order: number;
};
export type DbPinnedDashboard = {
    pinned_item_uuid: string;
    pinned_list_uuid: string;
    dashboard_uuid: string;
    created_at: Date;
    order: number;
};
export type DBPinnedSpace = {
    pinned_item_uuid: string;
    pinned_list_uuid: string;
    space_uuid: string;
    created_at: Date;
    order: number;
};

export type DbPinnedItem = DbPinnedChart | DbPinnedDashboard | DBPinnedSpace;

export type CreatePinnedChart = Omit<
    DbPinnedChart,
    'pinned_item_uuid' | 'created_at' | 'order'
>;
export type CreatePinnedDashboard = Omit<
    DbPinnedDashboard,
    'pinned_item_uuid' | 'created_at' | 'order'
>;
export type CreatePinnedSpace = Omit<
    DBPinnedSpace,
    'pinned_item_uuid' | 'created_at' | 'order'
>;

export type PinnedListTable = Knex.CompositeTableType<
    DbPinnedList,
    Pick<DbPinnedList, 'project_uuid'>
>;
export type PinnedChartTable = Knex.CompositeTableType<
    DbPinnedChart,
    CreatePinnedChart,
    Pick<DbPinnedChart, 'order'>
>;
export type PinnedDashboardTable = Knex.CompositeTableType<
    DbPinnedDashboard,
    CreatePinnedDashboard,
    Pick<DbPinnedDashboard, 'order'>
>;
export type PinnedSpaceTable = Knex.CompositeTableType<
    DBPinnedSpace,
    CreatePinnedSpace,
    Pick<DBPinnedSpace, 'order'>
>;
