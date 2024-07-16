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
import { SavedSqlTableName } from '../../../database/entities/savedSql';
import { SpaceTableName } from '../../../database/entities/spaces';
import { UserTableName } from '../../../database/entities/users';
import {
    ContentConfiguration,
    ContentFilters,
    SummaryContentRow,
} from '../ContentModelTypes';

type SelectSavedSql = SummaryContentRow<{
    source: ChartSourceType.SQL;
    chart_kind: ChartKind;
    dashboard_uuid: string | null;
    dashboard_name: string | null;
}>;

export const sqlChartContentConfiguration: ContentConfiguration<SelectSavedSql> =
    {
        shouldQueryBeIncluded: (filters: ContentFilters) => {
            const contentTypeMatch =
                !filters.contentTypes ||
                filters.contentTypes?.includes(ContentType.CHART);
            const sourceMatch =
                !filters.chart?.sources ||
                filters.chart.sources?.includes(ChartSourceType.SQL);
            return contentTypeMatch && sourceMatch;
        },
        getSummaryQuery: (
            knex: Knex,
            filters: ContentFilters,
        ): Knex.QueryBuilder =>
            knex
                .from(SavedSqlTableName)
                .leftJoin(
                    DashboardsTableName,
                    `${DashboardsTableName}.dashboard_uuid`,
                    `${SavedSqlTableName}.dashboard_uuid`,
                )
                .innerJoin(
                    SpaceTableName,
                    `${SpaceTableName}.space_uuid`,
                    `${SavedSqlTableName}.space_uuid`,
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
                    `${SavedSqlTableName}.created_by_user_uuid`,
                    `createdByUser.user_uuid`,
                )
                .leftJoin(
                    `${UserTableName} as updatedByUser`,
                    `${SavedSqlTableName}.last_version_updated_by_user_uuid`,
                    `updatedByUser.user_uuid`,
                )
                .select<SelectSavedSql[]>([
                    knex.raw(`'${ContentType.CHART}' as content_type`),
                    knex.raw(
                        `${SavedSqlTableName}.saved_sql_uuid::text as uuid`,
                    ),
                    `${SavedSqlTableName}.name`,
                    `${SavedSqlTableName}.description`,
                    `${SavedSqlTableName}.slug`,
                    `${SpaceTableName}.space_uuid`,
                    `${SpaceTableName}.name as space_name`,
                    `${ProjectTableName}.project_uuid`,
                    `${ProjectTableName}.name as project_name`,
                    `${OrganizationTableName}.organization_uuid`,
                    `${OrganizationTableName}.organization_name`,
                    knex.raw(`NULL as pinned_list_uuid`), // TODO: Implement pinned lists
                    knex.raw(
                        `${SavedSqlTableName}.created_at::timestamp as created_at`,
                    ),
                    `createdByUser.user_uuid as created_by_user_uuid`,
                    `createdByUser.first_name as created_by_user_first_name`,
                    `createdByUser.last_name as created_by_user_last_name`,
                    knex.raw(
                        `${SavedSqlTableName}.last_version_updated_at::timestamp as last_updated_at`,
                    ),
                    `updatedByUser.user_uuid as last_updated_by_user_uuid`,
                    `updatedByUser.first_name as last_updated_by_user_first_name`,
                    `updatedByUser.last_name as last_updated_by_user_last_name`,
                    knex.raw(`json_build_object(
                    'source','${ChartSourceType.SQL}',
                    'chart_kind', ${SavedSqlTableName}.last_version_chart_kind, 
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
        shouldRowBeConverted: (value): value is SelectSavedSql => {
            const contentTypeMatch = value.content_type === ContentType.CHART;
            const sourceMatch = value.metadata.source === ChartSourceType.SQL;
            return contentTypeMatch && sourceMatch;
        },
        convertSummaryRow: (value): ChartContent => {
            if (!sqlChartContentConfiguration.shouldRowBeConverted(value)) {
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
            };
        },
    };
