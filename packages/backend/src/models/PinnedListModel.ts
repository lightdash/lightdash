import {
    CreatePinnedItem,
    DeletePinnedItem,
    isCreateChartPinnedItem,
    isCreateSpacePinnedItem,
    isDeleteChartPinnedItem,
    isDeleteSpacePinnedItem,
    NotFoundError,
    PinnedItem,
    PinnedList,
    PinnedListAndItems,
    ResourceViewItemType,
    UpdatePinnedItemOrder,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbPinnedItem,
    DbPinnedList,
    PinnedChartTableName,
    PinnedDashboardTableName,
    PinnedListTableName,
    PinnedSpaceTableName,
} from '../database/entities/pinnedList';
import {
    isDbPinnedChart,
    isDbPinnedDashboard,
    isDbPinnedSpace,
} from '../utils';

type PinnedListModelArguments = {
    database: Knex;
};

export class PinnedListModel {
    private readonly database: Knex;

    constructor(args: PinnedListModelArguments) {
        this.database = args.database;
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

    async addItem(item: CreatePinnedItem): Promise<void> {
        const results = await this.upsertPinnedList(item.projectUuid);

        if (isCreateChartPinnedItem(item)) {
            await this.database(PinnedChartTableName).insert({
                pinned_list_uuid: results.pinnedListUuid,
                saved_chart_uuid: item.savedChartUuid,
            });
        } else if (isCreateSpacePinnedItem(item)) {
            await this.database(PinnedSpaceTableName).insert({
                pinned_list_uuid: results.pinnedListUuid,
                space_uuid: item.spaceUuid,
            });
        } else {
            await this.database(PinnedDashboardTableName).insert({
                pinned_list_uuid: results.pinnedListUuid,
                dashboard_uuid: item.dashboardUuid,
            });
        }
    }

    async deleteItem(item: DeletePinnedItem): Promise<void> {
        if (isDeleteChartPinnedItem(item)) {
            await this.database(PinnedChartTableName)
                .delete()
                .where('saved_chart_uuid', item.savedChartUuid)
                .andWhere('pinned_list_uuid', item.pinnedListUuid);
        } else if (isDeleteSpacePinnedItem(item)) {
            await this.database(PinnedSpaceTableName)
                .delete()
                .where('space_uuid', item.spaceUuid)
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

    static convertPinnedItem(data: DbPinnedItem): PinnedItem {
        return {
            pinnedListUuid: data.pinned_list_uuid,
            pinnedItemUuid: data.pinned_item_uuid,
            savedChartUuid: isDbPinnedChart(data)
                ? data.saved_chart_uuid
                : undefined,
            dashboardUuid: isDbPinnedDashboard(data)
                ? data.dashboard_uuid
                : undefined,
            spaceUuid: isDbPinnedSpace(data) ? data.space_uuid : undefined,
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

        const pinnedCharts = await this.database(PinnedChartTableName)
            .select(
                'pinned_list_uuid',
                'pinned_item_uuid',
                'saved_chart_uuid',
                'created_at',
                'order',
            )
            .where('pinned_list_uuid', list.pinned_list_uuid)
            .orderBy('order');
        const pinnedDashboards = await this.database(PinnedDashboardTableName)
            .select(
                'pinned_list_uuid',
                'pinned_item_uuid',
                'dashboard_uuid',
                'created_at',
                'order',
            )
            .where('pinned_list_uuid', list.pinned_list_uuid)
            .orderBy('order');
        const pinnedSpaces = await this.database(PinnedSpaceTableName)
            .select(
                'pinned_list_uuid',
                'pinned_item_uuid',
                'space_uuid',
                'created_at',
                'order',
            )
            .where('pinned_list_uuid', list.pinned_list_uuid)
            .orderBy('order');

        const pinnedList = PinnedListModel.convertPinnedList(list);
        const pinnedItems = [
            ...pinnedCharts,
            ...pinnedDashboards,
            ...pinnedSpaces,
        ].map(PinnedListModel.convertPinnedItem);

        return { ...pinnedList, items: pinnedItems };
    }

    async updatePinnedItemsOrder(
        projectUuid: string,
        pinnedListUuid: string,
        itemsOrder: Array<UpdatePinnedItemOrder>,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            const promises: Promise<any>[] = [];
            itemsOrder.forEach((item) => {
                switch (item.type) {
                    case ResourceViewItemType.CHART: {
                        promises.push(
                            trx(PinnedChartTableName)
                                .update('order', item.data.pinnedListOrder)
                                .where('pinned_list_uuid', pinnedListUuid)
                                .andWhere('saved_chart_uuid', item.data.uuid),
                        );
                        break;
                    }
                    case ResourceViewItemType.DASHBOARD: {
                        promises.push(
                            trx(PinnedDashboardTableName)
                                .update('order', item.data.pinnedListOrder)
                                .where('pinned_list_uuid', pinnedListUuid)
                                .andWhere('dashboard_uuid', item.data.uuid),
                        );
                        break;
                    }
                    case ResourceViewItemType.SPACE: {
                        promises.push(
                            trx(PinnedSpaceTableName)
                                .update('order', item.data.pinnedListOrder)
                                .where('pinned_list_uuid', pinnedListUuid)
                                .andWhere('space_uuid', item.data.uuid),
                        );
                        break;
                    }
                    default:
                        throw new Error('Unknown pinned item type');
                }
            });
            return Promise.all(promises);
        });
    }
}
