import { ChartContent, ChartKind } from '@lightdash/common';
import { Knex } from 'knex';
import { DashboardsTableName } from '../../../database/entities/dashboards';
import { OrganizationTableName } from '../../../database/entities/organizations';
import {
    PinnedChartTableName,
    PinnedListTableName,
} from '../../../database/entities/pinnedList';
import { ProjectTableName } from '../../../database/entities/projects';
import { SavedChartsTableName } from '../../../database/entities/savedCharts';
import { SpaceTableName } from '../../../database/entities/spaces';
import { UserTableName } from '../../../database/entities/users';
import {
    ContentConfiguration,
    ContentFilters,
    SummaryContentRow,
} from '../ContentModelTypes';

type SelectSavedChart = SummaryContentRow<{
    source: 'dbt_explore';
    chart_kind: ChartKind;
    dashboard_uuid: string | null;
    dashboard_name: string | null;
}>;

export const dbtExploreChartContentConfiguration: ContentConfiguration<SelectSavedChart> =
    {
        shouldQueryBeIncluded: (filters: ContentFilters) => {
            const resourceTypeMatch =
                !filters.resourceTypes ||
                filters.resourceTypes?.includes('chart');
            const sourceMatch =
                !filters.chart?.sources ||
                filters.chart.sources?.includes('dbt_explore');
            return resourceTypeMatch && sourceMatch;
        },
        getSummaryQuery: (
            knex: Knex,
            filters: ContentFilters,
        ): Knex.QueryBuilder =>
            knex
                .from(SavedChartsTableName)
                .leftJoin(
                    DashboardsTableName,
                    `${DashboardsTableName}.dashboard_uuid`,
                    `${SavedChartsTableName}.dashboard_uuid`,
                )
                .innerJoin(
                    SpaceTableName,
                    `${SpaceTableName}.space_id`,
                    `${SavedChartsTableName}.space_id`,
                )
                .innerJoin(
                    ProjectTableName,
                    `${SpaceTableName}.project_id`,
                    `${ProjectTableName}.project_id`,
                )
                .leftJoin(
                    OrganizationTableName,
                    'organizations.organization_id',
                    'projects.organization_id',
                )
                .leftJoin(
                    PinnedChartTableName,
                    `${PinnedChartTableName}.saved_chart_uuid`,
                    `${SavedChartsTableName}.saved_query_uuid`,
                )
                .leftJoin(
                    PinnedListTableName,
                    `${PinnedListTableName}.pinned_list_uuid`,
                    `${PinnedChartTableName}.pinned_list_uuid`,
                )
                .leftJoin(
                    `${UserTableName} as updatedByUser`,
                    `${SavedChartsTableName}.last_version_updated_by_user_uuid`,
                    `updatedByUser.user_uuid`,
                )
                .select<SelectSavedChart[]>([
                    knex.raw(`'chart' as resource_type`),
                    knex.raw(
                        `${SavedChartsTableName}.saved_query_uuid::text as uuid`,
                    ),
                    `${SavedChartsTableName}.name`,
                    `${SavedChartsTableName}.description`,
                    `${SavedChartsTableName}.slug`,
                    `${SpaceTableName}.space_uuid`,
                    `${SpaceTableName}.name as space_name`,
                    `${ProjectTableName}.project_uuid`,
                    `${ProjectTableName}.name as project_name`,
                    `${OrganizationTableName}.organization_uuid`,
                    `${OrganizationTableName}.organization_name`,
                    `${PinnedListTableName}.pinned_list_uuid`,
                    knex.raw(
                        `${SavedChartsTableName}.created_at::timestamp as created_at`,
                    ),
                    knex.raw(`NULL as created_by_user_uuid`), // TODO: Implement create by user
                    knex.raw(`NULL as created_by_user_first_name`),
                    knex.raw(`NULL as created_by_user_last_name`),
                    knex.raw(
                        `${SavedChartsTableName}.last_version_updated_at::timestamp as last_updated_at`,
                    ),
                    `updatedByUser.user_uuid as last_updated_by_user_uuid`,
                    `updatedByUser.first_name as last_updated_by_user_first_name`,
                    `updatedByUser.last_name as last_updated_by_user_last_name`,
                    knex.raw(`json_build_object(
                    'source','dbt_explore',
                    'chart_kind', ${SavedChartsTableName}.last_version_chart_kind,
                    'dashboard_uuid', ${DashboardsTableName}.dashboard_uuid,
                    'dashboard_name', ${DashboardsTableName}.name
                 ) as metadata`),
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
        shouldRowBeConverted: (value): value is SelectSavedChart => {
            const resourceTypeMatch = value.resource_type === 'chart';
            const sourceMatch = value.metadata.source === 'dbt_explore';
            return resourceTypeMatch && sourceMatch;
        },
        convertSummaryRow: (value): ChartContent => {
            if (
                !dbtExploreChartContentConfiguration.shouldRowBeConverted(value)
            ) {
                throw new Error('Invalid content row');
            }
            return {
                resourceType: 'chart',
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
                source: value.metadata.source,
                chartKind: value.metadata.chart_kind,
                space: {
                    uuid: value.space_uuid,
                    name: value.space_name,
                },
                dashboard: value.metadata.dashboard_uuid
                    ? {
                          uuid: value.metadata.dashboard_uuid,
                          name: value.metadata.dashboard_name ?? '',
                      }
                    : null,
                pinnedList: value.pinned_list_uuid
                    ? {
                          uuid: value.pinned_list_uuid,
                      }
                    : null,
            };
        },
    };
