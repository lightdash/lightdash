import { ContentType, SpaceContent } from '@lightdash/common';
import { Knex } from 'knex';
import { DashboardsTableName } from '../../../database/entities/dashboards';
import { OrganizationTableName } from '../../../database/entities/organizations';
import { PinnedSpaceTableName } from '../../../database/entities/pinnedList';
import { ProjectTableName } from '../../../database/entities/projects';
import { SavedChartsTableName } from '../../../database/entities/savedCharts';
import { SavedSqlTableName } from '../../../database/entities/savedSql';
import { SchedulerTableName } from '../../../database/entities/scheduler';
import {
    SpaceTableName,
    SpaceUserAccessTableName,
} from '../../../database/entities/spaces';
import { UserTableName } from '../../../database/entities/users';
import { SpaceModel } from '../../SpaceModel';
import {
    ContentConfiguration,
    ContentFilters,
    ContentTypePriority,
    SummaryContentRow,
} from '../ContentModelTypes';

type SpaceContentRow = SummaryContentRow<{
    dashboardCount: number;
    chartCount: number;
    nestedSpaceCount: number;
    schedulerCount: number;
    parentSpaceUuid: string | null;
    path: string;
    access: string[];
    isPrivate: boolean;
    inheritParentPermissions: boolean;
    pinnedListOrder: number;
}>;

