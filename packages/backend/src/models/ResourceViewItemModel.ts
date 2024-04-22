import {
    getChartType,
    ResourceViewChartItem,
    ResourceViewDashboardItem,
    ResourceViewItemType,
    ResourceViewSpaceItem,
} from '@lightdash/common';
import { Knex } from 'knex';

type ResourceViewItemModelArguments = {
    database: Knex;
};

const getCharts = async (
    knex: Knex,
    projectUuid: string,
    pinnedListUuid: string,
    allowedSpaceUuids: string[],
): Promise<ResourceViewChartItem[]> => {
    if (allowedSpaceUuids.length === 0) {
        return [];
    }
    const rows = (await knex('pinned_list')
        .select({
            project_uuid: 'pinned_list.project_uuid',
            pinned_list_uuid: 'pinned_list.pinned_list_uuid',
            space_uuid: 'spaces.space_uuid',
            saved_chart_uuid: 'pinned_chart.saved_chart_uuid',
            updated_by_user_first_name: 'users.first_name',
            updated_by_user_last_name: 'users.last_name',
            updated_by_user_uuid:
                'saved_queries.last_version_updated_by_user_uuid',
            order: 'pinned_chart.order',
            chart_kind: `saved_queries.last_version_chart_kind`,
            name: 'saved_queries.name',
            description: 'saved_queries.description',
            updated_at: 'saved_queries.last_version_updated_at',
        })
        .min({
            first_viewed_at: 'analytics_chart_views.timestamp',
        })
        .count({
            views: 'analytics_chart_views.timestamp',
        })
        .innerJoin(
            'pinned_chart',
            'pinned_list.pinned_list_uuid',
            'pinned_chart.pinned_list_uuid',
        )
        .innerJoin(
            'saved_queries',
            'pinned_chart.saved_chart_uuid',
            'saved_queries.saved_query_uuid',
        )
        .innerJoin('spaces', 'saved_queries.space_id', 'spaces.space_id')
        .leftJoin(
            'users',
            'saved_queries.last_version_updated_by_user_uuid',
            'users.user_uuid',
        )
        .leftJoin(
            'analytics_chart_views',
            'saved_queries.saved_query_uuid',
            'analytics_chart_views.chart_uuid',
        )
        .whereIn('spaces.space_uuid', allowedSpaceUuids)
        .andWhere('pinned_list.pinned_list_uuid', pinnedListUuid)
        .andWhere('pinned_list.project_uuid', projectUuid)
        .orderBy('pinned_chart.order', 'asc')
        .groupBy([
            'pinned_list.project_uuid',
            'pinned_list.pinned_list_uuid',
            'spaces.space_uuid',
            'pinned_chart.saved_chart_uuid',
            'users.first_name',
            'users.last_name',

            'saved_queries.last_version_updated_by_user_uuid',
            'pinned_chart.order',
            `saved_queries.last_version_chart_kind`,
            'saved_queries.name',
            'saved_queries.description',
            'saved_queries.last_version_updated_at',
        ])) as Record<string, any>[];
    const resourceType: ResourceViewItemType.CHART = ResourceViewItemType.CHART;
    const items = rows.map((row) => ({
        type: resourceType,
        data: {
            pinnedListUuid: row.pinned_list_uuid,
            pinnedListOrder: row.order,
            spaceUuid: row.space_uuid,
            uuid: row.saved_chart_uuid,
            name: row.name,
            description: row.description,
            updatedAt: row.updated_at,
            views: row.views,
            firstViewedAt: row.first_viewed_at,
            chartKind: row.chart_kind,
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
    projectUuid: string,
    pinnedListUuid: string,
    allowedSpaceUuids: string[],
): Promise<ResourceViewDashboardItem[]> => {
    if (allowedSpaceUuids.length === 0) {
        return [];
    }
    const rows = (await knex('pinned_list')
        .innerJoin(
            'pinned_dashboard',
            'pinned_list.pinned_list_uuid',
            'pinned_dashboard.pinned_list_uuid',
        )
        .innerJoin(
            'dashboards',
            'pinned_dashboard.dashboard_uuid',
            'dashboards.dashboard_uuid',
        )
        .innerJoin('spaces', 'dashboards.space_id', 'spaces.space_id')
        .innerJoin(
            knex('dashboard_versions')
                .distinctOn('dashboard_id')
                .orderBy('dashboard_id')
                .orderBy('created_at', 'desc')
                .select(
                    'dashboard_id',
                    'created_at as updated_at',
                    'updated_by_user_uuid',
                )
                .as('dv'),
            'dashboards.dashboard_id',
            'dv.dashboard_id',
        )
        .leftJoin(
            'analytics_dashboard_views',
            'dashboards.dashboard_uuid',
            'analytics_dashboard_views.dashboard_uuid',
        )
        .leftJoin('users', 'dv.updated_by_user_uuid', 'users.user_uuid')
        .whereIn('spaces.space_uuid', allowedSpaceUuids)
        .andWhere('pinned_list.pinned_list_uuid', pinnedListUuid)
        .andWhere('pinned_list.project_uuid', projectUuid)
        .select(
            'pinned_list.project_uuid',
            'pinned_list.pinned_list_uuid',
            'spaces.space_uuid',
            'pinned_dashboard.dashboard_uuid',
            'users.user_uuid as updated_by_user_uuid',
            'pinned_dashboard.order',
        )
        .max({
            name: 'dashboards.name',
            description: 'dashboards.description',
            updated_at: 'dv.updated_at',
            updated_by_user_first_name: 'users.first_name',
            updated_by_user_last_name: 'users.last_name',
        })
        .min({
            first_viewed_at: 'analytics_dashboard_views.timestamp',
        })
        .count({ views: 'analytics_dashboard_views.timestamp' })
        .orderBy('pinned_dashboard.order', 'asc')
        .groupBy(1, 2, 3, 4, 5, 6)) as Record<string, any>[];
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
            pinnedListOrder: row.order,
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

const getAllSpaces = async (
    knex: Knex,
    projectUuid: string,
    pinnedListUuid: string,
): Promise<ResourceViewSpaceItem[]> => {
    const { rows } = await knex.raw<{ rows: Record<string, any>[] }>(
        `
            select
                o.organization_uuid,
                pl.project_uuid,
                pl.pinned_list_uuid,
                ps.space_uuid,
                ps.order,
                MAX(s.name) as name,
                BOOL_OR(s.is_private) as is_private,
                COUNT(DISTINCT sua.user_uuid) as access_list_length,
                COALESCE(json_agg(distinct u.user_uuid) FILTER (WHERE u.user_uuid is not null), '[]') as access,
                COUNT(DISTINCT d.dashboard_id) as dashboard_count,
                COUNT(DISTINCT sq.saved_query_id) as chart_count
            from pinned_list pl
            inner join projects p on pl.project_uuid = p.project_uuid
                and pl.project_uuid = :projectUuid
            inner join organizations o on p.organization_id = o.organization_id
            inner join pinned_space ps on pl.pinned_list_uuid = ps.pinned_list_uuid
                and ps.pinned_list_uuid = :pinnedListUuid
            inner join spaces s on ps.space_uuid = s.space_uuid
            left join space_user_access sua on s.space_uuid = sua.space_uuid
            left join users u on sua.user_uuid = u.user_uuid
            left join dashboards d on s.space_id = d.space_id
            left join saved_queries sq on s.space_id = sq.space_id
            group by 1, 2, 3, 4, 5
            order by ps.order asc;
        `,
        { pinnedListUuid, projectUuid },
    );
    const resourceType: ResourceViewItemType.SPACE = ResourceViewItemType.SPACE;
    return rows.map<ResourceViewSpaceItem>((row) => ({
        type: resourceType,
        data: {
            organizationUuid: row.organization_uuid,
            projectUuid: row.project_uuid,
            pinnedListUuid: row.pinned_list_uuid,
            pinnedListOrder: row.order,
            uuid: row.space_uuid,
            name: row.name,
            isPrivate: row.is_private,
            accessListLength: row.access_list_length,
            dashboardCount: row.dashboard_count,
            chartCount: row.chart_count,
            access: row.access,
        },
    }));
};

export class ResourceViewItemModel {
    database: Knex;

    constructor(args: ResourceViewItemModelArguments) {
        this.database = args.database;
    }

    async getAllowedChartsAndDashboards(
        projectUuid: string,
        pinnedListUuid: string,
        allowedSpacesUuids: string[],
    ): Promise<{
        dashboards: ResourceViewDashboardItem[];
        charts: ResourceViewChartItem[];
    }> {
        const results = await this.database.transaction(async (trx) => {
            const dashboards = await getDashboards(
                trx,
                projectUuid,
                pinnedListUuid,
                allowedSpacesUuids,
            );
            const charts = await getCharts(
                trx,
                projectUuid,
                pinnedListUuid,
                allowedSpacesUuids,
            );
            return {
                dashboards,
                charts,
            };
        });
        return results;
    }

    async getAllSpacesByPinnedListUuid(
        projectUuid: string,
        pinnedListUuid: string,
    ): Promise<ResourceViewSpaceItem[]> {
        return getAllSpaces(this.database, projectUuid, pinnedListUuid);
    }
}
