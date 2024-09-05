import { ContentType, DashboardContent } from '@lightdash/common';
import { Knex } from 'knex';
import {
    DashboardsTableName,
    DashboardVersionsTableName,
} from '../../../database/entities/dashboards';
import { OrganizationTableName } from '../../../database/entities/organizations';
import { PinnedDashboardTableName } from '../../../database/entities/pinnedList';
import { ProjectTableName } from '../../../database/entities/projects';
import { SpaceTableName } from '../../../database/entities/spaces';
import { UserTableName } from '../../../database/entities/users';
import {
    ContentConfiguration,
    ContentFilters,
    SummaryContentRow,
} from '../ContentModelTypes';

export const dashboardContentConfiguration: ContentConfiguration<SummaryContentRow> =
    {
        shouldQueryBeIncluded: (filters: ContentFilters) =>
            !filters.contentTypes ||
            filters.contentTypes?.includes(ContentType.DASHBOARD),
        getSummaryQuery: (
            knex: Knex,
            filters: ContentFilters,
        ): Knex.QueryBuilder =>
            knex
                .from(DashboardsTableName)
                .innerJoin(
                    SpaceTableName,
                    `${SpaceTableName}.space_id`,
                    `${DashboardsTableName}.space_id`,
                )
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
                    PinnedDashboardTableName,
                    `${PinnedDashboardTableName}.dashboard_uuid`,
                    `${DashboardsTableName}.dashboard_uuid`,
                )
                .leftJoin(
                    `${DashboardVersionsTableName} as first_version`,
                    `first_version.dashboard_id`,
                    `${DashboardsTableName}.dashboard_id`,
                )
                .leftJoin(
                    `${DashboardVersionsTableName} as last_version`,
                    `last_version.dashboard_id`,
                    `${DashboardsTableName}.dashboard_id`,
                )
                .leftJoin(
                    `${UserTableName} as created_by_user`,
                    `created_by_user.user_uuid`,
                    `first_version.updated_by_user_uuid`,
                )
                .leftJoin(
                    `${UserTableName} as updated_by_user`,
                    `updated_by_user.user_uuid`,
                    `last_version.updated_by_user_uuid`,
                )
                .select<SummaryContentRow[]>([
                    knex.raw(`'dashboard' as content_type`),
                    knex.raw(
                        `${DashboardsTableName}.dashboard_uuid::text as uuid`,
                    ),
                    `${DashboardsTableName}.name`,
                    `${DashboardsTableName}.description`,
                    `${DashboardsTableName}.slug`,
                    `${SpaceTableName}.space_uuid`,
                    `${SpaceTableName}.name as space_name`,
                    `${ProjectTableName}.project_uuid`,
                    `${ProjectTableName}.name as project_name`,
                    `${OrganizationTableName}.organization_uuid`,
                    `${OrganizationTableName}.organization_name`,
                    `${PinnedDashboardTableName}.pinned_list_uuid as pinned_list_uuid`, // TODO: Implement pinned lists
                    knex.raw(
                        `${DashboardsTableName}.created_at::timestamp as created_at`,
                    ),
                    `created_by_user.user_uuid             as created_by_user_uuid`,
                    `created_by_user.first_name            as created_by_user_first_name`,
                    `created_by_user.last_name             as created_by_user_last_name`,
                    `last_version.created_at               as last_updated_at`,
                    `updated_by_user.user_uuid             as last_updated_by_user_uuid`,
                    `updated_by_user.first_name            as last_updated_by_user_first_name`,
                    `updated_by_user.last_name             as last_updated_by_user_last_name`,

                    `${DashboardsTableName}.views_count as views`,
                    knex.raw(
                        `${DashboardsTableName}.first_viewed_at::timestamp as first_viewed_at`,
                    ),
                    knex.raw(`json_build_object() as metadata`),
                ])
                .where((builder) => {
                    if (filters.projectUuids) {
                        void builder.whereIn(
                            `${ProjectTableName}.project_uuid`,
                            filters.projectUuids,
                        );
                    }

                    if (filters.spaceUuids) {
                        void builder.whereIn(
                            `${SpaceTableName}.space_uuid`,
                            filters.spaceUuids,
                        );
                    }
                    void builder.where(
                        `last_version.dashboard_version_id`,
                        knex.raw(`(select dashboard_version_id
                                           from dashboard_versions
                                           where dashboard_id = dashboards.dashboard_id
                                           order by dashboard_versions.created_at desc
                                           limit 1)`),
                    );
                    void builder.where(
                        `first_version.dashboard_version_id`,
                        knex.raw(`(select dashboard_version_id
                                            from dashboard_versions
                                            where dashboard_id = dashboards.dashboard_id
                                            order by dashboard_versions.created_at asc
                                            limit 1)`),
                    );
                }),
        shouldRowBeConverted: (value): value is SummaryContentRow =>
            value.content_type === ContentType.DASHBOARD,
        convertSummaryRow: (value): DashboardContent => {
            if (!dashboardContentConfiguration.shouldRowBeConverted(value)) {
                throw new Error('Invalid content row');
            }
            return {
                contentType: ContentType.DASHBOARD,
                uuid: value.uuid,
                slug: value.slug,
                name: value.name,
                description: value.description,
                createdAt: value.created_at,
                createdBy: value.created_by_user_uuid
                    ? {
                          uuid: value.created_by_user_uuid,
                          firstName: value.created_by_user_first_name ?? '',
                          lastName: value.created_by_user_last_name ?? '',
                      }
                    : null,
                lastUpdatedAt: value.last_updated_at,
                lastUpdatedBy: value.last_updated_by_user_uuid
                    ? {
                          uuid: value.last_updated_by_user_uuid,
                          firstName:
                              value.last_updated_by_user_first_name ?? '',
                          lastName: value.last_updated_by_user_last_name ?? '',
                      }
                    : null,
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
                      }
                    : null,
                views: value.views,
                firstViewedAt: value.first_viewed_at,
            };
        },
    };
