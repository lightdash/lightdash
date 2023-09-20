import {
    AdditionalMetric,
    ChartConfig,
    ChartKind,
    ChartSummary,
    CreateSavedChart,
    CreateSavedChartVersion,
    DBFieldTypes,
    getChartKind,
    getChartType,
    isFormat,
    NotFoundError,
    Project,
    SavedChart,
    SessionUser,
    SortField,
    Space,
    UpdatedByUser,
    UpdateMultipleSavedChart,
    UpdateSavedChart,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { Knex } from 'knex';
import { DashboardsTableName } from '../database/entities/dashboards';
import { OrganizationTableName } from '../database/entities/organizations';
import {
    PinnedChartTableName,
    PinnedListTableName,
} from '../database/entities/pinnedList';
import { ProjectTableName } from '../database/entities/projects';
import {
    CreateDbSavedChartVersionField,
    CreateDbSavedChartVersionSort,
    DBFilteredAdditionalMetrics,
    DbSavedChartAdditionalMetricInsert,
    DbSavedChartTableCalculationInsert,
    InsertChart,
    SavedChartAdditionalMetricTableName,
    SavedChartsTableName,
} from '../database/entities/savedCharts';
import {
    getFirstAccessibleSpace,
    getSpaceId,
    SpaceTableName,
} from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';

type DbSavedChartDetails = {
    project_uuid: string;
    saved_query_id: number;
    saved_query_uuid: string;
    name: string;
    description: string | undefined;
    saved_queries_version_id: number;
    explore_name: string;
    filters: any;
    row_limit: number;
    chart_type: ChartConfig['type'];
    chart_config: ChartConfig['config'] | undefined;
    pivot_dimensions: string[] | undefined;
    created_at: Date;
    organization_uuid: string;
    user_uuid: string;
    first_name: string;
    last_name: string;
    pinned_list_uuid: string;
    dashboard_uuid: string | null;
};

const createSavedChartVersionField = async (
    trx: Knex,
    data: CreateDbSavedChartVersionField,
) => {
    const results = await trx('saved_queries_version_fields')
        .insert<CreateDbSavedChartVersionField>(data)
        .returning('*');
    return results[0];
};

const createSavedChartVersionSort = async (
    trx: Knex,
    data: CreateDbSavedChartVersionSort,
) => {
    const results = await trx('saved_queries_version_sorts')
        .insert<CreateDbSavedChartVersionSort>(data)
        .returning('*');
    return results[0];
};

const createSavedChartVersionTableCalculation = async (
    trx: Knex,
    data: DbSavedChartTableCalculationInsert,
) => {
    const results = await trx('saved_queries_version_table_calculations')
        .insert(data)
        .returning('*');
    return results[0];
};

const createSavedChartVersionAdditionalMetrics = async (
    trx: Knex,
    data: DbSavedChartAdditionalMetricInsert,
) => {
    const results = await trx(SavedChartAdditionalMetricTableName)
        .insert(data)
        .returning('*');
    return results[0];
};

const createSavedChartVersion = async (
    db: Knex,
    savedChartId: number,
    {
        tableName,
        metricQuery: {
            limit,
            filters,
            dimensions,
            metrics,
            sorts,
            tableCalculations,
            additionalMetrics,
        },
        chartConfig,
        tableConfig,
        pivotConfig,
        updatedByUser,
    }: CreateSavedChartVersion,
): Promise<void> => {
    await db.transaction(async (trx) => {
        const [version] = await trx('saved_queries_versions')
            .insert({
                row_limit: limit,
                filters: JSON.stringify(filters),
                explore_name: tableName,
                saved_query_id: savedChartId,
                pivot_dimensions: pivotConfig ? pivotConfig.columns : undefined,
                chart_type: chartConfig.type,
                chart_config: chartConfig.config,
                updated_by_user_uuid: updatedByUser?.userUuid,
            })
            .returning('*');
        const promises: Promise<any>[] = [];
        dimensions.forEach((dimension) => {
            promises.push(
                createSavedChartVersionField(trx, {
                    name: dimension,
                    field_type: DBFieldTypes.DIMENSION,
                    saved_queries_version_id: version.saved_queries_version_id,
                    order: tableConfig.columnOrder.findIndex(
                        (column) => column === dimension,
                    ),
                }),
            );
        });
        metrics.forEach((metric) => {
            promises.push(
                createSavedChartVersionField(trx, {
                    name: metric,
                    field_type: DBFieldTypes.METRIC,
                    saved_queries_version_id: version.saved_queries_version_id,
                    order: tableConfig.columnOrder.findIndex(
                        (column) => column === metric,
                    ),
                }),
            );
        });
        sorts.forEach((sort, index) => {
            promises.push(
                createSavedChartVersionSort(trx, {
                    field_name: sort.fieldId,
                    descending: sort.descending,
                    saved_queries_version_id: version.saved_queries_version_id,
                    order: index,
                }),
            );
        });
        tableCalculations.forEach((tableCalculation) => {
            promises.push(
                createSavedChartVersionTableCalculation(trx, {
                    name: tableCalculation.name,
                    display_name: tableCalculation.displayName,
                    calculation_raw_sql: tableCalculation.sql,
                    saved_queries_version_id: version.saved_queries_version_id,
                    format: tableCalculation.format,
                    order: tableConfig.columnOrder.findIndex(
                        (column) => column === tableCalculation.name,
                    ),
                }),
            );
        });
        additionalMetrics?.forEach((additionalMetric) => {
            promises.push(
                createSavedChartVersionAdditionalMetrics(trx, {
                    table: additionalMetric.table,
                    name: additionalMetric.name,
                    type: additionalMetric.type,
                    label: additionalMetric.label,
                    description: additionalMetric.description,
                    sql: additionalMetric.sql,
                    hidden: additionalMetric.hidden,
                    percentile: additionalMetric.percentile,
                    compact: additionalMetric.compact,
                    round: additionalMetric.round,
                    format: additionalMetric.format,
                    saved_queries_version_id: version.saved_queries_version_id,
                    filters:
                        additionalMetric.filters &&
                        additionalMetric.filters.length > 0
                            ? JSON.stringify(additionalMetric.filters)
                            : null,
                    base_dimension_name:
                        additionalMetric.baseDimensionName ?? null,
                }),
            );
        });
        await Promise.all(promises);
    });
};

export const createSavedChart = async (
    db: Knex,
    projectUuid: string,
    userUuid: string,
    {
        name,
        description,
        tableName,
        metricQuery,
        chartConfig,
        tableConfig,
        pivotConfig,
        updatedByUser,
        spaceUuid,
        dashboardUuid,
    }: CreateSavedChart & { updatedByUser: UpdatedByUser },
): Promise<string> =>
    db.transaction(async (trx) => {
        let chart: InsertChart;
        const baseChart = {
            name,
            description,
            last_version_chart_kind:
                getChartKind(chartConfig.type, chartConfig.config) ||
                ChartKind.VERTICAL_BAR,
            last_version_updated_by_user_uuid: userUuid,
        };
        if (dashboardUuid) {
            chart = {
                ...baseChart,
                dashboard_uuid: dashboardUuid,
                space_id: null,
            };
        } else {
            const spaceId = spaceUuid
                ? await getSpaceId(trx, spaceUuid)
                : (await getFirstAccessibleSpace(trx, projectUuid, userUuid))
                      .space_id;
            if (!spaceId) throw new NotFoundError('No space found');
            chart = {
                ...baseChart,
                dashboard_uuid: null,
                space_id: spaceId,
            };
        }
        const [newSavedChart] = await trx(SavedChartsTableName)
            .insert(chart)
            .returning('*');
        await createSavedChartVersion(trx, newSavedChart.saved_query_id, {
            tableName,
            metricQuery,
            chartConfig,
            tableConfig,
            pivotConfig,
            updatedByUser,
        });
        return newSavedChart.saved_query_uuid;
    });

type Dependencies = {
    database: Knex;
};

export class SavedChartModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async create(
        projectUuid: string,
        userUuid: string,
        data: CreateSavedChart & { updatedByUser: UpdatedByUser },
    ): Promise<SavedChart> {
        const newSavedChartUuid = await createSavedChart(
            this.database,
            projectUuid,
            userUuid,
            data,
        );
        return this.get(newSavedChartUuid);
    }

    async createVersion(
        savedChartUuid: string,
        data: CreateSavedChartVersion,
        user: SessionUser,
    ): Promise<SavedChart> {
        await this.database.transaction(async (trx) => {
            const [savedChart] = await trx('saved_queries')
                .select(['saved_query_id'])
                .where('saved_query_uuid', savedChartUuid);

            await createSavedChartVersion(trx, savedChart.saved_query_id, {
                ...data,
                updatedByUser: user,
            });

            await trx('saved_queries')
                .update({
                    last_version_chart_kind: getChartKind(
                        data.chartConfig.type,
                        data.chartConfig.config,
                    ),
                    last_version_updated_at: new Date(),
                    last_version_updated_by_user_uuid: user.userUuid,
                })
                .where('saved_query_uuid', savedChartUuid);
        });

        return this.get(savedChartUuid);
    }

    async update(
        savedChartUuid: string,
        data: UpdateSavedChart,
    ): Promise<SavedChart> {
        await this.database('saved_queries')
            .update({
                name: data.name,
                description: data.description,
                space_id: await getSpaceId(this.database, data.spaceUuid),
                dashboard_uuid: data.spaceUuid ? null : undefined, // remove dashboard_uuid when moving chart to space
            })
            .where('saved_query_uuid', savedChartUuid);
        return this.get(savedChartUuid);
    }

    async updateMultiple(
        data: UpdateMultipleSavedChart[],
    ): Promise<SavedChart[]> {
        await this.database.transaction(async (trx) => {
            const promises = data.map(async (savedChart) =>
                trx('saved_queries')
                    .update({
                        name: savedChart.name,
                        description: savedChart.description,
                        space_id: await getSpaceId(trx, savedChart.spaceUuid),
                    })
                    .where('saved_query_uuid', savedChart.uuid),
            );
            await Promise.all(promises);
        });
        return Promise.all(
            data.map(async (savedChart) => this.get(savedChart.uuid)),
        );
    }

    async delete(savedChartUuid: string): Promise<SavedChart> {
        const savedChart = await this.get(savedChartUuid);
        await this.database('saved_queries')
            .delete()
            .where('saved_query_uuid', savedChartUuid);
        return savedChart;
    }

    async get(savedChartUuid: string): Promise<SavedChart> {
        const transaction = Sentry.getCurrentHub()
            ?.getScope()
            ?.getTransaction();
        const span = transaction?.startChild({
            op: 'SavedChartModel.get',
            description: 'Gets a single chart',
        });
        try {
            const [savedQuery] = await this.database
                .from<DbSavedChartDetails>(SavedChartsTableName)
                .leftJoin(
                    DashboardsTableName,
                    `${DashboardsTableName}.dashboard_uuid`,
                    `${SavedChartsTableName}.dashboard_uuid`,
                )
                .innerJoin(SpaceTableName, function spaceJoin() {
                    this.on(
                        `${SpaceTableName}.space_id`,
                        '=',
                        `${DashboardsTableName}.space_id`,
                    ).orOn(
                        `${SpaceTableName}.space_id`,
                        '=',
                        `${SavedChartsTableName}.space_id`,
                    );
                })
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
                .innerJoin(
                    'saved_queries_versions',
                    `${SavedChartsTableName}.saved_query_id`,
                    'saved_queries_versions.saved_query_id',
                )
                .leftJoin(
                    UserTableName,
                    'saved_queries_versions.updated_by_user_uuid',
                    `${UserTableName}.user_uuid`,
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
                .select<
                    (DbSavedChartDetails & {
                        space_uuid: string;
                        spaceName: string;
                        dashboardName: string | null;
                    })[]
                >([
                    `${ProjectTableName}.project_uuid`,
                    `${SavedChartsTableName}.saved_query_id`,
                    `${SavedChartsTableName}.saved_query_uuid`,
                    `${SavedChartsTableName}.name`,
                    `${SavedChartsTableName}.description`,
                    `${SavedChartsTableName}.dashboard_uuid`,
                    `${DashboardsTableName}.name as dashboardName`,
                    'saved_queries_versions.saved_queries_version_id',
                    'saved_queries_versions.explore_name',
                    'saved_queries_versions.filters',
                    'saved_queries_versions.row_limit',
                    'saved_queries_versions.chart_type',
                    'saved_queries_versions.created_at',
                    'saved_queries_versions.chart_config',
                    'saved_queries_versions.pivot_dimensions',
                    `${OrganizationTableName}.organization_uuid`,
                    `${UserTableName}.user_uuid`,
                    `${UserTableName}.first_name`,
                    `${UserTableName}.last_name`,
                    `${SpaceTableName}.space_uuid`,
                    `${SpaceTableName}.name as spaceName`,
                    `${PinnedListTableName}.pinned_list_uuid`,
                ])
                .where(
                    `${SavedChartsTableName}.saved_query_uuid`,
                    savedChartUuid,
                )
                .orderBy('saved_queries_versions.created_at', 'desc')
                .limit(1);
            if (savedQuery === undefined) {
                throw new NotFoundError('Saved query not found');
            }
            const savedQueriesVersionId = savedQuery.saved_queries_version_id;

            const fieldsQuery = this.database('saved_queries_version_fields')
                .select(['name', 'field_type', 'order'])
                .where('saved_queries_version_id', savedQueriesVersionId)
                .orderBy('order', 'asc');

            const sortsQuery = this.database('saved_queries_version_sorts')
                .select(['field_name', 'descending'])
                .where('saved_queries_version_id', savedQueriesVersionId)
                .orderBy('order', 'asc');
            const tableCalculationsQuery = this.database(
                'saved_queries_version_table_calculations',
            )
                .select([
                    'name',
                    'display_name',
                    'calculation_raw_sql',
                    'order',
                    'format',
                ])
                .where('saved_queries_version_id', savedQueriesVersionId);

            const additionalMetricsQuery = this.database(
                SavedChartAdditionalMetricTableName,
            )
                .select([
                    'table',
                    'name',
                    'type',
                    'label',
                    'description',
                    'sql',
                    'hidden',
                    'round',
                    'format',
                    'percentile',
                    'filters',
                    'base_dimension_name',
                    'uuid',
                    'compact',
                ])
                .where('saved_queries_version_id', savedQueriesVersionId);

            const [fields, sorts, tableCalculations, additionalMetricsRows] =
                await Promise.all([
                    fieldsQuery,
                    sortsQuery,
                    tableCalculationsQuery,
                    additionalMetricsQuery,
                ]);

            // Filters out "null" fields
            const additionalMetricsFiltered: DBFilteredAdditionalMetrics[] =
                additionalMetricsRows.map(
                    (addMetric) =>
                        Object.fromEntries(
                            Object.entries(addMetric).filter(
                                ([_, value]) => value !== null,
                            ),
                        ) as DBFilteredAdditionalMetrics,
                );

            const additionalMetrics: AdditionalMetric[] =
                additionalMetricsFiltered.map((additionalMetric) => ({
                    name: additionalMetric.name,
                    label: additionalMetric.label,
                    description: additionalMetric.description,
                    hidden: additionalMetric.hidden,
                    round: additionalMetric.round,
                    compact: additionalMetric.compact,
                    format: isFormat(additionalMetric.format)
                        ? additionalMetric.format
                        : undefined,
                    percentile: additionalMetric.percentile,
                    uuid: additionalMetric.uuid,
                    sql: additionalMetric.sql,
                    table: additionalMetric.table,
                    type: additionalMetric.type,
                    ...(additionalMetric.base_dimension_name && {
                        baseDimensionName: additionalMetric.base_dimension_name,
                    }),
                    ...(additionalMetric.filters && {
                        filters: additionalMetric.filters,
                    }),
                }));

            const [dimensions, metrics]: [string[], string[]] = fields.reduce<
                [string[], string[]]
            >(
                (result, field) => {
                    result[
                        field.field_type === DBFieldTypes.DIMENSION ? 0 : 1
                    ].push(field.name);
                    return result;
                },
                [[], []],
            );

            const columnOrder: string[] = [...fields, ...tableCalculations]
                .sort((a, b) => a.order - b.order)
                .map((x) => x.name);

            const chartConfig = {
                type: savedQuery.chart_type,
                config: savedQuery.chart_config,
            } as ChartConfig;

            return {
                uuid: savedQuery.saved_query_uuid,
                projectUuid: savedQuery.project_uuid,
                name: savedQuery.name,
                description: savedQuery.description,
                tableName: savedQuery.explore_name,
                updatedAt: savedQuery.created_at,
                updatedByUser: {
                    userUuid: savedQuery.user_uuid,
                    firstName: savedQuery.first_name,
                    lastName: savedQuery.last_name,
                },
                metricQuery: {
                    dimensions,
                    metrics,
                    filters: savedQuery.filters,
                    sorts: sorts.map<SortField>((sort) => ({
                        fieldId: sort.field_name,
                        descending: sort.descending,
                    })),
                    limit: savedQuery.row_limit,
                    tableCalculations: tableCalculations.map(
                        (tableCalculation) => ({
                            name: tableCalculation.name,
                            displayName: tableCalculation.display_name,
                            sql: tableCalculation.calculation_raw_sql,
                            format: tableCalculation.format || undefined,
                        }),
                    ),
                    additionalMetrics,
                },
                chartConfig,
                tableConfig: {
                    columnOrder,
                },
                organizationUuid: savedQuery.organization_uuid,
                ...(savedQuery.pivot_dimensions
                    ? { pivotConfig: { columns: savedQuery.pivot_dimensions } }
                    : {}),
                spaceUuid: savedQuery.space_uuid,
                spaceName: savedQuery.spaceName,
                pinnedListUuid: savedQuery.pinned_list_uuid,
                pinnedListOrder: null,
                dashboardUuid: savedQuery.dashboard_uuid,
                dashboardName: savedQuery.dashboardName,
            };
        } finally {
            span?.finish();
        }
    }

    async getSummary(savedChartUuid: string): Promise<ChartSummary> {
        const transaction = Sentry.getCurrentHub()
            ?.getScope()
            ?.getTransaction();
        const span = transaction?.startChild({
            op: 'SavedChartModel.getSummary',
            description: 'Get chart summary',
        });
        try {
            const [chart] = await this.getChartSummaryQuery()
                .where(
                    `${SavedChartsTableName}.saved_query_uuid`,
                    savedChartUuid,
                )
                .limit(1);
            if (chart === undefined) {
                throw new NotFoundError('Saved query not found');
            }
            return chart;
        } finally {
            span?.finish();
        }
    }

    async find(filters: {
        projectUuid?: string;
        spaceUuids?: string[];
    }): Promise<ChartSummary[]> {
        const transaction = Sentry.getCurrentHub()
            ?.getScope()
            ?.getTransaction();
        const span = transaction?.startChild({
            op: 'SavedChartModel.find',
            description: 'Find charts',
        });
        try {
            const query = this.getChartSummaryQuery();
            if (filters.projectUuid) {
                query.where('projects.project_uuid', filters.projectUuid);
            }
            if (filters.spaceUuids) {
                query
                    .whereNotNull(`${SavedChartsTableName}.space_id`)
                    .whereIn('spaces.space_uuid', filters.spaceUuids);
            }
            const chartSummaries = await query;
            return chartSummaries.map((chart) => ({
                ...chart,
                chartType: getChartType(chart.chartKind),
            }));
        } finally {
            span?.finish();
        }
    }

    private getChartSummaryQuery() {
        return this.database('saved_queries')
            .select({
                uuid: 'saved_queries.saved_query_uuid',
                name: 'saved_queries.name',
                description: 'saved_queries.description',
                spaceUuid: 'spaces.space_uuid',
                spaceName: 'spaces.name',
                projectUuid: 'projects.project_uuid',
                organizationUuid: 'organizations.organization_uuid',
                pinnedListUuid: `${PinnedListTableName}.pinned_list_uuid`,
                chartKind: 'saved_queries.last_version_chart_kind',
                dashboardUuid: `${DashboardsTableName}.dashboard_uuid`,
                dashboardName: `${DashboardsTableName}.name`,
            })
            .leftJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${SavedChartsTableName}.dashboard_uuid`,
            )
            .innerJoin(SpaceTableName, function spaceJoin() {
                this.on(
                    `${SpaceTableName}.space_id`,
                    '=',
                    `${DashboardsTableName}.space_id`,
                ).orOn(
                    `${SpaceTableName}.space_id`,
                    '=',
                    `${SavedChartsTableName}.space_id`,
                );
            })
            .leftJoin('projects', 'spaces.project_id', 'projects.project_id')
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
            );
    }

    async getInfoForAvailableFilters(savedChartUuid: string): Promise<
        {
            spaceUuid: Space['uuid'];
        } & Pick<SavedChart, 'uuid' | 'name' | 'tableName'> &
            Pick<Project, 'projectUuid'>
    > {
        const [chart] = await this.database('saved_queries')
            .where(`${SavedChartsTableName}.saved_query_uuid`, savedChartUuid)
            .select({
                uuid: 'saved_queries.saved_query_uuid',
                name: 'saved_queries.names',
                spaceUuid: 'spaces.space_uuid',
                tableName: 'saved_queries_versions.explore_name',
                projectUuid: 'projects.project_uuid',
            })
            .leftJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${SavedChartsTableName}.dashboard_uuid`,
            )
            .innerJoin(SpaceTableName, function spaceJoin() {
                this.on(
                    `${SpaceTableName}.space_id`,
                    '=',
                    `${DashboardsTableName}.space_id`,
                ).orOn(
                    `${SpaceTableName}.space_id`,
                    '=',
                    `${SavedChartsTableName}.space_id`,
                );
            })
            .innerJoin(
                'saved_queries_versions',
                `${SavedChartsTableName}.saved_query_id`,
                'saved_queries_versions.saved_query_id',
            )
            .leftJoin('projects', 'spaces.project_id', 'projects.project_id')
            .limit(1);
        if (chart === undefined) {
            throw new NotFoundError('Saved query not found');
        }
        return chart;
    }
}
