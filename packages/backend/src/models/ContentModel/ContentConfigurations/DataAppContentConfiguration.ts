import { ContentType, DataAppContent } from '@lightdash/common';
import { Knex } from 'knex';
import {
    AppsTableName,
    AppVersionsTableName,
} from '../../../database/entities/apps';
import { OrganizationTableName } from '../../../database/entities/organizations';
import { ProjectTableName } from '../../../database/entities/projects';
import { SpaceTableName } from '../../../database/entities/spaces';
import { UserTableName } from '../../../database/entities/users';
import {
    ContentConfiguration,
    ContentFilters,
    ContentTypePriority,
    SummaryContentRow,
} from '../ContentModelTypes';

export const dataAppContentConfiguration: ContentConfiguration<SummaryContentRow> =
    {
        shouldQueryBeIncluded: (filters: ContentFilters) => {
            // Apps don't participate in the soft-delete / restore flow yet,
            // so exclude them from the deleted-content listing.
            if (filters.deleted) return false;
            return (
                !filters.contentTypes ||
                filters.contentTypes?.includes(ContentType.DATA_APP)
            );
        },
        getSummaryQuery: (
            knex: Knex,
            filters: ContentFilters,
        ): Knex.QueryBuilder =>
            knex
                .from(AppsTableName)
                .where((deletedFilter) => {
                    if (filters.deleted) {
                        void deletedFilter.whereNotNull(
                            `${AppsTableName}.deleted_at`,
                        );
                        if (filters.deletedByUserUuids) {
                            void deletedFilter.whereIn(
                                `${AppsTableName}.deleted_by_user_uuid`,
                                filters.deletedByUserUuids,
                            );
                        }
                    } else {
                        void deletedFilter.whereNull(
                            `${AppsTableName}.deleted_at`,
                        );
                    }
                })
                // Apps without a space are personal drafts — excluded from
                // space-based content listings. They surface only in /user/apps.
                .whereNotNull(`${AppsTableName}.space_uuid`)
                .innerJoin(
                    SpaceTableName,
                    `${SpaceTableName}.space_uuid`,
                    `${AppsTableName}.space_uuid`,
                )
                .innerJoin(
                    ProjectTableName,
                    `${ProjectTableName}.project_uuid`,
                    `${AppsTableName}.project_uuid`,
                )
                .innerJoin(
                    OrganizationTableName,
                    `${OrganizationTableName}.organization_id`,
                    `${ProjectTableName}.organization_id`,
                )
                .leftJoin(
                    `${UserTableName} as created_by_user`,
                    `created_by_user.user_uuid`,
                    `${AppsTableName}.created_by_user_uuid`,
                )
                .leftJoin(
                    `${AppVersionsTableName} as latest_version`,
                    `latest_version.app_id`,
                    `${AppsTableName}.app_id`,
                )
                .leftJoin(
                    `${UserTableName} as last_updated_by_user`,
                    `last_updated_by_user.user_uuid`,
                    `latest_version.created_by_user_uuid`,
                )
                .select<SummaryContentRow[]>([
                    knex.raw(`'${ContentType.DATA_APP}' as content_type`),
                    knex.raw(
                        `${ContentTypePriority.DATA_APP} as content_type_rank`,
                    ),
                    knex.raw(`${AppsTableName}.app_id::text as uuid`),
                    `${AppsTableName}.name`,
                    `${AppsTableName}.description`,
                    // Apps don't have a real slug column yet — synthesize one
                    // for the content listing URL shape. Uniqueness isn't
                    // relied upon since we link by UUID.
                    knex.raw(
                        `'data-app-' || ${AppsTableName}.app_id::text as slug`,
                    ),
                    `${SpaceTableName}.space_uuid`,
                    `${SpaceTableName}.name as space_name`,
                    `${ProjectTableName}.project_uuid`,
                    `${ProjectTableName}.name as project_name`,
                    `${OrganizationTableName}.organization_uuid`,
                    `${OrganizationTableName}.organization_name`,
                    knex.raw(`NULL::uuid as pinned_list_uuid`),
                    knex.raw(
                        `${AppsTableName}.created_at::timestamp as created_at`,
                    ),
                    `created_by_user.user_uuid             as created_by_user_uuid`,
                    `created_by_user.first_name            as created_by_user_first_name`,
                    `created_by_user.last_name             as created_by_user_last_name`,
                    `latest_version.created_at             as last_updated_at`,
                    `last_updated_by_user.user_uuid        as last_updated_by_user_uuid`,
                    `last_updated_by_user.first_name       as last_updated_by_user_first_name`,
                    `last_updated_by_user.last_name        as last_updated_by_user_last_name`,

                    knex.raw(`0 as views`),
                    knex.raw(`NULL::timestamp as first_viewed_at`),
                    knex.raw(
                        `${AppsTableName}.deleted_at::timestamp as deleted_at`,
                    ),
                    `${AppsTableName}.deleted_by_user_uuid as deleted_by_user_uuid`,
                    knex.raw(
                        `(SELECT first_name FROM users WHERE user_uuid = ${AppsTableName}.deleted_by_user_uuid) as deleted_by_user_first_name`,
                    ),
                    knex.raw(
                        `(SELECT last_name FROM users WHERE user_uuid = ${AppsTableName}.deleted_by_user_uuid) as deleted_by_user_last_name`,
                    ),
                    knex.raw(
                        `json_build_object(
                            'latestVersionNumber', latest_version.version,
                            'latestVersionStatus', latest_version.status
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

                    if (filters.spaceUuids) {
                        void builder.whereIn(
                            `${SpaceTableName}.space_uuid`,
                            filters.spaceUuids,
                        );
                    }

                    // Pick the latest version per app — every app has at
                    // least one version (created atomically with the app).
                    void builder.where(
                        `latest_version.app_version_id`,
                        knex.raw(
                            `(select app_version_id
                                from ${AppVersionsTableName}
                                where app_id = ${AppsTableName}.app_id
                                order by version desc
                                limit 1)`,
                        ),
                    );

                    if (filters.search) {
                        void builder.whereRaw(
                            `LOWER(${AppsTableName}.name) LIKE ?`,
                            [`%${filters.search.toLowerCase()}%`],
                        );
                    }

                    // Exclude apps in deleted spaces
                    void builder.whereNull(`${SpaceTableName}.deleted_at`);
                }),
        shouldRowBeConverted: (value): value is SummaryContentRow =>
            value.content_type === ContentType.DATA_APP,
        convertSummaryRow: (value): DataAppContent => {
            if (!dataAppContentConfiguration.shouldRowBeConverted(value)) {
                throw new Error('Invalid content row');
            }
            return {
                contentType: ContentType.DATA_APP,
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
                pinnedList: null,
                views: value.views,
                firstViewedAt: value.first_viewed_at,
                verification: null,
                latestVersionNumber:
                    (value.metadata.latestVersionNumber as number | null) ??
                    null,
                latestVersionStatus:
                    (value.metadata.latestVersionStatus as
                        | DataAppContent['latestVersionStatus']
                        | null) ?? null,
            };
        },
    };
