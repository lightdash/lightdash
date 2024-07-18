import { ContentType, DashboardContent } from '@lightdash/common';
import { Knex } from 'knex';
import { DashboardsTableName } from '../../../database/entities/dashboards';
import { OrganizationTableName } from '../../../database/entities/organizations';
import { PinnedDashboardTableName } from '../../../database/entities/pinnedList';
import { ProjectTableName } from '../../../database/entities/projects';
import { SpaceTableName } from '../../../database/entities/spaces';
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
                    knex.raw(`NULL as created_by_user_uuid`),
                    knex.raw(`NULL as created_by_user_first_name`),
                    knex.raw(`NULL as created_by_user_last_name`),
                    knex.raw(`NULL as last_updated_at`),
                    knex.raw(`NULL as last_updated_by_user_uuid`),
                    knex.raw(`NULL as last_updated_by_user_first_name`),
                    knex.raw(`NULL as last_updated_by_user_last_name`),
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
