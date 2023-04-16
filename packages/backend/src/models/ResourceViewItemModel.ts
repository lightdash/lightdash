import {
    ResourceViewChartItem,
    ResourceViewDashboardItem,
    ResourceViewItem,
    ResourceViewItemType,
    ResourceViewSpaceItem,
} from '@lightdash/common';
import { Knex } from 'knex';

type Dependencies = {
    database: Knex;
};

const getCharts = async (
    knex: Knex,
    pinnedListUuid: string,
): Promise<ResourceViewChartItem[]> => {
    const rows = await knex.raw<Record<string, any>[]>(
        `
                select
                    pl.project_uuid,
                    pl.pinned_list_uuid,
                    s.space_uuid,
                    pc.saved_chart_uuid,
                    u.user_uuid as updated_by_user_uuid,
                    MAX(sq.name) as name,
                    MAX(sq.description) as description,
                    MAX(sqv.updated_at) as updated_at,
                    MAX(sqv.chart_type) as chart_type,
                    COUNT(acv.timestamp) as views,
                    MIN(acv.timestamp) as first_viewed_at,
                    MAX(u.first_name) as updated_by_user_first_name,
                    MAX(u.last_name) as updated_by_user_last_name
                from pinned_list pl
                inner join pinned_chart pc on pl.pinned_list_uuid = pc.pinned_list_uuid
                    and pc.pinned_list_uuid = :pinnedListUuid
                inner join saved_queries sq on pc.saved_chart_uuid = sq.saved_query_uuid
                inner join spaces s on sq.space_id = s.space_id
                inner join (
                    select distinct on(saved_query_id) saved_query_id, created_at as updated_at, updated_by_user_uuid, chart_type
                    from saved_queries_versions
                    order by saved_query_id, created_at desc
                ) sqv on sq.saved_query_id = sqv.saved_query_id
                left join analytics_chart_views acv on sq.saved_query_uuid = acv.chart_uuid
                left join users u on sqv.updated_by_user_uuid = u.user_uuid
                group by 1, 2, 3, 4, 5;
`,
        { pinnedListUuid },
    );
    const resourceType: ResourceViewItemType.CHART = ResourceViewItemType.CHART;
    const items = rows.map((row) => ({
        type: resourceType,
        data: {
            projectUuid: row.project_uuid,
            pinnedListUuid: row.pinned_list_uuid,
            spaceUuid: row.space_uuid,
            uuid: row.saved_chart_uuid,
            name: row.name,
            description: row.description,
            updatedAt: row.updated_at,
            views: row.views,
            firstViewedAt: row.first_viewed_at,
            chartType: row.chart_type,
            updatedByUser: row.updated_by_user_uuid && {
                userUuid: row.updated_by_user_uuid,
                firstName: row.updated_by_user_first_name,
                lastName: row.updated_by_user_last_name,
            },
        },
    }));
    return items;
};

const getDashboards = async (
    knex: Knex,
    pinnedListUuid: string,
): Promise<ResourceViewDashboardItem[]> => {
    const rows = await knex.raw<Record<string, any>[]>(
        `
                select
                    pl.project_uuid,
                    pl.pinned_list_uuid,
                    sss.space_uuid,
                    sss.access as space_access,
                    pd.dashboard_uuid,
                    u.user_uuid as updated_by_user_uuid,
                    MAX(d.name) as name,
                    MAX(d.description) as description,
                    MAX(dv.created_at) as updated_at,
                    COUNT(adv.timestamp) as views,
                    MIN(adv.timestamp) as first_viewed_at,
                    MAX(u.first_name) as updated_by_user_first_name,
                    MAX(u.last_name) as updated_by_user_last_name,
                from pinned_list pl
                inner join pinned_dashboard pd on pl.pinned_list_uuid = pd.pinned_list_uuid
                    and pd.pinned_list_uuid = :pinnedListUuid
                inner join dashboards d on pd.dashboard_uuid = d.dashboard_uuid
                inner join (
                    select
                        s.space_id,
                        s.space_uuid,
                        jsonb_agg(su.user_uuid) FILTER (WHERE su.user_uuid IS NOT NULL) as access
                    from spaces s
                    left join space_share ss on s.space_id = ss.space_id
                    left join users su on ss.user_id = su.user_id
                    group by 1, 2
                ) sss on sss.space_id = d.space_id
                inner join (
                    select distinct on(dashboard_id) dashboard_id, created_at, updated_by_user_uuid
                    from dashboard_versions
                    order by dashboard_id, created_at desc
                ) dv on d.dashboard_id = dv.dashboard_id
                left join analytics_dashboard_views adv on d.dashboard_uuid = adv.dashboard_uuid
                left join users u on dv.updated_by_user_uuid = u.user_uuid
                group by 1, 2, 3, 4, 5, 6;
`,
        { pinnedListUuid },
    );
    const resourceType: ResourceViewItemType.DASHBOARD =
        ResourceViewItemType.DASHBOARD;
    const items = rows.map((row) => ({
        type: resourceType,
        data: {
            uuid: row.dashboard_uuid,
            spaceUuid: row.space_uuid,
            description: row.description,
            name: row.name,
            views: row.views,
            firstViewedAt: row.first_viewed_at,
            pinnedListUuid: row.pinned_list_uuid,
            updatedAt: row.updated_at,
            updatedByUser: {
                userUuid: row.updated_by_user_uuid,
                firstName: row.updated_by_user_first_name,
                lastName: row.updated_by_user_last_name,
            },
        },
    }));
    return items;
};

