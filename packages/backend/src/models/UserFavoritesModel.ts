import {
    ContentType,
    type ResourceViewChartItem,
    type ResourceViewDashboardItem,
    ResourceViewItemType,
    type ResourceViewSpaceItem,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { DashboardsTableName } from '../database/entities/dashboards';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectTableName } from '../database/entities/projects';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import {
    SpaceTableName,
    SpaceUserAccessTableName,
} from '../database/entities/spaces';
import {
    type CreateDbUserFavorite,
    UserFavoritesTableName,
} from '../database/entities/userFavorites';
import { UserTableName } from '../database/entities/users';
import {
    getRootSpaceAccessQuery,
    getRootSpaceIsPrivateQuery,
} from './SpacePermissionModel';

type UserFavoritesModelArguments = {
    database: Knex;
};

type AnyType = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export class UserFavoritesModel {
    database: Knex;

    constructor(args: UserFavoritesModelArguments) {
        this.database = args.database;
    }

    async addFavorite(
        userUuid: string,
        projectUuid: string,
        contentType: ContentType,
        contentUuid: string,
    ): Promise<void> {
        const row: CreateDbUserFavorite = {
            user_uuid: userUuid,
            project_uuid: projectUuid,
            content_type: contentType,
            content_uuid: contentUuid,
        };
        await this.database(UserFavoritesTableName)
            .insert(row)
            .onConflict(['user_uuid', 'content_type', 'content_uuid'])
            .ignore();
    }

    async removeFavorite(
        userUuid: string,
        contentType: ContentType,
        contentUuid: string,
    ): Promise<void> {
        await this.database(UserFavoritesTableName)
            .where({
                user_uuid: userUuid,
                content_type: contentType,
                content_uuid: contentUuid,
            })
            .delete();
    }

    async isFavorite(
        userUuid: string,
        contentType: ContentType,
        contentUuid: string,
    ): Promise<boolean> {
        const row = await this.database(UserFavoritesTableName)
            .where({
                user_uuid: userUuid,
                content_type: contentType,
                content_uuid: contentUuid,
            })
            .first();
        return !!row;
    }

    async getFavoriteUuids(
        userUuid: string,
        projectUuid: string,
    ): Promise<{ contentType: ContentType; contentUuid: string }[]> {
        const rows = await this.database(UserFavoritesTableName)
            .where({
                user_uuid: userUuid,
                project_uuid: projectUuid,
            })
            .select('content_type', 'content_uuid');
        return rows.map((row) => ({
            contentType: row.content_type as ContentType,
            contentUuid: row.content_uuid,
        }));
    }

    async getFavoriteCharts(
        projectUuid: string,
        chartUuids: string[],
        allowedSpaceUuids: string[],
    ): Promise<ResourceViewChartItem[]> {
        if (chartUuids.length === 0 || allowedSpaceUuids.length === 0) {
            return [];
        }
        const rows = (await this.database(SavedChartsTableName)
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
            .whereIn(
                `${SavedChartsTableName}.saved_query_uuid`,
                chartUuids,
            )
            .whereIn(`${SpaceTableName}.space_uuid`, allowedSpaceUuids)
            .whereNull(`${SavedChartsTableName}.deleted_at`)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .select({
                saved_chart_uuid: `${SavedChartsTableName}.saved_query_uuid`,
                name: `${SavedChartsTableName}.name`,
                description: `${SavedChartsTableName}.description`,
                space_uuid: `${SpaceTableName}.space_uuid`,
                updated_at: `${SavedChartsTableName}.last_version_updated_at`,
                views: `${SavedChartsTableName}.views_count`,
                first_viewed_at: `${SavedChartsTableName}.first_viewed_at`,
                chart_kind: `${SavedChartsTableName}.last_version_chart_kind`,
                slug: `${SavedChartsTableName}.slug`,
                updated_by_user_uuid:
                    'users.user_uuid',
                updated_by_user_first_name: 'users.first_name',
                updated_by_user_last_name: 'users.last_name',
            })) as Record<string, AnyType>[];

        return rows.map((row) => ({
            type: ResourceViewItemType.CHART as const,
            data: {
                uuid: row.saved_chart_uuid,
                name: row.name,
                description: row.description,
                spaceUuid: row.space_uuid,
                updatedAt: row.updated_at,
                views: row.views,
                firstViewedAt: row.first_viewed_at,
                chartKind: row.chart_kind,
                pinnedListUuid: null,
                pinnedListOrder: null,
                updatedByUser: row.updated_by_user_uuid
                    ? {
                          userUuid: row.updated_by_user_uuid,
                          firstName: row.updated_by_user_first_name,
                          lastName: row.updated_by_user_last_name,
                      }
                    : undefined,
                slug: row.slug,
            },
        }));
    }

    async getFavoriteDashboards(
        projectUuid: string,
        dashboardUuids: string[],
        allowedSpaceUuids: string[],
    ): Promise<ResourceViewDashboardItem[]> {
        if (dashboardUuids.length === 0 || allowedSpaceUuids.length === 0) {
            return [];
        }
        const rows = (await this.database(DashboardsTableName)
            .innerJoin(
                SpaceTableName,
                `${DashboardsTableName}.space_id`,
                `${SpaceTableName}.space_id`,
            )
            .innerJoin(
                this.database('dashboard_versions')
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
            .whereIn(
                `${DashboardsTableName}.dashboard_uuid`,
                dashboardUuids,
            )
            .whereIn(`${SpaceTableName}.space_uuid`, allowedSpaceUuids)
            .whereNull(`${DashboardsTableName}.deleted_at`)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .select(
                `${SpaceTableName}.space_uuid`,
                `${DashboardsTableName}.dashboard_uuid`,
                'users.user_uuid as updated_by_user_uuid',
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
            .groupBy(
                `${SpaceTableName}.space_uuid`,
                `${DashboardsTableName}.dashboard_uuid`,
                'users.user_uuid',
            )) as Record<string, AnyType>[];

        return rows.map((row) => ({
            type: ResourceViewItemType.DASHBOARD as const,
            data: {
                uuid: row.dashboard_uuid,
                spaceUuid: row.space_uuid,
                description: row.description,
                name: row.name,
                views: row.views,
                firstViewedAt: row.first_viewed_at,
                pinnedListUuid: null,
                pinnedListOrder: null,
                updatedAt: row.updated_at,
                updatedByUser: row.updated_by_user_uuid
                    ? {
                          userUuid: row.updated_by_user_uuid,
                          firstName: row.updated_by_user_first_name,
                          lastName: row.updated_by_user_last_name,
                      }
                    : undefined,
            },
        }));
    }

    async getFavoriteSpaces(
        projectUuid: string,
        spaceUuids: string[],
        allowedSpaceUuids: string[],
    ): Promise<ResourceViewSpaceItem[]> {
        if (spaceUuids.length === 0) {
            return [];
        }
        const filteredUuids = spaceUuids.filter((uuid) =>
            allowedSpaceUuids.includes(uuid),
        );
        if (filteredUuids.length === 0) {
            return [];
        }

        const spaces = await this.database
            .with('space_counts', (qb) =>
                qb
                    .select({
                        space_id: `${SpaceTableName}.space_id`,
                        dashboard_count: this.database.countDistinct(
                            `${DashboardsTableName}.dashboard_id`,
                        ),
                        chart_count: this.database.countDistinct(
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
                    .leftJoin(
                        SavedChartsTableName,
                        function nonDeletedChartJoin() {
                            this.on(
                                `${SavedChartsTableName}.space_id`,
                                '=',
                                `${SpaceTableName}.space_id`,
                            ).andOnNull(`${SavedChartsTableName}.deleted_at`);
                        },
                    )
                    .whereIn(`${SpaceTableName}.space_uuid`, filteredUuids)
                    .groupBy(`${SpaceTableName}.space_id`),
            )
            .from(SpaceTableName)
            .innerJoin(
                ProjectTableName,
                `${SpaceTableName}.project_id`,
                `${ProjectTableName}.project_id`,
            )
            .innerJoin(
                OrganizationTableName,
                `${ProjectTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
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
                project_uuid: `${ProjectTableName}.project_uuid`,
                space_uuid: `${SpaceTableName}.space_uuid`,
                name: this.database.raw(`max(${SpaceTableName}.name)`),
                is_private: this.database.raw(getRootSpaceIsPrivateQuery()),
                access: this.database.raw(
                    getRootSpaceAccessQuery(UserTableName),
                ),
                parent_space_uuid: `${SpaceTableName}.parent_space_uuid`,
                path: `${SpaceTableName}.path`,
                access_list_length: this.database.raw(`
                    CASE
                        WHEN ${SpaceTableName}.parent_space_uuid IS NOT NULL THEN
                            (SELECT COUNT(DISTINCT sua2.user_uuid)
                             FROM ${SpaceUserAccessTableName} sua2
                             JOIN ${SpaceTableName} root_space ON sua2.space_uuid = root_space.space_uuid
                             WHERE root_space.path @> ${SpaceTableName}.path
                             AND nlevel(root_space.path) = 1
                             LIMIT 1)
                        ELSE
                            COUNT(DISTINCT ${SpaceUserAccessTableName}.user_uuid)
                    END
                `),
                dashboard_count: this.database.raw(
                    'COALESCE(sc.dashboard_count, 0)',
                ),
                chart_count: this.database.raw('COALESCE(sc.chart_count, 0)'),
            })
            .whereIn(`${SpaceTableName}.space_uuid`, filteredUuids)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .groupBy(
                `${OrganizationTableName}.organization_uuid`,
                `${ProjectTableName}.project_uuid`,
                `${SpaceTableName}.space_uuid`,
                `${SpaceTableName}.parent_space_uuid`,
                `${SpaceTableName}.path`,
                `${SpaceTableName}.is_private`,
                `${SpaceTableName}.space_id`,
                'sc.dashboard_count',
                'sc.chart_count',
            );

        return spaces.map<ResourceViewSpaceItem>((row) => ({
            type: ResourceViewItemType.SPACE,
            data: {
                organizationUuid: row.organization_uuid,
                projectUuid: row.project_uuid,
                pinnedListUuid: null,
                pinnedListOrder: null,
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
    }
}
