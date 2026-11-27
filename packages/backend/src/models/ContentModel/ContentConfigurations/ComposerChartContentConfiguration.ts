import {
    ChartKind,
    ComposerChartContent,
    ContentType,
    getChartKind,
    type ChartConfig,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    ComposerChartsTableName,
    ComposerChartVersionsTableName,
} from '../../../database/entities/composerCharts';
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
import { applyContentNameSearch } from '../ContentSearchUtils';

type ComposerChartContentRow = SummaryContentRow<{
    chart_config: ChartConfig | null;
}>;

// A bad stored config costs its row the icon, never the whole listing.
const toChartKind = (chartConfig: ChartConfig | null): ChartKind => {
    try {
        return (
            (chartConfig &&
                getChartKind(chartConfig.type, chartConfig.config)) ??
            ChartKind.VERTICAL_BAR
        );
    } catch {
        return ChartKind.VERTICAL_BAR;
    }
};

export const composerChartContentConfiguration: ContentConfiguration<ComposerChartContentRow> =
    {
        // Opt-in by type, like spaces, so callers that list "everything" never meet a type they cannot handle.
        shouldQueryBeIncluded: (filters: ContentFilters) =>
            filters.composerCharts !== undefined &&
            !filters.deleted &&
            !filters.sharedWithMe &&
            !filters.ownerUserUuids &&
            !filters.chart?.sources &&
            filters.dataAppVizsFilter !== 'only' &&
            !!filters.contentTypes?.includes(ContentType.COMPOSER_CHART),
        getSummaryQuery: (
            knex: Knex,
            filters: ContentFilters,
        ): Knex.QueryBuilder =>
            knex
                .from(ComposerChartsTableName)
                .joinRaw(
                    `CROSS JOIN LATERAL (
                        SELECT chart, created_at, created_by_user_uuid
                        FROM ${ComposerChartVersionsTableName}
                        WHERE composer_chart_uuid = ${ComposerChartsTableName}.composer_chart_uuid
                        ORDER BY created_at DESC
                        LIMIT 1
                    ) AS latest_version`,
                )
                .innerJoin(
                    SpaceTableName,
                    `${SpaceTableName}.space_uuid`,
                    `${ComposerChartsTableName}.space_uuid`,
                )
                .innerJoin(
                    ProjectTableName,
                    `${ProjectTableName}.project_id`,
                    `${SpaceTableName}.project_id`,
                )
                .innerJoin(
                    OrganizationTableName,
                    `${OrganizationTableName}.organization_id`,
                    `${ProjectTableName}.organization_id`,
                )
                .leftJoin(
                    `${UserTableName} as created_by_user`,
                    'created_by_user.user_uuid',
                    `${ComposerChartsTableName}.created_by_user_uuid`,
                )
                .leftJoin(
                    `${UserTableName} as updated_by_user`,
                    'updated_by_user.user_uuid',
                    'latest_version.created_by_user_uuid',
                )
                .select<ComposerChartContentRow[]>([
                    knex.raw('? as content_type', [ContentType.COMPOSER_CHART]),
                    knex.raw('?::integer as content_type_rank', [
                        ContentTypePriority.CHART,
                    ]),
                    knex.raw(
                        `${ComposerChartsTableName}.composer_chart_uuid::text as uuid`,
                    ),
                    `${ComposerChartsTableName}.name`,
                    `${ComposerChartsTableName}.description`,
                    `${ComposerChartsTableName}.slug`,
                    `${SpaceTableName}.space_uuid`,
                    `${SpaceTableName}.name as space_name`,
                    `${ProjectTableName}.project_uuid`,
                    `${ProjectTableName}.name as project_name`,
                    `${OrganizationTableName}.organization_uuid`,
                    `${OrganizationTableName}.organization_name`,
                    knex.raw('null::uuid as pinned_list_uuid'),
                    knex.raw(
                        `${ComposerChartsTableName}.created_at::timestamp as created_at`,
                    ),
                    'created_by_user.user_uuid as created_by_user_uuid',
                    'created_by_user.first_name as created_by_user_first_name',
                    'created_by_user.last_name as created_by_user_last_name',
                    knex.raw(
                        'latest_version.created_at::timestamp as last_updated_at',
                    ),
                    'updated_by_user.user_uuid as last_updated_by_user_uuid',
                    'updated_by_user.first_name as last_updated_by_user_first_name',
                    'updated_by_user.last_name as last_updated_by_user_last_name',
                    knex.raw('0::integer as views'),
                    knex.raw('null::timestamp as first_viewed_at'),
                    knex.raw('null::timestamp as last_viewed_at'),
                    knex.raw('null::timestamp as deleted_at'),
                    knex.raw('null::uuid as deleted_by_user_uuid'),
                    knex.raw('null as deleted_by_user_first_name'),
                    knex.raw('null as deleted_by_user_last_name'),
                    knex.raw('null::timestamp as verified_at'),
                    knex.raw('null::uuid as verified_by_user_uuid'),
                    knex.raw('null as verified_by_user_first_name'),
                    knex.raw('null as verified_by_user_last_name'),
                    knex.raw('null::uuid as owner_user_uuid'),
                    knex.raw('null as owner_user_first_name'),
                    knex.raw('null as owner_user_last_name'),
                    knex.raw('null as owner_user_email'),
                    knex.raw(
                        `json_build_object('chart_config', latest_version.chart -> 'chartConfig') as metadata`,
                    ),
                ])
                .whereNull(`${ComposerChartsTableName}.dashboard_uuid`)
                .whereNull(`${ComposerChartsTableName}.deleted_at`)
                .whereNull(`${SpaceTableName}.deleted_at`)
                .whereIn(
                    `${SpaceTableName}.space_uuid`,
                    filters.composerCharts?.allowedSpaceUuids ?? [],
                )
                .where((builder) => {
                    if (filters.projectUuids) {
                        void builder.whereIn(
                            `${ProjectTableName}.project_uuid`,
                            filters.projectUuids,
                        );
                    }
                    if (filters.uuids) {
                        void builder.whereIn(
                            `${ComposerChartsTableName}.composer_chart_uuid`,
                            filters.uuids,
                        );
                    }
                    if (filters.spaceUuids) {
                        void builder.whereIn(
                            `${SpaceTableName}.space_uuid`,
                            filters.spaceUuids,
                        );
                    }
                    if (filters.search) {
                        applyContentNameSearch(
                            builder,
                            `${ComposerChartsTableName}.name`,
                            filters.search,
                        );
                    }
                }),
        shouldRowBeConverted: (value): value is ComposerChartContentRow =>
            value.content_type === ContentType.COMPOSER_CHART,
        convertSummaryRow: (value): ComposerChartContent => {
            if (
                !composerChartContentConfiguration.shouldRowBeConverted(value)
            ) {
                throw new Error('Invalid content row');
            }
            return {
                contentType: ContentType.COMPOSER_CHART,
                uuid: value.uuid,
                slug: value.slug,
                name: value.name,
                description: value.description,
                chartKind: toChartKind(value.metadata.chart_config),
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
                views: 0,
                firstViewedAt: null,
                lastViewedAt: null,
                verification: null,
            };
        },
    };