const getSpaces = async (
    knex: Knex,
    pinnedListUuid: string,
): Promise<ResourceViewSpaceItem[]> => {
    const rows = await knex.raw<Record<string, any>[]>(
        `
            select
                o.organization_uuid,
                pl.project_uuid,
                pl.pinned_list_uuid,
                ps.space_uuid,
                MAX(s.name) as name,
                BOOL_OR(s.is_private) as is_private,
                COUNT(DISTINCT ss.user_id) as access_list_length,
                jsonb_agg(u.user_uuid) FILTER (WHERE u.user_uuid is not null) as access,
                COUNT(DISTINCT d.dashboard_id) as dashboard_count,
                COUNT(DISTINCT sq.saved_query_id) as chart_count
            from pinned_list pl
            inner join projects p on pl.project_uuid = p.project_uuid
            inner join organizations o on p.organization_id = o.organization_id
            inner join pinned_space ps on pl.pinned_list_uuid = ps.pinned_list_uuid
                and ps.pinned_list_uuid = :pinnedListUuid
            inner join spaces s on ps.space_uuid = s.space_uuid
            left join space_share ss on s.space_id = ss.space_id
            left join users u on ss.user_id = u.user_id
            left join dashboards d on s.space_id = d.space_id
            left join saved_queries sq on s.space_id = sq.space_id
            group by 1, 2, 3, 4;
        `,
        { pinnedListUuid },
    );
    const resourceType: ResourceViewItemType.SPACE = ResourceViewItemType.SPACE;
    return rows.map<ResourceViewSpaceItem>((row) => ({
        type: resourceType,
        data: {
            organizationUuid: row.organization_uuid,
            projectUuid: row.project_uuid,
            pinnedListUuid: row.pinned_list_uuid,
            uuid: row.space_uuid,
            name: row.name,
            isPrivate: row.is_private,
            accessListLength: row.access_list_length,
            dashboardCount: row.dashboard_count,
            chartCount: row.saved_query_count,
            access: row.access,
        },
    }));
};

export class ResourceViewItemModel {
    database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async getResourceViewItemsByPinnedListUuid(
        pinnedListUuid: string,
    ): Promise<ResourceViewItem[]> {
        const results = await this.database.transaction(async (trx) => {
            const spaces = await getSpaces(trx, pinnedListUuid);
            const dashboards = await getDashboards(trx, pinnedListUuid);
            const charts = await getCharts(trx, pinnedListUuid);
            return [...spaces, ...dashboards, ...charts];
        });
        return results;
    }

    async getChartsByPinnedListUuid(
        pinnedListUuid: string,
    ): Promise<ResourceViewChartItem[]> {
        return getCharts(this.database, pinnedListUuid);
    }

    async getDashboardsByPinnedListUuid(
        pinnedListUuid: string,
    ): Promise<ResourceViewDashboardItem[]> {
        return getDashboards(this.database, pinnedListUuid);
    }

    async getSpacesByPinnedListUuid(
        pinnedListUuid: string,
    ): Promise<ResourceViewSpaceItem[]> {
        return getSpaces(this.database, pinnedListUuid);
    }
}
