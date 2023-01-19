import {
    CreateChartPinnedItem,
    CreateDashboardPinnedItem,
    DeleteChartPinnedItem,
    DeleteDashboardPinnedItem,
    PinnedList,
} from '@lightdash/common/dist/types/pinning';
import { Knex } from 'knex';
import {
    PinnedItemsTableName,
    PinnedListTableName,
} from '../database/entities/pinnedList';

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

        if (item.pinnedItemType === 'chart') {
            await this.database(PinnedItemsTableName).insert({
                pinned_list_uuid: results.pinnedListUuid,
                pinned_item_type: item.pinnedItemType,
                saved_chart_uuid: item.savedChartUuid,
            });
        } else {
            await this.database(PinnedItemsTableName).insert({
                pinned_list_uuid: results.pinnedListUuid,
                pinned_item_type: item.pinnedItemType,
                dashboard_uuid: item.dashboardUuid,
            });
        }
    }

    async deleteItem(
        item: DeleteChartPinnedItem | DeleteDashboardPinnedItem,
    ): Promise<void> {
        await this.database(PinnedItemsTableName)
            .delete()
            .where(
                item.pinnedItemType === 'chart'
                    ? 'saved_chart_uuid'
                    : 'dashboard_uuid',
                item.pinnedItemType === 'chart'
                    ? item.savedChartUuid
                    : item.dashboardUuid,
            )
            .andWhere('pinned_list_uuid', item.pinnedListUuid);
    }
}
