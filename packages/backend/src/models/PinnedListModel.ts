import {
    CreateChartPinnedItem,
    CreateDashboardPinnedItem,
    DeleteChartPinnedItem,
    DeleteDashboardPinnedItem,
    isCreateChartPinnedItem,
    isDeleteChartPinnedItem,
    NotFoundError,
    PinnedItem,
    PinnedList,
    PinnedListAndItems,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbPinnedChart,
    DbPinnedDashboard,
    DbPinnedList,
    PinnedChartTableName,
    PinnedDashboardTableName,
    PinnedListTableName,
} from '../database/entities/pinnedList';
import { isDbPinnedChart } from '../utils';

type PinnedListModelDependencies = {
    database: Knex;
};

export class PinnedListModel {
    private readonly database: Knex;

    constructor(deps: PinnedListModelDependencies) {
        this.database = deps.database;
    }

    private async upsertPinnedList(projectUuid: string): Promise<PinnedList> {
        const list = await this.database(PinnedListTableName)
            .select(['pinned_list_uuid', 'project_uuid'])
            .where('project_uuid', projectUuid);
        if (list.length > 0) {
            return {
                pinnedListUuid: list[0].pinned_list_uuid,
                projectUuid: list[0].project_uuid,
            };
        }
        const newList = await this.database(PinnedListTableName)
            .insert({ project_uuid: projectUuid })
            .returning('*');
        return {
            pinnedListUuid: newList[0].pinned_list_uuid,
            projectUuid: newList[0].project_uuid,
        };
    }

    async addItem(
        item: CreateChartPinnedItem | CreateDashboardPinnedItem,
    ): Promise<void> {
        const results = await this.upsertPinnedList(item.projectUuid);

        if (isCreateChartPinnedItem(item)) {
            await this.database(PinnedChartTableName).insert({
                pinned_list_uuid: results.pinnedListUuid,
                saved_chart_uuid: item.savedChartUuid,
            });
        } else {
            await this.database(PinnedDashboardTableName).insert({
                pinned_list_uuid: results.pinnedListUuid,
                dashboard_uuid: item.dashboardUuid,
            });
        }
    }

    async deleteItem(
        item: DeleteChartPinnedItem | DeleteDashboardPinnedItem,
    ): Promise<void> {
        if (isDeleteChartPinnedItem(item)) {
            await this.database(PinnedChartTableName)
                .delete()
                .where('saved_chart_uuid', item.savedChartUuid)
                .andWhere('pinned_list_uuid', item.pinnedListUuid);
        } else {
            await this.database(PinnedDashboardTableName)
                .delete()
                .where('dashboard_uuid', item.dashboardUuid)
                .andWhere('pinned_list_uuid', item.pinnedListUuid);
        }
    }

    static convertPinnedList(data: DbPinnedList): PinnedList {
        return {
            pinnedListUuid: data.pinned_list_uuid,
            projectUuid: data.project_uuid,
        };
    }

    static convertPinnedItem(
        data: DbPinnedChart | DbPinnedDashboard,
    ): PinnedItem {
        return {
            pinnedListUuid: data.pinned_list_uuid,
            pinnedItemUuid: data.pinned_item_uuid,
            savedChartUuid: isDbPinnedChart(data)
                ? data.saved_chart_uuid
                : undefined,
            dashboardUuid: isDbPinnedChart(data)
                ? undefined
                : data.dashboard_uuid,
            createdAt: data.created_at,
        };
    }

    async getPinnedListAndItems(
        projectUuid: string,
    ): Promise<PinnedListAndItems> {
        const [list] = await this.database(PinnedListTableName)
            .select('pinned_list_uuid', 'project_uuid')
            .where('project_uuid', projectUuid);
        if (!list) {
            throw new NotFoundError('No pinned list found');
        }

        const pinnedListUuid = [list][0].pinned_list_uuid;
        const pinnedCharts = await this.database(PinnedChartTableName)
            .select(
                'pinned_list_uuid',
                'pinned_item_uuid',
                'saved_chart_uuid',
                'created_at',
            )
            .where('pinned_list_uuid', pinnedListUuid);
        const pinnedDashboards = await this.database(PinnedDashboardTableName)
            .select(
                'pinned_list_uuid',
                'pinned_item_uuid',
                'dashboard_uuid',
                'created_at',
            )
            .where('pinned_list_uuid', pinnedListUuid);

        const pinnedList = PinnedListModel.convertPinnedList(list);
        const pinnedItems = [...pinnedCharts, ...pinnedDashboards].map(
            PinnedListModel.convertPinnedItem,
        );

        return { ...pinnedList, items: pinnedItems };
    }
}
