import {
    ContentType,
    ResourceViewItemType,
    type ResourceViewChartItem,
    type ResourceViewDashboardItem,
    type ResourceViewDataAppItem,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { AppsTableName, AppVersionsTableName } from '../database/entities/apps';
import { DashboardsTableName } from '../database/entities/dashboards';
import { OrganizationTableName } from '../database/entities/organizations';
import { PinnedAppTableName } from '../database/entities/pinnedList';
import { ProjectTableName } from '../database/entities/projects';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import { SpaceTableName } from '../database/entities/spaces';
import {
    UserFavoritesTableName,
    type CreateDbUserFavorite,
} from '../database/entities/userFavorites';
import { type ResourceViewSpaceItemBase } from './ResourceViewItemModel';

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
            .whereIn(`${SavedChartsTableName}.saved_query_uuid`, chartUuids)
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
                updated_by_user_uuid: 'users.user_uuid',
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
                verification: null,
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
            .whereIn(`${DashboardsTableName}.dashboard_uuid`, dashboardUuids)
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
                verification: null,
            },
        }));
    }

    async getFavoriteApps(
        projectUuid: string,
        appUuids: string[],
        allowedSpaceUuids: string[],
    ): Promise<ResourceViewDataAppItem[]> {
        if (appUuids.length === 0 || allowedSpaceUuids.length === 0) {
            return [];
        }
        const rows = (await this.database(AppsTableName)
            .innerJoin(
                SpaceTableName,
                `${SpaceTableName}.space_uuid`,
                `${AppsTableName}.space_uuid`,
            )
            .innerJoin(
                `${AppVersionsTableName} as latest_version`,
                'latest_version.app_id',
                `${AppsTableName}.app_id`,
            )
            .leftJoin(
                'users as last_updated_by_user',
                'last_updated_by_user.user_uuid',
                'latest_version.created_by_user_uuid',
            )
            .leftJoin(
                PinnedAppTableName,
                `${PinnedAppTableName}.app_uuid`,
                `${AppsTableName}.app_id`,
            )
            .whereIn(`${AppsTableName}.app_id`, appUuids)
            .andWhere(`${AppsTableName}.project_uuid`, projectUuid)
            .whereIn(`${SpaceTableName}.space_uuid`, allowedSpaceUuids)
            .whereNull(`${AppsTableName}.deleted_at`)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .where(
                `latest_version.app_version_id`,
                this.database.raw(
                    `(select app_version_id
                      from ${AppVersionsTableName}
                      where app_id = ${AppsTableName}.app_id
                      order by version desc
                      limit 1)`,
                ),
            )
            .select({
                app_id: `${AppsTableName}.app_id`,
                name: `${AppsTableName}.name`,
                description: `${AppsTableName}.description`,
                space_uuid: `${SpaceTableName}.space_uuid`,
                created_at: `${AppsTableName}.created_at`,
                created_by_user_uuid: `${AppsTableName}.created_by_user_uuid`,
                views: `${AppsTableName}.views_count`,
                latest_version_number: 'latest_version.version',
                latest_version_status: 'latest_version.status',
                latest_version_created_at: 'latest_version.created_at',
                updated_by_user_uuid: 'last_updated_by_user.user_uuid',
                updated_by_user_first_name: 'last_updated_by_user.first_name',
                updated_by_user_last_name: 'last_updated_by_user.last_name',
                pinned_list_uuid: `${PinnedAppTableName}.pinned_list_uuid`,
                pinned_list_order: `${PinnedAppTableName}.order`,
            })) as Record<string, AnyType>[];

        return rows.map<ResourceViewDataAppItem>((row) => ({
            type: ResourceViewItemType.DATA_APP,
            data: {
                uuid: row.app_id,
                name: row.name,
                description: row.description ?? undefined,
                spaceUuid: row.space_uuid,
                createdByUserUuid: row.created_by_user_uuid ?? null,
                updatedAt: row.latest_version_created_at ?? row.created_at,
                updatedByUser: row.updated_by_user_uuid
                    ? {
                          userUuid: row.updated_by_user_uuid,
                          firstName: row.updated_by_user_first_name ?? '',
                          lastName: row.updated_by_user_last_name ?? '',
                      }
                    : null,
                views: row.views,
                firstViewedAt: row.created_at,
                latestVersionNumber: row.latest_version_number ?? null,
                latestVersionStatus: row.latest_version_status ?? null,
                pinnedListUuid: row.pinned_list_uuid ?? null,
                pinnedListOrder: row.pinned_list_order ?? null,
            },
        }));
    }

    async getFavoriteSpaces(
        projectUuid: string,
        spaceUuids: string[],
        allowedSpaceUuids: string[],
    ): Promise<ResourceViewSpaceItemBase[]> {
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
                        child_space_count: this.database.raw(
                            `(SELECT count(*) FROM ${SpaceTableName} cs WHERE cs.parent_space_uuid = ${SpaceTableName}.space_uuid AND cs.deleted_at IS NULL)`,
                        ),
                        app_count: this.database.raw(
                            `(SELECT count(*) FROM ${AppsTableName} a WHERE a.space_uuid = ${SpaceTableName}.space_uuid AND a.deleted_at IS NULL)`,
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
                'space_counts as sc',
                'sc.space_id',
                `${SpaceTableName}.space_id`,
            )
            .select({
                organization_uuid: `${OrganizationTableName}.organization_uuid`,
                project_uuid: `${ProjectTableName}.project_uuid`,
                space_uuid: `${SpaceTableName}.space_uuid`,
                name: `${SpaceTableName}.name`,
                inherit_parent_permissions: `${SpaceTableName}.inherit_parent_permissions`,
                parent_space_uuid: `${SpaceTableName}.parent_space_uuid`,
                path: `${SpaceTableName}.path`,
                dashboard_count: this.database.raw(
                    'COALESCE(sc.dashboard_count, 0)',
                ),
                chart_count: this.database.raw('COALESCE(sc.chart_count, 0)'),
                child_space_count: this.database.raw(
                    'COALESCE(sc.child_space_count, 0)',
                ),
                app_count: this.database.raw('COALESCE(sc.app_count, 0)'),
            })
            .whereIn(`${SpaceTableName}.space_uuid`, filteredUuids)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .where(`${ProjectTableName}.project_uuid`, projectUuid);

        return spaces.map<ResourceViewSpaceItemBase>((row) => ({
            type: ResourceViewItemType.SPACE,
            data: {
                organizationUuid: row.organization_uuid,
                projectUuid: row.project_uuid,
                pinnedListUuid: null,
                pinnedListOrder: null,
                uuid: row.space_uuid,
                name: row.name,
                inheritParentPermissions: row.inherit_parent_permissions,
                dashboardCount: Number(row.dashboard_count),
                chartCount: Number(row.chart_count),
                childSpaceCount: Number(row.child_space_count),
                appCount: Number(row.app_count),
                parentSpaceUuid: row.parent_space_uuid,
                path: row.path,
            },
        }));
    }
}
