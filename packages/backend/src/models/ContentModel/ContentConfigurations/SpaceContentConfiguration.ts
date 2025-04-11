import { ContentType, SpaceContent } from '@lightdash/common';
import { Knex } from 'knex';
import { OrganizationTableName } from '../../../database/entities/organizations';
import { PinnedSpaceTableName } from '../../../database/entities/pinnedList';
import { ProjectTableName } from '../../../database/entities/projects';
import { SpaceTableName } from '../../../database/entities/spaces';
import { UserTableName } from '../../../database/entities/users';
import {
    ContentConfiguration,
    ContentFilters,
    SummaryContentRow,
} from '../ContentModelTypes';

export const spaceContentConfiguration: ContentConfiguration<SummaryContentRow> =
    {
        shouldQueryBeIncluded: (filters: ContentFilters) =>
            !filters.contentTypes ||
            filters.contentTypes?.includes(ContentType.SPACE),
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
                .select<SummaryContentRow[]>([
                    knex.raw(`'space' as content_type`),
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
                        `json_build_object('parentSpaceUuid', ${SpaceTableName}.parent_space_uuid) as metadata`,
                    ),
                ])
                .where((builder) => {
                    if (filters.projectUuids) {
                        void builder.whereIn(
                            `${ProjectTableName}.project_uuid`,
                            filters.projectUuids,
                        );
                    }

                    // Get direct children of the provided spaces
                    if (filters.spaceUuids) {
                        void builder.whereIn(
                            `${SpaceTableName}.parent_space_uuid`,
                            filters.spaceUuids,
                        );
                    }

                    // We're removing this filter from the SQL query - we'll filter in the service layer
                    // if (filters.parentSpaceUuid) {
                    //     void builder.where(
                    //         `${SpaceTableName}.parent_space_uuid`,
                    //         filters.parentSpaceUuid,
                    //     );
                    // }

                    if (filters.search) {
                        void builder.whereRaw(
                            `LOWER(${SpaceTableName}.name) LIKE ?`,
                            [`%${filters.search.toLowerCase()}%`],
                        );
                    }
                }),
        shouldRowBeConverted: (value): value is SummaryContentRow =>
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
                      }
                    : null,
                views: value.views,
                firstViewedAt: value.first_viewed_at,
                parentSpaceUuid:
                    (value.metadata as Record<string, string | null>)
                        ?.parentSpaceUuid || null,
                isPrivate: false,
                access: [],
                accessListLength: 0,
                dashboardCount: 0,
                chartCount: 0,
                projectUuid: value.project_uuid,
                organizationUuid: value.organization_uuid,
                pinnedListUuid: value.pinned_list_uuid,
                pinnedListOrder: null,
            };
        },
    };
