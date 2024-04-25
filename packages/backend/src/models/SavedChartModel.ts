import {
    AdditionalMetric,
    ChartConfig,
    ChartKind,
    ChartSummary,
    ChartVersionSummary,
    CreateSavedChart,
    CreateSavedChartVersion,
    DBFieldTypes,
    ECHARTS_DEFAULT_COLORS,
    generateSlug,
    getChartKind,
    getChartType,
    getCustomDimensionId,
    isFormat,
    LightdashUser,
    NotFoundError,
    Organization,
    Project,
    SavedChartDAO,
    SessionUser,
    SortField,
    Space,
    TimeZone,
    UpdatedByUser,
    UpdateMultipleSavedChart,
    UpdateSavedChart,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { Knex } from 'knex';
import { LightdashConfig } from '../config/parseConfig';
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
    DbSavedChartCustomDimensionInsert,
    DbSavedChartTableCalculationInsert,
    InsertChart,
    SavedChartAdditionalMetricTableName,
    SavedChartCustomDimensionsTableName,
    SavedChartsTableName,
    SavedChartVersionsTableName,
} from '../database/entities/savedCharts';
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import { SpaceModel } from './SpaceModel';

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
    timezone: TimeZone | undefined;
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

const createSavedChartVersionCustomDimension = async (
    trx: Knex,
    data: DbSavedChartCustomDimensionInsert,
) => {
    const results = await trx('saved_queries_version_custom_dimensions')
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
            customDimensions,
            timezone,
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
                timezone,
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

        customDimensions?.forEach((customDimension) => {
            promises.push(
                createSavedChartVersionCustomDimension(trx, {
                    saved_queries_version_id: version.saved_queries_version_id,
                    id: customDimension.id,
                    name: customDimension.name,
                    dimension_id: customDimension.dimensionId,
                    table: customDimension.table,
                    bin_type: customDimension.binType,
                    bin_number: customDimension.binNumber || null,
                    bin_width: customDimension.binWidth || null,
                    custom_range:
                        customDimension.customRange &&
                        customDimension.customRange.length > 0
                            ? JSON.stringify(customDimension.customRange)
                            : null,
                    order: tableConfig.columnOrder.findIndex(
                        (column) =>
                            column === getCustomDimensionId(customDimension), // TODO test if it works
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
                    format_options: additionalMetric.formatOptions
                        ? JSON.stringify(additionalMetric.formatOptions)
                        : null,
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
            const getSpaceIdAndName = async () => {
                if (spaceUuid) {
                    const space = await SpaceModel.getSpaceIdAndName(
                        trx,
                        spaceUuid,
                    );
                    if (space === undefined)
                        throw Error(`Missing space with uuid ${spaceUuid}`);
                    return {
                        spaceId: space.spaceId,
                        name: space.name,
                    };
                }
                const firstSpace = await SpaceModel.getFirstAccessibleSpace(
                    trx,
                    projectUuid,
                    userUuid,
                );
                return {
                    spaceId: firstSpace.space_id,
                    name: firstSpace.name,
                };
            };
            const { spaceId, name: spaceName } = await getSpaceIdAndName();

            if (!spaceId) throw new NotFoundError('No space found');
            chart = {
                ...baseChart,
                dashboard_uuid: null,
                space_id: spaceId,
                slug: generateSlug('charts', name, spaceName),
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

type SavedChartModelArguments = {
    database: Knex;
    lightdashConfig: LightdashConfig;
};

type VersionSummaryRow = {
    saved_query_uuid: string;
    saved_queries_version_uuid: string;
    created_at: Date;
    user_uuid: string | null;
    first_name: string | null;
    last_name: string | null;
};

export class SavedChartModel {
    private database: Knex;

    private lightdashConfig: LightdashConfig;

    constructor(args: SavedChartModelArguments) {
        this.database = args.database;
        this.lightdashConfig = args.lightdashConfig;
    }

    static convertVersionSummary(row: VersionSummaryRow): ChartVersionSummary {
        return {
            chartUuid: row.saved_query_uuid,
            versionUuid: row.saved_queries_version_uuid,
            createdAt: row.created_at,
            createdBy: row.user_uuid
                ? {
                      userUuid: row.user_uuid,
                      firstName: row.first_name ?? '',
                      lastName: row.last_name ?? '',
                  }
                : null,
        };
    }

    private getLastVersionUuidQuery(chartUuid: string) {
        return this.database(SavedChartVersionsTableName)
            .leftJoin(
                SavedChartsTableName,
                `${SavedChartVersionsTableName}.saved_query_id`,
                `${SavedChartsTableName}.saved_query_id`,
            )
            .select('saved_queries_version_uuid')
            .where(`${SavedChartsTableName}.saved_query_uuid`, chartUuid)
            .limit(1)
            .orderBy(`${SavedChartVersionsTableName}.created_at`, 'desc');
    }

    private getVersionSummaryQuery() {
        return this.database(SavedChartVersionsTableName)
            .leftJoin(
                SavedChartsTableName,
                `${SavedChartVersionsTableName}.saved_query_id`,
                `${SavedChartsTableName}.saved_query_id`,
            )
            .leftJoin(
                UserTableName,
                `${SavedChartVersionsTableName}.updated_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .select<VersionSummaryRow[]>(
                `${SavedChartsTableName}.saved_query_uuid`,
                `${SavedChartVersionsTableName}.saved_queries_version_uuid`,
                `${SavedChartVersionsTableName}.created_at`,
                `${UserTableName}.user_uuid`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
            )
            .orderBy(`${SavedChartVersionsTableName}.created_at`, 'desc');
    }

    async getVersionSummary(
        chartUuid: string,
        versionUuid: string,
    ): Promise<ChartVersionSummary> {
        const chartVersion = await this.getVersionSummaryQuery()
            .where(`${SavedChartsTableName}.saved_query_uuid`, chartUuid)
            .where(
                `${SavedChartVersionsTableName}.saved_queries_version_uuid`,
                versionUuid,
            )
            .first();
        if (chartVersion === undefined) {
            throw new NotFoundError('Chart version not found');
        }
        return SavedChartModel.convertVersionSummary(chartVersion);
    }

    async getLatestVersionSummaries(
        chartUuid: string,
    ): Promise<ChartVersionSummary[]> {
        const getLastVersionUuidSubQuery =
            this.getLastVersionUuidQuery(chartUuid);
        const { daysLimit } = this.lightdashConfig.chart.versionHistory;
        const chartVersions = await this.getVersionSummaryQuery()
            .where(`${SavedChartsTableName}.saved_query_uuid`, chartUuid)
            .andWhere(function whereRecentVersionsOrCurrentVersion() {
                // get all versions from the last X days + the current version ( in case is older than X days )
                void this.whereRaw(
                    `${SavedChartVersionsTableName}.created_at >= DATE(current_timestamp - interval '?? days')`,
                    [daysLimit],
                ).orWhere(
                    `${SavedChartVersionsTableName}.saved_queries_version_uuid`,
                    getLastVersionUuidSubQuery,
                );
            })
            .orderBy(`${SavedChartVersionsTableName}.created_at`, 'asc');

        if (chartVersions.length === 1) {
            const oldVersions = await this.getVersionSummaryQuery()
                .where(`${SavedChartsTableName}.saved_query_uuid`, chartUuid)
                .andWhereNot(
                    `${SavedChartVersionsTableName}.saved_queries_version_uuid`,
                    chartVersions[0].saved_queries_version_uuid,
                )
                .orderBy(`${SavedChartVersionsTableName}.created_at`, 'asc')
                .limit(1);

            return [...chartVersions, ...oldVersions].map(
                SavedChartModel.convertVersionSummary,
            );
        }

        return chartVersions.map(SavedChartModel.convertVersionSummary);
    }

    async create(
        projectUuid: string,
        userUuid: string,
        data: CreateSavedChart & { updatedByUser: UpdatedByUser },
    ): Promise<SavedChartDAO> {
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
    ): Promise<SavedChartDAO> {
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
    ): Promise<SavedChartDAO> {
        await this.database('saved_queries')
            .update({
                name: data.name,
                description: data.description,
                space_id: (
                    await SpaceModel.getSpaceIdAndName(
                        this.database,
                        data.spaceUuid,
                    )
                )?.spaceId,
                dashboard_uuid: data.spaceUuid ? null : undefined, // remove dashboard_uuid when moving chart to space
                slug: data.slug,
            })
            .where('saved_query_uuid', savedChartUuid);
        return this.get(savedChartUuid);
    }

    async updateMultiple(
        data: UpdateMultipleSavedChart[],
    ): Promise<SavedChartDAO[]> {
        await this.database.transaction(async (trx) => {
            const promises = data.map(async (savedChart) =>
                trx('saved_queries')
                    .update({
                        name: savedChart.name,
                        description: savedChart.description,
                        space_id: (
                            await SpaceModel.getSpaceIdAndName(
                                trx,
                                savedChart.spaceUuid,
                            )
                        )?.spaceId,
                    })
                    .where('saved_query_uuid', savedChart.uuid),
            );
            await Promise.all(promises);
        });
        return Promise.all(
            data.map(async (savedChart) => this.get(savedChart.uuid)),
        );
    }

    async delete(savedChartUuid: string): Promise<SavedChartDAO> {
        const savedChart = await this.get(savedChartUuid);
        await this.database('saved_queries')
            .delete()
            .where('saved_query_uuid', savedChartUuid);
        return savedChart;
    }

    async get(
        savedChartUuid: string,
        versionUuid?: string,
    ): Promise<SavedChartDAO> {
        const transaction = Sentry.getCurrentHub()
            ?.getScope()
            ?.getTransaction();
        const span = transaction?.startChild({
            op: 'SavedChartModel.get',
            description: 'Gets a single chart',
        });
        try {
            const chartQuery = this.database
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
                        chart_colors: string[] | null;
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
                    'saved_queries_versions.timezone',
                    `${OrganizationTableName}.organization_uuid`,
                    `${OrganizationTableName}.chart_colors`,
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

            if (versionUuid) {
                void chartQuery.where(
                    `${SavedChartVersionsTableName}.saved_queries_version_uuid`,
                    versionUuid,
                );
            }

            const [savedQuery] = await chartQuery;

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
                    'format_options',
                ])
                .where('saved_queries_version_id', savedQueriesVersionId);

            const customDimensionsQuery = this.database(
                SavedChartCustomDimensionsTableName,
            ).where('saved_queries_version_id', savedQueriesVersionId);

            const [
                fields,
                sorts,
                tableCalculations,
                additionalMetricsRows,
                customDimensionsRows,
            ] = await Promise.all([
                fieldsQuery,
                sortsQuery,
                tableCalculationsQuery,
                additionalMetricsQuery,
                customDimensionsQuery,
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
                    ...(additionalMetric.format_options && {
                        formatOptions: additionalMetric.format_options,
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

            const columnOrder: string[] = [
                ...fields,
                ...tableCalculations,
                ...customDimensionsRows,
            ]
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
                    exploreName: savedQuery.explore_name,
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
                    customDimensions: customDimensionsRows?.map((cd) => ({
                        id: cd.id,
                        name: cd.name,
                        dimensionId: cd.dimension_id,
                        table: cd.table,
                        binType: cd.bin_type,
                        binNumber: cd.bin_number,
                        binWidth: cd.bin_width,
                        customRange: cd.custom_range,
                    })),
                    timezone: savedQuery.timezone,
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
                colorPalette: savedQuery.chart_colors ?? ECHARTS_DEFAULT_COLORS,
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
                void query.where('projects.project_uuid', filters.projectUuid);
            }
            if (filters.spaceUuids) {
                void query
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

    async getInfoForAvailableFilters(savedChartUuids: string[]): Promise<
        ({
            spaceUuid: Space['uuid'];
        } & Pick<SavedChartDAO, 'uuid' | 'name' | 'tableName'> &
            Pick<Project, 'projectUuid'> &
            Pick<Organization, 'organizationUuid'>)[]
    > {
        const getLatestQueryVersionSubQuery = this.database(
            'saved_queries_versions',
        )
            .select('saved_query_id', 'explore_name')
            .max('created_at as latest')
            .groupBy('saved_query_id', 'explore_name');

        const charts = await this.database('saved_queries')
            .whereIn(
                `${SavedChartsTableName}.saved_query_uuid`,
                savedChartUuids,
            )
            .select({
                uuid: 'saved_queries.saved_query_uuid',
                name: 'saved_queries.name',
                spaceUuid: 'spaces.space_uuid',
                tableName: 'latest_saved_query.explore_name',
                projectUuid: 'projects.project_uuid',
                organizationUuid: 'organizations.organization_uuid',
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
                getLatestQueryVersionSubQuery.as('latest_saved_query'),
                function latestSavedQueryJoin() {
                    this.on(
                        `${SavedChartsTableName}.saved_query_id`,
                        '=',
                        'latest_saved_query.saved_query_id',
                    );
                },
            )
            .leftJoin('projects', 'spaces.project_id', 'projects.project_id')
            .leftJoin(
                OrganizationTableName,
                'organizations.organization_id',
                'projects.organization_id',
            );

        if (charts.length === 0) {
            throw new NotFoundError('Saved queries not found');
        }
        return charts;
    }

    async findInfoForDbtExposures(
        projectUuid: string,
    ): Promise<
        Array<
            Pick<SavedChartDAO, 'uuid' | 'name' | 'description' | 'tableName'> &
                Pick<LightdashUser, 'firstName' | 'lastName'>
        >
    > {
        const getLatestQueryVersionSubQuery = this.database(
            'saved_queries_versions',
        )
            .select('saved_query_id', 'explore_name', 'updated_by_user_uuid')
            .max('created_at as latest')
            .groupBy('saved_query_id', 'explore_name', 'updated_by_user_uuid');

        return this.database('saved_queries')
            .select({
                uuid: 'saved_queries.saved_query_uuid',
                name: 'saved_queries.name',
                description: 'saved_queries.description',
                tableName: 'latest_saved_query.explore_name',
                firstName: `${UserTableName}.first_name`,
                lastName: `${UserTableName}.last_name`,
            })
            .innerJoin(
                getLatestQueryVersionSubQuery.as('latest_saved_query'),
                function latestSavedQueryJoin() {
                    this.on(
                        `${SavedChartsTableName}.saved_query_id`,
                        '=',
                        'latest_saved_query.saved_query_id',
                    );
                },
            )
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
                UserTableName,
                `latest_saved_query.updated_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .where('projects.project_uuid', projectUuid);
    }
}