export const spaceContentConfiguration: ContentConfiguration<SpaceContentRow> =
    {
        shouldQueryBeIncluded: (filters: ContentFilters) => {
            if (filters.contentTypes?.includes(ContentType.SPACE)) {
                return true;
            }
            // Include spaces in deleted content "all" view
            if (filters.deleted && !filters.contentTypes) {
                return true;
            }
            return false;
        },
        getSummaryQuery: (
            knex: Knex,
            filters: ContentFilters,
        ): Knex.QueryBuilder =>
            knex
                .from(SpaceTableName)
                .innerJoin(
                    ProjectTableName,
                    `${SpaceTableName}.project_id`,
                    `${ProjectTableName}.project_id`,
                )
                .innerJoin(
                    OrganizationTableName,
                    `${OrganizationTableName}.organization_id`,
                    `${ProjectTableName}.organization_id`,
                )
                .leftJoin(
                    PinnedSpaceTableName,
                    `${PinnedSpaceTableName}.space_uuid`,
                    `${SpaceTableName}.space_uuid`,
                )
                .leftJoin(
                    `${UserTableName} as created_by_user`,
                    `created_by_user.user_id`,
                    `${SpaceTableName}.created_by_user_id`,
                )
                .leftJoin(
                    `${SpaceUserAccessTableName}`,
                    `${SpaceUserAccessTableName}.space_uuid`,
                    `${SpaceTableName}.space_uuid`,
                )
                .leftJoin(
                    `${UserTableName} as shared_with`,
                    `${SpaceUserAccessTableName}.user_uuid`,
                    'shared_with.user_uuid',
                )
                .leftJoin(
                    `${UserTableName} as deleted_by_user`,
                    `${SpaceTableName}.deleted_by_user_uuid`,
                    'deleted_by_user.user_uuid',
                )
                .select<SpaceContentRow[]>([
                    knex.raw(`'${ContentType.SPACE}' as content_type`),
                    knex.raw(
                        `${ContentTypePriority.SPACE} as content_type_rank`,
                    ),
                    knex.raw(`${SpaceTableName}.space_uuid::text as uuid`),
                    `${SpaceTableName}.name`,
                    knex.raw(`null as description`),
                    `${SpaceTableName}.slug`,
                    `${SpaceTableName}.space_uuid`,
                    `${SpaceTableName}.name as space_name`,
                    `${ProjectTableName}.project_uuid`,
                    `${ProjectTableName}.name as project_name`,
                    `${OrganizationTableName}.organization_uuid`,
                    `${OrganizationTableName}.organization_name`,
                    `${PinnedSpaceTableName}.pinned_list_uuid as pinned_list_uuid`,
                    knex.raw(
                        `${SpaceTableName}.created_at::timestamp as created_at`,
                    ),
                    `created_by_user.user_uuid             as created_by_user_uuid`,
                    `created_by_user.first_name            as created_by_user_first_name`,
                    `created_by_user.last_name             as created_by_user_last_name`,
                    knex.raw(
                        `${SpaceTableName}.created_at::timestamp as last_updated_at`,
                    ),
                    knex.raw(`null as last_updated_by_user_uuid`),
                    knex.raw(`null as last_updated_by_user_first_name`),
                    knex.raw(`null as last_updated_by_user_last_name`),
                    knex.raw(`0 as views`),
                    knex.raw(`null as first_viewed_at`),
                    `${SpaceTableName}.deleted_at`,
                    `${SpaceTableName}.deleted_by_user_uuid`,
                    'deleted_by_user.first_name as deleted_by_user_first_name',
                    'deleted_by_user.last_name as deleted_by_user_last_name',
                    knex.raw(`json_build_object(
                        'dashboardCount', (${
                            filters.includeDescendantCounts
                                ? `SELECT count(*) FROM ${DashboardsTableName} d
                                    INNER JOIN ${SpaceTableName} s2 ON s2.space_id = d.space_id
                                    WHERE s2.path <@ ${SpaceTableName}.path`
                                : `SELECT count(DISTINCT ${DashboardsTableName}.dashboard_id)
                                    FROM ${DashboardsTableName}
                                    WHERE ${DashboardsTableName}.space_id = ${SpaceTableName}.space_id
                                    AND ${DashboardsTableName}.deleted_at IS NULL`
                        }),
                        'chartCount', (${
                            filters.includeDescendantCounts
                                ? `SELECT count(*) FROM (
                                        SELECT sq.saved_query_id FROM ${SavedChartsTableName} sq
                                            INNER JOIN ${SpaceTableName} s2 ON s2.space_id = sq.space_id WHERE s2.path <@ ${SpaceTableName}.path
                                        UNION ALL
                                        SELECT sq.saved_query_id FROM ${SavedChartsTableName} sq
                                            INNER JOIN ${DashboardsTableName} d ON d.dashboard_uuid = sq.dashboard_uuid
                                            INNER JOIN ${SpaceTableName} s2 ON s2.space_id = d.space_id WHERE s2.path <@ ${SpaceTableName}.path
                                        UNION ALL
                                        SELECT 1 FROM ${SavedSqlTableName} ss
                                            INNER JOIN ${SpaceTableName} s2 ON s2.space_uuid = ss.space_uuid WHERE s2.path <@ ${SpaceTableName}.path
                                        UNION ALL
                                        SELECT 1 FROM ${SavedSqlTableName} ss
                                            INNER JOIN ${DashboardsTableName} d ON d.dashboard_uuid = ss.dashboard_uuid
                                            INNER JOIN ${SpaceTableName} s2 ON s2.space_id = d.space_id WHERE s2.path <@ ${SpaceTableName}.path
                                    ) _`
                                : `SELECT count(DISTINCT ${SavedChartsTableName}.saved_query_id)
                                    FROM ${SavedChartsTableName}
                                    WHERE ${SavedChartsTableName}.space_id = ${SpaceTableName}.space_id
                                    AND ${SavedChartsTableName}.deleted_at IS NULL`
                        }),
                        'parentSpaceUuid', ${SpaceTableName}.parent_space_uuid,
                        'path', ${SpaceTableName}.path,
                        'access', (${SpaceModel.getRootSpaceAccessQuery(
                            'shared_with',
                        )}),
                        'isPrivate', (${SpaceModel.getRootSpaceIsPrivateQuery()}),
                        'inheritParentPermissions', ${SpaceTableName}.inherit_parent_permissions,
                        'pinnedListOrder', ${PinnedSpaceTableName}.order
                        ${
                            filters.includeDescendantCounts
                                ? `, 'nestedSpaceCount', (
                                    SELECT count(*) FROM ${SpaceTableName} s2
                                    WHERE s2.path <@ ${SpaceTableName}.path AND s2.space_id != ${SpaceTableName}.space_id
                                ),
                                'schedulerCount', (
                                    SELECT count(*) FROM ${SchedulerTableName} sch
                                    WHERE sch.dashboard_uuid IN (
                                            SELECT d.dashboard_uuid FROM ${DashboardsTableName} d
                                            INNER JOIN ${SpaceTableName} s2 ON s2.space_id = d.space_id WHERE s2.path <@ ${SpaceTableName}.path
                                        )
                                        OR sch.saved_chart_uuid IN (
                                            SELECT sq.saved_query_uuid FROM ${SavedChartsTableName} sq
                                                INNER JOIN ${SpaceTableName} s2 ON s2.space_id = sq.space_id WHERE s2.path <@ ${SpaceTableName}.path
                                            UNION ALL
                                            SELECT sq.saved_query_uuid FROM ${SavedChartsTableName} sq
                                                INNER JOIN ${DashboardsTableName} d ON d.dashboard_uuid = sq.dashboard_uuid
                                                INNER JOIN ${SpaceTableName} s2 ON s2.space_id = d.space_id WHERE s2.path <@ ${SpaceTableName}.path
                                        )
                                )`
                                : ''
                        }
                    ) as metadata`),
                ])
                .where((builder) => {
                    if (filters.projectUuids) {
                        void builder.whereIn(
                            `${ProjectTableName}.project_uuid`,
                            filters.projectUuids,
                        );
                    }

                    if (filters.search) {
                        void builder.whereRaw(
                            `LOWER(${SpaceTableName}.name) LIKE ?`,
                            [`%${filters.search.toLowerCase()}%`],
                        );
                    }

                    if (filters.deleted) {
                        // "Recently Deleted" view: only deleted spaces
                        void builder.whereNotNull(
                            `${SpaceTableName}.deleted_at`,
                        );
                        if (filters.deletedByUserUuids?.length) {
                            void builder.whereIn(
                                `${SpaceTableName}.deleted_by_user_uuid`,
                                filters.deletedByUserUuids,
                            );
                        }
                        // Hide cascade-deleted children: only show a deleted space
                        // if it's a root space OR its parent is not also deleted.
                        // Children are auto-restored when the parent is restored.
                        void builder.where(function parentNotDeleted() {
                            void this.whereNull(
                                `${SpaceTableName}.parent_space_uuid`,
                            ).orWhereNotExists(
                                knex
                                    .select(knex.raw('1'))
                                    .from(`${SpaceTableName} as parent_space`)
                                    .whereRaw(
                                        `parent_space.space_uuid = ${SpaceTableName}.parent_space_uuid`,
                                    )
                                    .whereNotNull('parent_space.deleted_at'),
                            );
                        });
                    } else {
                        // Normal content view: only non-deleted spaces,
                        // scoped to allowed spaceUuids from access control
                        void builder.whereNull(`${SpaceTableName}.deleted_at`);
                        if (filters.space?.rootSpaces) {
                            void builder
                                .whereIn(
                                    `${SpaceTableName}.space_uuid`,
                                    filters.spaceUuids ?? [],
                                )
                                .andWhereRaw('nlevel(path) = 1');
                        } else {
                            void builder.whereIn(
                                `${SpaceTableName}.parent_space_uuid`,
                                filters.spaceUuids ?? [],
                            );
                        }
                    }
                })
                .groupBy(
                    `${SpaceTableName}.space_uuid`,
                    `${SpaceTableName}.space_id`,
                    `${SpaceTableName}.name`,
                    `${SpaceTableName}.slug`,
                    `${ProjectTableName}.project_uuid`,
                    `${ProjectTableName}.name`,
                    `${OrganizationTableName}.organization_uuid`,
                    `${OrganizationTableName}.organization_name`,
                    `${PinnedSpaceTableName}.pinned_list_uuid`,
                    `created_by_user.user_uuid`,
                    `created_by_user.first_name`,
                    `created_by_user.last_name`,
                    `${SpaceTableName}.parent_space_uuid`,
                    `${SpaceTableName}.created_at`,
                    `${PinnedSpaceTableName}.order`,
                    `${SpaceTableName}.deleted_at`,
                    `${SpaceTableName}.deleted_by_user_uuid`,
                    'deleted_by_user.first_name',
                    'deleted_by_user.last_name',
                ),
        shouldRowBeConverted: (value): value is SpaceContentRow =>
            value.content_type === ContentType.SPACE,
        convertSummaryRow: (value): SpaceContent => {
            if (!spaceContentConfiguration.shouldRowBeConverted(value)) {
                throw new Error('Invalid content row');
            }
            return {
                contentType: ContentType.SPACE,
                uuid: value.uuid,
                slug: value.slug,
                name: value.name,
                description: null,
                createdAt: value.created_at,
                createdBy: value.created_by_user_uuid
                    ? {
                          uuid: value.created_by_user_uuid,
                          firstName: value.created_by_user_first_name ?? '',
                          lastName: value.created_by_user_last_name ?? '',
                      }
                    : null,
                lastUpdatedAt: value.last_updated_at,
                lastUpdatedBy: null,
                project: {
                    uuid: value.project_uuid,
                    name: value.project_name,
                },
                organization: {
                    uuid: value.organization_uuid,
                    name: value.organization_name,
                },
                space: {
                    uuid: value.space_uuid,
                    name: value.space_name,
                },
                pinnedList: value.pinned_list_uuid
                    ? {
                          uuid: value.pinned_list_uuid,
                          order: value.metadata.pinnedListOrder,
                      }
                    : null,
                views: value.views,
                firstViewedAt: value.first_viewed_at,
                parentSpaceUuid: value.metadata.parentSpaceUuid,
                path: value.metadata.path,
                isPrivate: value.metadata.isPrivate,
                inheritParentPermissions:
                    value.metadata.inheritParentPermissions,
                access: value.metadata.access,
                dashboardCount: value.metadata.dashboardCount,
                chartCount: value.metadata.chartCount,
            };
        },
    };
