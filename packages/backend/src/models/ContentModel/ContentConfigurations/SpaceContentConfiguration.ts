import { ContentType, SpaceContent } from '@lightdash/common';
import { Knex } from 'knex';
import { DashboardsTableName } from '../../../database/entities/dashboards';
import { OrganizationTableName } from '../../../database/entities/organizations';
import { PinnedSpaceTableName } from '../../../database/entities/pinnedList';
import { ProjectTableName } from '../../../database/entities/projects';
import { SavedChartsTableName } from '../../../database/entities/savedCharts';
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
    parentSpaceUuid: string | null;
    path: string;
    access: string[];
    isPrivate: boolean;
    pinnedListOrder: number;
}>;

export const spaceContentConfiguration: ContentConfiguration<SpaceContentRow> =
    {
        shouldQueryBeIncluded: (filters: ContentFilters) => {
            if (filters.contentTypes?.includes(ContentType.SPACE)) {
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
                    knex.raw(
                        `json_build_object(
                                    'chartCount', (
                                        SELECT count(DISTINCT ${SavedChartsTableName}.saved_query_id)
                                        FROM ${SavedChartsTableName}
                                        WHERE ${SavedChartsTableName}.space_id = ${SpaceTableName}.space_id
                                    ),
                                    'dashboardCount', (
                                        SELECT count(DISTINCT ${DashboardsTableName}.dashboard_id)
                                        FROM ${DashboardsTableName}
                                        WHERE ${DashboardsTableName}.space_id = ${SpaceTableName}.space_id
                                    ),
                                    'parentSpaceUuid', ${SpaceTableName}.parent_space_uuid,
                                    'path', ${SpaceTableName}.path,
                                    'access', (${SpaceModel.getRootSpaceAccessQuery(
                                        'shared_with',
                                    )}),
                                    'isPrivate', (${SpaceModel.getRootSpaceIsPrivateQuery()}),
                                    'pinnedListOrder', ${PinnedSpaceTableName}.order
                                ) as metadata`,
                    ),
                ])
                .where((builder) => {
                    if (filters.projectUuids) {
                        void builder.whereIn(
                            `${ProjectTableName}.project_uuid`,
                            filters.projectUuids,
                        );
                    }

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

                    if (filters.search) {
                        void builder.whereRaw(
                            `LOWER(${SpaceTableName}.name) LIKE ?`,
                            [`%${filters.search.toLowerCase()}%`],
                        );
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
                access: value.metadata.access,
                dashboardCount: value.metadata.dashboardCount,
                chartCount: value.metadata.chartCount,
            };
        },
    };
