import {
    ChartContent,
    ChartKind,
    ChartSourceType,
    ContentType,
} from '@lightdash/common';
import { Knex } from 'knex';
import { DashboardsTableName } from '../../../database/entities/dashboards';
import { OrganizationTableName } from '../../../database/entities/organizations';
import { ProjectTableName } from '../../../database/entities/projects';
import { SavedSemanticLayerTableName } from '../../../database/entities/savedSemanticLayer';
import { SpaceTableName } from '../../../database/entities/spaces';
import { UserTableName } from '../../../database/entities/users';
import {
    ContentConfiguration,
    ContentFilters,
    SummaryContentRow,
} from '../ContentModelTypes';

type SelectSavedSemanticLayerChart = SummaryContentRow<{
    source: ChartSourceType.SEMANTIC_LAYER;
    chart_kind: ChartKind;
    dashboard_uuid: string | null;
    dashboard_name: string | null;
}>;

export const semanticLayerChartContentConfiguration: ContentConfiguration<SelectSavedSemanticLayerChart> =
    {
        shouldQueryBeIncluded: (filters: ContentFilters) => {
            const contentTypeMatch =
                !filters.contentTypes ||
                filters.contentTypes?.includes(ContentType.CHART);
            const sourceMatch =
                !filters.chart?.sources ||
                filters.chart.sources?.includes(ChartSourceType.SEMANTIC_LAYER);
            return contentTypeMatch && sourceMatch;
        },
        getSummaryQuery: (
            knex: Knex,
            filters: ContentFilters,
        ): Knex.QueryBuilder =>
            knex
                .from(SavedSemanticLayerTableName)
                .leftJoin(
                    DashboardsTableName,
                    `${DashboardsTableName}.dashboard_uuid`,
                    `${SavedSemanticLayerTableName}.dashboard_uuid`,
                )
                .innerJoin(
                    SpaceTableName,
                    `${SpaceTableName}.space_uuid`,
                    `${SavedSemanticLayerTableName}.space_uuid`,
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
                    `${UserTableName} as createdByUser`,
                    `${SavedSemanticLayerTableName}.created_by_user_uuid`,
                    `createdByUser.user_uuid`,
                )
                .leftJoin(
                    `${UserTableName} as updatedByUser`,
                    `${SavedSemanticLayerTableName}.last_version_updated_by_user_uuid`,
                    `updatedByUser.user_uuid`,
                )
                .select<SelectSavedSemanticLayerChart[]>([
                    knex.raw(`'${ContentType.CHART}' as content_type`),
                    knex.raw(
                        `${SavedSemanticLayerTableName}.saved_semantic_layer_uuid::text as uuid`,
                    ),
                    `${SavedSemanticLayerTableName}.name`,
                    `${SavedSemanticLayerTableName}.description`,
                    `${SavedSemanticLayerTableName}.slug`,
                    `${SpaceTableName}.space_uuid`,
                    `${SpaceTableName}.name as space_name`,
                    `${ProjectTableName}.project_uuid`,
                    `${ProjectTableName}.name as project_name`,
                    `${OrganizationTableName}.organization_uuid`,
                    `${OrganizationTableName}.organization_name`,
                    knex.raw(`NULL as pinned_list_uuid`), // TODO: Implement pinned lists
                    knex.raw(
                        `${SavedSemanticLayerTableName}.created_at::timestamp as created_at`,
                    ),
                    `createdByUser.user_uuid as created_by_user_uuid`,
                    `createdByUser.first_name as created_by_user_first_name`,
                    `createdByUser.last_name as created_by_user_last_name`,
                    knex.raw(
                        `${SavedSemanticLayerTableName}.last_version_updated_at::timestamp as last_updated_at`,
                    ),
                    `updatedByUser.user_uuid as last_updated_by_user_uuid`,
                    `updatedByUser.first_name as last_updated_by_user_first_name`,
                    `updatedByUser.last_name as last_updated_by_user_last_name`,
                    `${SavedSemanticLayerTableName}.views_count as views`,
                    knex.raw(
                        `${SavedSemanticLayerTableName}.first_viewed_at::timestamp as first_viewed_at`,
                    ),
                    knex.raw(`json_build_object(
                    'source','${ChartSourceType.SEMANTIC_LAYER}',
                    'chart_kind', ${SavedSemanticLayerTableName}.last_version_chart_kind,
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
        shouldRowBeConverted: (
            value,
        ): value is SelectSavedSemanticLayerChart => {
            const contentTypeMatch = value.content_type === ContentType.CHART;
            const sourceMatch =
                value.metadata.source === ChartSourceType.SEMANTIC_LAYER;
            return contentTypeMatch && sourceMatch;
        },
        convertSummaryRow: (value): ChartContent => {
            if (
                !semanticLayerChartContentConfiguration.shouldRowBeConverted(
                    value,
                )
            ) {
                throw new Error('Invalid content row');
            }
            return {
                contentType: ContentType.CHART,
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
                views: value.views,
                firstViewedAt: value.first_viewed_at,
            };
        },
    };
