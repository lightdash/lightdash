import {
    AnyType,
    ResourceViewChartItem,
    ResourceViewDashboardItem,
    ResourceViewItemType,
    ResourceViewSpaceItem,
} from '@lightdash/common';
import { Knex } from 'knex';
import { DashboardsTableName } from '../database/entities/dashboards';
import { OrganizationTableName } from '../database/entities/organizations';
import {
    PinnedListTableName,
    PinnedSpaceTableName,
} from '../database/entities/pinnedList';
import { ProjectTableName } from '../database/entities/projects';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import {
    SpaceTableName,
    SpaceUserAccessTableName,
} from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import { SpaceModel } from './SpaceModel';

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
            space_uuid: `${SpaceTableName}.space_uuid`,
            saved_chart_uuid: 'pinned_chart.saved_chart_uuid',
            updated_by_user_first_name: 'users.first_name',
            updated_by_user_last_name: 'users.last_name',
            updated_by_user_uuid: `${SavedChartsTableName}.last_version_updated_by_user_uuid`,
            order: 'pinned_chart.order',
            chart_kind: `${SavedChartsTableName}.last_version_chart_kind`,
            name: `${SavedChartsTableName}.name`,
            description: `${SavedChartsTableName}.description`,
            updated_at: `${SavedChartsTableName}.last_version_updated_at`,
            views: `${SavedChartsTableName}.views_count`,
            first_viewed_at: `${SavedChartsTableName}.first_viewed_at`,
            slug: `${SavedChartsTableName}.slug`,
        })
        .innerJoin(
            'pinned_chart',
            'pinned_list.pinned_list_uuid',
            'pinned_chart.pinned_list_uuid',
        )
        .innerJoin(SavedChartsTableName, function nonDeletedChartJoin() {
            this.on(
                'pinned_chart.saved_chart_uuid',
                '=',
                `${SavedChartsTableName}.saved_query_uuid`,
            ).andOnNull(`${SavedChartsTableName}.deleted_at`);
        })
        .innerJoin(
            SpaceTableName,
            `${SavedChartsTableName}.space_id`,
            `${SpaceTableName}.space_id`,
        )
        .leftJoin(
            'users',
            `${SavedChartsTableName}.last_version_updated_by_user_uuid`,
            'users.user_uuid',
        )
        .whereIn(`${SpaceTableName}.space_uuid`, allowedSpaceUuids)
        .whereNull(`${SpaceTableName}.deleted_at`)
        .andWhere('pinned_list.pinned_list_uuid', pinnedListUuid)
        .andWhere('pinned_list.project_uuid', projectUuid)
        .orderBy('pinned_chart.order', 'asc')) as Record<string, AnyType>[];
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
            slug: row.slug,
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
        .innerJoin(DashboardsTableName, function nonDeletedDashboardJoin() {
            this.on(
                'pinned_dashboard.dashboard_uuid',
                '=',
                `${DashboardsTableName}.dashboard_uuid`,
            ).andOnNull(`${DashboardsTableName}.deleted_at`);
        })
        .innerJoin(
            SpaceTableName,
            `${DashboardsTableName}.space_id`,
            `${SpaceTableName}.space_id`,
        )
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
            `${DashboardsTableName}.dashboard_id`,
            'dv.dashboard_id',
        )
        .leftJoin('users', 'dv.updated_by_user_uuid', 'users.user_uuid')
        .whereIn(`${SpaceTableName}.space_uuid`, allowedSpaceUuids)
        .whereNull(`${SpaceTableName}.deleted_at`)
        .andWhere('pinned_list.pinned_list_uuid', pinnedListUuid)
        .andWhere('pinned_list.project_uuid', projectUuid)
        .select(
            'pinned_list.project_uuid',
            'pinned_list.pinned_list_uuid',
            `${SpaceTableName}.space_uuid`,
            'pinned_dashboard.dashboard_uuid',
            'users.user_uuid as updated_by_user_uuid',
            'pinned_dashboard.order',
        )
        .max({
            name: `${DashboardsTableName}.name`,
            views: `${DashboardsTableName}.views_count`,
            first_viewed_at: `${DashboardsTableName}.first_viewed_at`,
            description: `${DashboardsTableName}.description`,
            updated_at: 'dv.updated_at',
            updated_by_user_first_name: 'users.first_name',
            updated_by_user_last_name: 'users.last_name',
        })
        .orderBy('pinned_dashboard.order', 'asc')
        .groupBy(1, 2, 3, 4, 5, 6)) as Record<string, AnyType>[];
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
    const spaces = await knex
        .with('space_counts', (qb) =>
            qb
                .select({
                    space_id: `${SpaceTableName}.space_id`,
                    dashboard_count: knex.countDistinct(
                        `${DashboardsTableName}.dashboard_id`,
                    ),
                    chart_count: knex.countDistinct(
                        `${SavedChartsTableName}.saved_query_id`,
                    ),
                })
                .from(SpaceTableName)
                .leftJoin(
                    DashboardsTableName,
                    function nonDeletedDashboardJoin() {
                        this.on(
                            `${DashboardsTableName}.space_id`,
                            '=',
                            `${SpaceTableName}.space_id`,
                        ).andOnNull(`${DashboardsTableName}.deleted_at`);
                    },
                )
                .leftJoin(SavedChartsTableName, function nonDeletedChartJoin() {
                    this.on(
                        `${SavedChartsTableName}.space_id`,
                        '=',
                        `${SpaceTableName}.space_id`,
                    ).andOnNull(`${SavedChartsTableName}.deleted_at`);
                })
                .whereIn(
                    `${SpaceTableName}.space_uuid`,
                    function getSpacesByPinnedListUuid() {
                        return this.select(`${PinnedSpaceTableName}.space_uuid`)
                            .from(PinnedSpaceTableName)
                            .where(
                                `${PinnedSpaceTableName}.pinned_list_uuid`,
                                pinnedListUuid,
                            );
                    },
                )
                .groupBy(`${SpaceTableName}.space_id`),
        )
        .from(PinnedListTableName)
        .innerJoin(
            ProjectTableName,
            `${PinnedListTableName}.project_uuid`,
            `${ProjectTableName}.project_uuid`,
        )
        .innerJoin(
            OrganizationTableName,
            `${ProjectTableName}.organization_id`,
            `${OrganizationTableName}.organization_id`,
        )
        .innerJoin(
            PinnedSpaceTableName,
            `${PinnedListTableName}.pinned_list_uuid`,
            `${PinnedSpaceTableName}.pinned_list_uuid`,
        )
        .innerJoin(SpaceTableName, function nonDeletedSpaceJoin() {
            this.on(
                `${PinnedSpaceTableName}.space_uuid`,
                '=',
                `${SpaceTableName}.space_uuid`,
            ).andOnNull(`${SpaceTableName}.deleted_at`);
        })
        .leftJoin(
            SpaceUserAccessTableName,
            `${SpaceTableName}.space_uuid`,
            `${SpaceUserAccessTableName}.space_uuid`,
        )
        .leftJoin(
            UserTableName,
            `${SpaceUserAccessTableName}.user_uuid`,
            `${UserTableName}.user_uuid`,
        )
        .leftJoin(
            'space_counts as sc',
            'sc.space_id',
            `${SpaceTableName}.space_id`,
        )
        .select({
            organization_uuid: `${OrganizationTableName}.organization_uuid`,
            project_uuid: `${PinnedListTableName}.project_uuid`,
            pinned_list_uuid: `${PinnedListTableName}.pinned_list_uuid`,
            space_uuid: `${PinnedSpaceTableName}.space_uuid`,
            order: `${PinnedSpaceTableName}.order`,
            name: knex.raw(`max(${SpaceTableName}.name)`),
            is_private: knex.raw(SpaceModel.getRootSpaceIsPrivateQuery()),
            access: knex.raw(SpaceModel.getRootSpaceAccessQuery(UserTableName)),
            parent_space_uuid: `${SpaceTableName}.parent_space_uuid`,
            path: `${SpaceTableName}.path`,
            access_list_length: knex.raw(`
                CASE
                    WHEN ${SpaceTableName}.parent_space_uuid IS NOT NULL THEN
                        (SELECT COUNT(DISTINCT sua2.user_uuid)
                         FROM ${SpaceUserAccessTableName} sua2
                         JOIN ${SpaceTableName} root_space ON sua2.space_uuid = root_space.space_uuid
                         WHERE root_space.path @> ${SpaceTableName}.path
                         AND nlevel(root_space.path) = 1
                         AND root_space.deleted_at IS NULL
                         LIMIT 1)
                    ELSE
                        COUNT(DISTINCT ${SpaceUserAccessTableName}.user_uuid)
                END
            `),
            dashboard_count: knex.raw('COALESCE(sc.dashboard_count, 0)'),
            chart_count: knex.raw('COALESCE(sc.chart_count, 0)'),
        })
        .groupBy(
            `${OrganizationTableName}.organization_uuid`,
            `${PinnedListTableName}.project_uuid`,
            `${PinnedListTableName}.pinned_list_uuid`,
            `${PinnedSpaceTableName}.space_uuid`,
            `${PinnedSpaceTableName}.order`,
            `${SpaceTableName}.project_id`,
            `${SpaceTableName}.parent_space_uuid`,
            `${SpaceTableName}.path`,
            `${SpaceTableName}.is_private`,
            `${SpaceTableName}.space_id`,
            'sc.dashboard_count',
            'sc.chart_count',
        )
        .where({
            [`${PinnedListTableName}.project_uuid`]: projectUuid,
            [`${PinnedListTableName}.pinned_list_uuid`]: pinnedListUuid,
        })
        .orderBy(`${PinnedSpaceTableName}.order`, 'asc');

    return spaces.map<ResourceViewSpaceItem>((row) => ({
        type: ResourceViewItemType.SPACE,
        data: {
            organizationUuid: row.organization_uuid,
            projectUuid: row.project_uuid,
            pinnedListUuid: row.pinned_list_uuid,
            pinnedListOrder: row.order,
            uuid: row.space_uuid,
            name: row.name,
            isPrivate: row.is_private,
            accessListLength: Number(row.access_list_length),
            dashboardCount: Number(row.dashboard_count),
            chartCount: Number(row.chart_count),
            access: row.access,
            parentSpaceUuid: row.parent_space_uuid,
            path: row.path,
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
