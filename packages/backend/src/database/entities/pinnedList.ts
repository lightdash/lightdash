import { Knex } from 'knex';

export const PinnedListTableName = 'pinned_list';
export const PinnedItemsTableName = 'pinned_items';

type PinnedList = {
    pinned_list_uuid: string;
    project_uuid: string;
};

type PinnedItems = {
    pinned_item_uuid: string;
    pinned_list_uuid: string;
    pinned_item_type: 'chart' | 'dashboard';
    saved_chart_uuid: string;
    dashboard_uuid: string;
};

export type CreatePinnedChart = Required<
    Pick<
        PinnedItems,
        'pinned_list_uuid' | 'pinned_item_type' | 'saved_chart_uuid'
    >
> & {
    pinned_item_type: 'chart';
};

export type CreatePinnedDashboard = Required<
    Pick<
        PinnedItems,
        'pinned_list_uuid' | 'pinned_item_type' | 'dashboard_uuid'
    >
> & {
    pinned_item_type: 'dashboard';
};

export type PinnedListTable = Knex.CompositeTableType<
    PinnedList,
    Pick<PinnedList, 'project_uuid'>
>;
export type PinnedItemsTable = Knex.CompositeTableType<
    PinnedItems,
    CreatePinnedChart | CreatePinnedDashboard
>;
