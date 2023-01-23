import {
    CreateChartPinnedItem,
    CreateDashboardPinnedItem,
    DeleteChartPinnedItem,
    DeleteDashboardPinnedItem,
    isCreateChartPinnedItem,
    isDeleteChartPinnedItem,
    PinnedList,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    PinnedChartTableName,
    PinnedDashboardTableName,
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
}
