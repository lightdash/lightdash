import { ResourceViewItemType, ResourceViewSpaceItem } from '@lightdash/common';
import { Knex } from 'knex';

type Dependencies = {
    database: Knex;
};

export class ResourceViewItemModel {
    database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async getSpacesByPinnedListUuid(
        pinnedListUuid: string,
    ): Promise<ResourceViewSpaceItem[]> {
        const rows = await this.database.raw<Record<string, any>[]>(
            `
select
    pl.project_uuid,
    pl.pinned_list_uuid,
    ps.space_uuid,
    MAX(s.name) as name,
    BOOL_OR(s.is_private) as is_private,
    COUNT(DISTINCT ss.user_id) as access_list_length,
    COUNT(DISTINCT d.dashboard_id) as dashboard_count,
    COUNT(DISTINCT sq.saved_query_id) as chart_count
from pinned_list pl
inner join pinned_space ps on pl.pinned_list_uuid = ps.pinned_list_uuid
    and ps.pinned_list_uuid = :pinnedListUuid
inner join spaces s on ps.space_uuid = s.space_uuid
left join space_share ss on s.space_id = ss.space_id
left join dashboards d on s.space_id = d.space_id
left join saved_queries sq on s.space_id = sq.space_id
group by 1, 2, 3;
        `,
            { pinnedListUuid },
        );
        const resourceType: ResourceViewItemType.SPACE =
            ResourceViewItemType.SPACE;
        const items = rows.map((row) => ({
            type: resourceType,
            data: {
                projectUuid: row.project_uuid,
                pinnedListUuid: row.pinned_list_uuid,
                uuid: row.space_uuid,
                name: row.name,
                isPrivate: row.is_private,
                accessListLength: row.access_list_length,
                dashboardCount: row.dashboard_count,
                chartCount: row.saved_query_count,
            },
        }));
        return items;
    }
}
