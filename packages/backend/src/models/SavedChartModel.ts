import {
    AdditionalMetric,
    AnyType,
    BinType,
    ChartConfig,
    ChartKind,
    ChartSourceType,
    ChartSummary,
    ChartVersionSummary,
    ContentType,
    CreateSavedChart,
    CreateSavedChartVersion,
    CustomBinDimension,
    CustomDimensionType,
    CustomSqlDimension,
    DBFieldTypes,
    DeletedContentFilters,
    DeletedDbtChartContentSummary,
    DimensionOverrides,
    Filters,
    getChartKind,
    getChartType,
    getItemId,
    isCustomBinDimension,
    isCustomSqlDimension,
    isFormat,
    isFormulaTableCalculation,
    isSqlTableCalculation,
    isTemplateTableCalculation,
    KnexPaginateArgs,
    KnexPaginatedData,
    LightdashUser,
    MetricFilterRule,
    MetricOverrides,
    NotFoundError,
    Organization,
    Project,
    ResolvedProjectColorPalette,
    SavedChartDAO,
    SessionUser,
    SortField,
    Space,
    TableCalculation,
    TimeFrames,
    TimeZone,
    UpdatedByUser,
    UpdateMultipleSavedChart,
    UpdateSavedChart,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { Knex } from 'knex';
import { validate as isValidUuid } from 'uuid';
import { LightdashConfig } from '../config/parseConfig';
import {
    DashboardsTableName,
    DashboardTileChartTableName,
    DashboardVersionsTableName,
} from '../database/entities/dashboards';
import { resolveColorPalette } from '../database/entities/organizationColorPalettes';
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
    DbSavedChartAdditionalMetric,
    DbSavedChartAdditionalMetricInsert,
    DbSavedChartCustomDimensionInsert,
    DbSavedChartCustomSqlDimension,
    DbSavedChartTableCalculationInsert,
    InsertChart,
    SavedChartAdditionalMetricTableName,
    SavedChartCustomDimensionsTableName,
    SavedChartCustomSqlDimensionsTableName,
    SavedChartsTableName,
    SavedChartVersionFieldsTableName,
    SavedChartVersionsTableName,
} from '../database/entities/savedCharts';
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import KnexPaginate from '../database/pagination';
import { wrapSentryTransaction } from '../utils';
import { generateUniqueSlug } from '../utils/SlugUtils';
import { ContentVerificationModel } from './ContentVerificationModel';
import { SpaceModel } from './SpaceModel';

type DbSavedChartDetails = {
    project_uuid: string;
    saved_query_id: number;
    saved_query_uuid: string;
    name: string;
    description: string | undefined;
    saved_queries_version_id: number;
    explore_name: string;
    filters: AnyType;
    row_limit: number;
    metric_overrides: MetricOverrides | null;
    dimension_overrides: DimensionOverrides | null;
    chart_type: ChartConfig['type'];
    chart_config: ChartConfig['config'] | undefined;
    pivot_dimensions: string[] | undefined;
    parameters: AnyType | null;
    created_at: Date;
    organization_uuid: string;
    user_uuid: string;
    first_name: string;
    last_name: string;
    pinned_list_uuid: string;
    dashboard_uuid: string | null;
    timezone: TimeZone | null;
    color_palette_uuid: string | null;
};

const createSavedChartVersionFields = async (
    trx: Knex,
    data: CreateDbSavedChartVersionField[],
) => {
    if (data.length > 0) {
        return trx('saved_queries_version_fields')
            .insert<CreateDbSavedChartVersionField>(data)
            .returning('*');
    }
    return [];
};

const createSavedChartVersionSorts = async (
    trx: Knex,
    data: CreateDbSavedChartVersionSort[],
) => {
    if (data.length > 0) {
        return trx('saved_queries_version_sorts')
            .insert<CreateDbSavedChartVersionSort>(data)
            .returning('*');
    }
    return [];
};

const createSavedChartVersionTableCalculations = async (
    trx: Knex,
    data: DbSavedChartTableCalculationInsert[],
) => {
    if (data.length > 0) {
        return trx('saved_queries_version_table_calculations')
            .insert(data)
            .returning('*');
    }
    return [];
};

const createSavedChartVersionCustomDimensions = async (
    trx: Knex,
    data: DbSavedChartCustomDimensionInsert[],
) => {
    if (data.length > 0) {
        return trx('saved_queries_version_custom_dimensions')
            .insert(data)
            .returning('*');
    }
    return [];
};

const createSavedChartVersionCustomSqlDimensions = async (
    trx: Knex,
    data: DbSavedChartCustomSqlDimension[],
) => {
    if (data.length > 0) {
        return trx(SavedChartCustomSqlDimensionsTableName)
            .insert(data)
            .returning('*');
    }
    return [];
};

const createSavedChartVersionAdditionalMetrics = async (
    trx: Knex,
    data: DbSavedChartAdditionalMetricInsert[],
) => {
    if (data.length > 0) {
        return trx(SavedChartAdditionalMetricTableName)
            .insert(data)
            .returning('*');
    }
    return [];
};

const createSavedChartVersion = async (
    db: Knex,
    savedChartId: number,
    {
        tableName,
        metricQuery: {
            limit,
            metricOverrides,
            dimensionOverrides,
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
        parameters,
        updatedByUser,
    }: CreateSavedChartVersion,
): Promise<void> => {
    await db.transaction(async (trx) => {
        // Only save overrides for existing metrics
        const validMetricOverrides = Object.fromEntries(
            Object.entries(metricOverrides || {}).filter(([key]) =>
                metrics.includes(key),
            ),
        );
        // Only save overrides for existing dimensions
        const validDimensionOverrides = Object.fromEntries(
            Object.entries(dimensionOverrides || {}).filter(([key]) =>
                dimensions.includes(key),
            ),
        );
        const [version] = await trx('saved_queries_versions')
            .insert({
                row_limit: limit,
                metric_overrides: validMetricOverrides || null,
                dimension_overrides: validDimensionOverrides || null,
                filters: JSON.stringify(filters),
                explore_name: tableName,
                saved_query_id: savedChartId,
                pivot_dimensions: pivotConfig ? pivotConfig.columns : null,
                chart_type: chartConfig.type,
                chart_config: chartConfig.config,
                parameters: parameters ? JSON.stringify(parameters) : null,
                updated_by_user_uuid: updatedByUser?.userUuid || null,
                timezone: timezone || null,
            })
            .returning('*');
        await createSavedChartVersionFields(
            trx,
            dimensions.map((dimension) => ({
                name: dimension,
                field_type: DBFieldTypes.DIMENSION,
                saved_queries_version_id: version.saved_queries_version_id,
                order: tableConfig.columnOrder.findIndex(
                    (column) => column === dimension,
                ),
            })),
        );
        await createSavedChartVersionFields(
            trx,
            metrics.map((metric) => ({
                name: metric,
                field_type: DBFieldTypes.METRIC,
                saved_queries_version_id: version.saved_queries_version_id,
                order: tableConfig.columnOrder.findIndex(
                    (column) => column === metric,
                ),
            })),
        );
        await createSavedChartVersionSorts(
            trx,
            sorts.map((sort, index) => ({
                field_name: sort.fieldId,
                descending: sort.descending,
                saved_queries_version_id: version.saved_queries_version_id,
                nulls_first: sort.nullsFirst ?? null,
                order: index,
            })),
        );
        await createSavedChartVersionTableCalculations(
            trx,
            (tableCalculations || []).map((tableCalculation) => ({
                name: tableCalculation.name,
                display_name: tableCalculation.displayName,
                calculation_raw_sql: isSqlTableCalculation(tableCalculation)
                    ? tableCalculation.sql
                    : '',
                saved_queries_version_id: version.saved_queries_version_id,
                format: tableCalculation.format,
                order: tableConfig.columnOrder.findIndex(
                    (column) => column === tableCalculation.name,
                ),
                type: tableCalculation.type,
                template: isTemplateTableCalculation(tableCalculation)
                    ? tableCalculation.template
                    : undefined,
                formula: isFormulaTableCalculation(tableCalculation)
                    ? tableCalculation.formula
                    : undefined,
            })),
        );
        await createSavedChartVersionCustomDimensions(
            trx,
            (customDimensions || [])
                .filter(isCustomBinDimension)
                .map((customDimension) => ({
                    saved_queries_version_id: version.saved_queries_version_id,
                    id: customDimension.id,
                    name: customDimension.name,
                    dimension_id: customDimension.dimensionId,
                    table: customDimension.table,
                    bin_type: customDimension.binType,
                    bin_number:
                        customDimension.binType === BinType.FIXED_NUMBER
                            ? customDimension.binNumber
                            : null,
                    bin_width:
                        customDimension.binType === BinType.FIXED_WIDTH
                            ? customDimension.binWidth
                            : null,
                    custom_range:
                        customDimension.binType === BinType.CUSTOM_RANGE
                            ? JSON.stringify(customDimension.customRange)
                            : null,
                    custom_groups:
                        customDimension.binType === BinType.CUSTOM_GROUP
                            ? JSON.stringify(customDimension.customGroups)
                            : null,
                    order: tableConfig.columnOrder.findIndex(
                        (column) => column === getItemId(customDimension),
                    ),
                })),
        );
        await createSavedChartVersionCustomSqlDimensions(
            trx,
            (customDimensions || [])
                .filter(isCustomSqlDimension)
                .map((customDimension) => ({
                    saved_queries_version_id: version.saved_queries_version_id,
                    id: customDimension.id,
                    name: customDimension.name,
                    table: customDimension.table,
                    order: tableConfig.columnOrder.findIndex(
                        (column) => column === getItemId(customDimension),
                    ),
                    sql: customDimension.sql,
                    dimension_type: customDimension.dimensionType,
                })),
        );
        await createSavedChartVersionAdditionalMetrics(
            trx,
            (additionalMetrics || []).map((additionalMetric) => ({
                table: additionalMetric.table,
                name: additionalMetric.name,
                type: additionalMetric.type,
                label: additionalMetric.label,
                description: additionalMetric.description,
                sql: additionalMetric.sql,
                hidden: additionalMetric.hidden,
                percentile: additionalMetric.percentile,
                distinct_keys: additionalMetric.distinctKeys
                    ? JSON.stringify(additionalMetric.distinctKeys)
                    : undefined,
                compact: additionalMetric.compact,
                round: additionalMetric.round,
                format: additionalMetric.format,
                saved_queries_version_id: version.saved_queries_version_id,
                filters:
                    additionalMetric.filters &&
                    additionalMetric.filters.length > 0
                        ? JSON.stringify(additionalMetric.filters)
                        : null,
                base_dimension_name: additionalMetric.baseDimensionName ?? null,
                format_options: additionalMetric.formatOptions
                    ? JSON.stringify(additionalMetric.formatOptions)
                    : null,
                generation_type: additionalMetric.generationType ?? null,
                base_metric_id: additionalMetric.baseMetricId ?? null,
                time_dimension_id: additionalMetric.timeDimensionId ?? null,
                granularity: additionalMetric.granularity ?? null,
                period_offset:
                    additionalMetric.periodOffset !== undefined
                        ? additionalMetric.periodOffset
                        : null,
            })),
        );
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
        parameters,
        updatedByUser,
        spaceUuid,
        dashboardUuid,
        slug,
        forceSlug,
    }: CreateSavedChart & {
        updatedByUser: UpdatedByUser;
        slug: string;
        forceSlug?: boolean;
    },
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
            slug: forceSlug
                ? slug
                : await generateUniqueSlug(trx, SavedChartsTableName, slug),
        };
        if (dashboardUuid) {
            chart = {
                ...baseChart,
                dashboard_uuid: dashboardUuid,
                space_id: null,
            };
        } else {
            if (!spaceUuid) {
                throw new NotFoundError('No space specified for chart');
            }
            const space = await SpaceModel.getSpaceIdAndName(trx, spaceUuid);
            if (space === undefined)
                throw Error(`Missing space with uuid ${spaceUuid}`);
            const { spaceId } = space;
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
            parameters,
            updatedByUser,
        });
        return newSavedChart.saved_query_uuid;
    });

type SavedChartModelArguments = {
    database: Knex;
    lightdashConfig: LightdashConfig;
    contentVerificationModel?: ContentVerificationModel;
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

    private contentVerificationModel: ContentVerificationModel | undefined;

    async transaction<T>(
        callback: (tx: Knex.Transaction) => Promise<T>,
    ): Promise<T> {
        return this.database.transaction(callback);
    }

    constructor(args: SavedChartModelArguments) {
        this.database = args.database;
        this.lightdashConfig = args.lightdashConfig;
        this.contentVerificationModel = args.contentVerificationModel;
    }

    async resolveColorPalette(args: {
        projectUuid: string;
        chartUuid?: string;
        dashboardUuid?: string;
        spaceUuid?: string;
    }): Promise<ResolvedProjectColorPalette> {
        return resolveColorPalette({
            ...args,
            database: this.database,
            lightdashConfig: this.lightdashConfig,
        });
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

    static convertDbSavedChartAdditionalMetricToAdditionalMetric(
        additionalMetric:
            | DBFilteredAdditionalMetrics
            | DbSavedChartAdditionalMetric,
    ): AdditionalMetric {
        return {
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
            ...(additionalMetric.distinct_keys
                ? {
                      distinctKeys:
                          typeof additionalMetric.distinct_keys === 'string'
                              ? JSON.parse(additionalMetric.distinct_keys)
                              : additionalMetric.distinct_keys,
                  }
                : {}),
            uuid: additionalMetric.uuid,
            sql: additionalMetric.sql,
            table: additionalMetric.table,
            type: additionalMetric.type,
            ...(additionalMetric.generation_type && {
                generationType:
                    additionalMetric.generation_type as 'periodOverPeriod',
            }),
            ...(additionalMetric.base_metric_id && {
                baseMetricId: additionalMetric.base_metric_id,
            }),
            ...(additionalMetric.time_dimension_id && {
                timeDimensionId: additionalMetric.time_dimension_id,
            }),
            ...(additionalMetric.granularity && {
                granularity: additionalMetric.granularity as TimeFrames,
            }),
            ...(additionalMetric.period_offset !== undefined &&
                additionalMetric.period_offset !== null && {
                    periodOffset: additionalMetric.period_offset,
                }),
            ...(additionalMetric.base_dimension_name && {
                baseDimensionName: additionalMetric.base_dimension_name,
            }),
            ...(additionalMetric.filters && {
                filters: additionalMetric.filters,
            }),
            ...(additionalMetric.format_options && {
                formatOptions: additionalMetric.format_options,
            }),
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
            .whereNull(`${SavedChartsTableName}.deleted_at`)
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

    async getLatestVersionSummary(
        chartUuid: string,
    ): Promise<ChartVersionSummary | undefined> {
        const row = await this.getVersionSummaryQuery()
            .where(`${SavedChartsTableName}.saved_query_uuid`, chartUuid)
            .orderBy(`${SavedChartVersionsTableName}.created_at`, 'desc')
            .first();
        return row ? SavedChartModel.convertVersionSummary(row) : undefined;
    }

    async getVersionSummaryAtTimestamp(
        chartUuid: string,
        targetTimestamp: Date,
    ): Promise<ChartVersionSummary | undefined> {
        const row = await this.getVersionSummaryQuery()
            .where(`${SavedChartsTableName}.saved_query_uuid`, chartUuid)
            .where(
                `${SavedChartVersionsTableName}.created_at`,
                '<=',
                targetTimestamp,
            )
            .orderBy(`${SavedChartVersionsTableName}.created_at`, 'desc')
            .first();
        return row ? SavedChartModel.convertVersionSummary(row) : undefined;
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
        data: CreateSavedChart & {
            updatedByUser: UpdatedByUser;
            slug: string;
            forceSlug?: boolean;
        },
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
        user: SessionUser | undefined,
        tx?: Knex,
    ): Promise<SavedChartDAO> {
        const doWork = async (trx: Knex) => {
            const [savedChart] = await trx(SavedChartsTableName)
                .select(['saved_query_id'])
                .where('saved_query_uuid', savedChartUuid)
                .whereNull('deleted_at');

            if (!savedChart) {
                throw new NotFoundError('Saved chart not found');
            }

            await createSavedChartVersion(trx, savedChart.saved_query_id, {
                ...data,
                updatedByUser: user,
            });

            await trx(SavedChartsTableName)
                .update({
                    last_version_chart_kind: getChartKind(
                        data.chartConfig.type,
                        data.chartConfig.config,
                    ),
                    last_version_updated_at: new Date(),
                    last_version_updated_by_user_uuid: user?.userUuid,
                })
                .where('saved_query_uuid', savedChartUuid)
                .whereNull('deleted_at');
        };

        if (tx) {
            await doWork(tx);
        } else {
            await this.database.transaction(async (trx) => doWork(trx));
        }

        return this.get(savedChartUuid);
    }

    async update(
        savedChartUuid: string,
        data: UpdateSavedChart,
    ): Promise<SavedChartDAO> {
        await this.database(SavedChartsTableName)
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
                color_palette_uuid: data.colorPaletteUuid,
            })
            .where('saved_query_uuid', savedChartUuid)
            .whereNull('deleted_at');
        return this.get(savedChartUuid);
    }

    async updateMultiple(
        data: UpdateMultipleSavedChart[],
    ): Promise<SavedChartDAO[]> {
        await this.database.transaction(async (trx) => {
            const promises = data.map(async (savedChart) =>
                trx(SavedChartsTableName)
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
                    .where('saved_query_uuid', savedChart.uuid)
                    .whereNull('deleted_at'),
            );
            await Promise.all(promises);
        });
        return Promise.all(
            data.map(async (savedChart) => this.get(savedChart.uuid)),
        );
    }

    async permanentDelete(savedChartUuid: string): Promise<SavedChartDAO> {
        const savedChart = await this.get(savedChartUuid, undefined, {
            deleted: 'any',
        });
        await this.database(SavedChartsTableName)
            .delete()
            .where('saved_query_uuid', savedChartUuid);
        return savedChart;
    }

    async softDelete(
        savedChartUuid: string,
        userUuid: string,
    ): Promise<SavedChartDAO> {
        const savedChart = await this.get(savedChartUuid);
        await this.database(SavedChartsTableName)
            .update({
                deleted_at: new Date(),
                deleted_by_user_uuid: userUuid,
            })
            .where('saved_query_uuid', savedChartUuid);
        return savedChart;
    }

    async getChartSummariesForFieldId(projectUuid: string, fieldId: string) {
        return wrapSentryTransaction(
            'SavedChartModel.getChartSummariesForFieldId',
            { project_uuid: projectUuid, field_id: fieldId },
            async () =>
                this.getChartSummaryQuery()
                    .innerJoin(
                        SavedChartVersionsTableName,
                        `${SavedChartsTableName}.saved_query_id`,
                        `${SavedChartVersionsTableName}.saved_query_id`,
                    )
                    .innerJoin(
                        SavedChartVersionFieldsTableName,
                        `${SavedChartVersionsTableName}.saved_queries_version_id`,
                        `${SavedChartVersionFieldsTableName}.saved_queries_version_id`,
                    )
                    .where(`${SavedChartVersionFieldsTableName}.name`, fieldId)
                    .where(
                        `${SavedChartVersionsTableName}.saved_queries_version_id`,
                        this.database.raw(`(select saved_queries_version_id
                    from ${SavedChartVersionsTableName}
                    where ${SavedChartsTableName}.saved_query_id = ${SavedChartVersionsTableName}.saved_query_id
                    order by ${SavedChartVersionsTableName}.created_at desc
                    limit 1)`),
                    )
                    .where(`${ProjectTableName}.project_uuid`, projectUuid)
                    .orderBy(`${SavedChartsTableName}.views_count`, 'desc'),
        );
    }

    async getChartCountPerField(projectUuid: string, fieldIds: string[]) {
        // First CTE: Get relevant saved_query_ids for the project through spaces and dashboards
        const relevantCharts = this.database
            .select(`${SavedChartsTableName}.saved_query_id`)
            .distinct()
            .from(SavedChartsTableName)
            .leftJoin(DashboardsTableName, function nonDeletedDashboardJoin() {
                this.on(
                    `${DashboardsTableName}.dashboard_uuid`,
                    '=',
                    `${SavedChartsTableName}.dashboard_uuid`,
                ).andOnNull(`${DashboardsTableName}.deleted_at`);
            })
            .joinRaw(
                `INNER JOIN ${SpaceTableName} ON ${SpaceTableName}.space_id = COALESCE(${SavedChartsTableName}.space_id, ${DashboardsTableName}.space_id) AND ${SpaceTableName}.deleted_at IS NULL`,
            )
            .innerJoin(
                ProjectTableName,
                `${SpaceTableName}.project_id`,
                `${ProjectTableName}.project_id`,
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .whereNull(`${SavedChartsTableName}.deleted_at`);

        // Get latest versions for these charts
        const latestVersions = this.database
            .select('saved_query_id')
            .max('saved_queries_version_id')
            .from(SavedChartVersionsTableName)
            .whereIn('saved_query_id', relevantCharts)
            .groupBy('saved_query_id')
            .as('latest_versions');

        const results = await this.database
            .select({
                fieldId: `${SavedChartVersionFieldsTableName}.name`,
            })
            .count<{ fieldId: string; count: BigInt }[]>(
                `latest_versions.saved_query_id`,
            )
            .from(SavedChartVersionFieldsTableName)
            .innerJoin(
                latestVersions,
                `${SavedChartVersionFieldsTableName}.saved_queries_version_id`,
                'latest_versions.max',
            )
            .whereIn(`${SavedChartVersionFieldsTableName}.name`, fieldIds)
            .groupBy(`${SavedChartVersionFieldsTableName}.name`);

        return results.map(({ fieldId, count }) => ({
            fieldId,
            count: Number(count), // Count returns by default as BigInt, so we need to cast to number
        }));
    }

    async get(
        savedChartUuidOrSlug: string,
        versionUuid?: string,
        options?: { deleted?: boolean | 'any'; projectUuid?: string },
    ): Promise<SavedChartDAO> {
        return Sentry.startSpan(
            {
                op: 'SavedChartModel.get',
                name: 'SavedChartModel.get',
            },
            async () => {
                const isUuid = isValidUuid(savedChartUuidOrSlug);
                const filterField = isUuid ? 'saved_query_uuid' : 'slug';

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
                    // Join for deleted_by user info
                    .leftJoin(
                        `${UserTableName} as deleted_by_user`,
                        `${SavedChartsTableName}.deleted_by_user_uuid`,
                        'deleted_by_user.user_uuid',
                    )
                    .select<
                        (DbSavedChartDetails & {
                            space_uuid: string;
                            spaceName: string;
                            dashboardName: string | null;
                            slug: string;
                            deleted_at: Date | null;
                            deleted_by_user_uuid: string | null;
                            deleted_by_user_first_name: string | null;
                            deleted_by_user_last_name: string | null;
                        })[]
                    >([
                        `${ProjectTableName}.project_uuid`,
                        `${SavedChartsTableName}.saved_query_id`,
                        `${SavedChartsTableName}.saved_query_uuid`,
                        `${SavedChartsTableName}.name`,
                        `${SavedChartsTableName}.description`,
                        `${SavedChartsTableName}.dashboard_uuid`,
                        `${SavedChartsTableName}.slug`,
                        `${DashboardsTableName}.name as dashboardName`,
                        'saved_queries_versions.saved_queries_version_id',
                        'saved_queries_versions.explore_name',
                        'saved_queries_versions.filters',
                        'saved_queries_versions.row_limit',
                        'saved_queries_versions.metric_overrides',
                        'saved_queries_versions.dimension_overrides',
                        'saved_queries_versions.chart_type',
                        'saved_queries_versions.created_at',
                        'saved_queries_versions.chart_config',
                        'saved_queries_versions.pivot_dimensions',
                        'saved_queries_versions.timezone',
                        'saved_queries_versions.parameters',
                        `${OrganizationTableName}.organization_uuid`,
                        `${UserTableName}.user_uuid`,
                        `${UserTableName}.first_name`,
                        `${UserTableName}.last_name`,
                        `${SpaceTableName}.space_uuid`,
                        `${SpaceTableName}.name as spaceName`,
                        `${PinnedListTableName}.pinned_list_uuid`,
                        `${SavedChartsTableName}.deleted_at`,
                        `${SavedChartsTableName}.deleted_by_user_uuid`,
                        `${SavedChartsTableName}.color_palette_uuid`,
                        'deleted_by_user.first_name as deleted_by_user_first_name',
                        'deleted_by_user.last_name as deleted_by_user_last_name',
                    ])
                    .orderBy('saved_queries_versions.created_at', 'desc')
                    .limit(1);

                // Filter by deleted status: deleted=true gets deleted charts, deleted='any' skips filter, default gets non-deleted
                if (options?.deleted === 'any') {
                    // No filter — find regardless of deleted status
                } else if (options?.deleted) {
                    void chartQuery.whereNotNull(
                        `${SavedChartsTableName}.deleted_at`,
                    );
                } else {
                    void chartQuery.whereNull(
                        `${SavedChartsTableName}.deleted_at`,
                    );
                }

                if (isUuid) {
                    void chartQuery.where((builder) => {
                        void builder
                            .where(
                                `${SavedChartsTableName}.saved_query_uuid`,
                                savedChartUuidOrSlug,
                            )
                            .orWhere(
                                `${SavedChartsTableName}.slug`,
                                savedChartUuidOrSlug,
                            );
                    });
                } else {
                    void chartQuery.where(
                        `${SavedChartsTableName}.slug`,
                        savedChartUuidOrSlug,
                    );
                }

                if (options?.projectUuid) {
                    void chartQuery.where(
                        `${ProjectTableName}.project_uuid`,
                        options.projectUuid,
                    );
                }

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
                const savedQueriesVersionId =
                    savedQuery.saved_queries_version_id;

                const fieldsQuery = this.database(
                    'saved_queries_version_fields',
                )
                    .select(['name', 'field_type', 'order'])
                    .where('saved_queries_version_id', savedQueriesVersionId)
                    .orderBy('order', 'asc');

                const sortsQuery = this.database('saved_queries_version_sorts')
                    .select(['field_name', 'descending', 'nulls_first'])
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
                        'type',
                        'template',
                        'formula',
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
                        'distinct_keys',
                        'filters',
                        'base_dimension_name',
                        'uuid',
                        'compact',
                        'format_options',
                        // PoP metadata (optional)
                        'generation_type',
                        'base_metric_id',
                        'time_dimension_id',
                        'granularity',
                        'period_offset',
                    ])
                    .where('saved_queries_version_id', savedQueriesVersionId);

                const customBinDimensionsQuery = this.database(
                    SavedChartCustomDimensionsTableName,
                ).where('saved_queries_version_id', savedQueriesVersionId);
                const customSqlDimensionsQuery = this.database(
                    SavedChartCustomSqlDimensionsTableName,
                ).where('saved_queries_version_id', savedQueriesVersionId);

                const [
                    fields,
                    sorts,
                    tableCalculations,
                    additionalMetricsRows,
                    customBinDimensionsRows,
                    customSqlDimensionsRows,
                    resolvedPalette,
                ] = await Promise.all([
                    fieldsQuery,
                    sortsQuery,
                    tableCalculationsQuery,
                    additionalMetricsQuery,
                    customBinDimensionsQuery,
                    customSqlDimensionsQuery,
                    this.resolveColorPalette({
                        projectUuid: savedQuery.project_uuid,
                        chartUuid: savedQuery.saved_query_uuid,
                        dashboardUuid: savedQuery.dashboard_uuid ?? undefined,
                    }),
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
                    additionalMetricsFiltered.map(
                        SavedChartModel.convertDbSavedChartAdditionalMetricToAdditionalMetric,
                    );

                const [dimensions, metrics]: [string[], string[]] =
                    fields.reduce<[string[], string[]]>(
                        (result, field) => {
                            result[
                                field.field_type === DBFieldTypes.DIMENSION
                                    ? 0
                                    : 1
                            ].push(field.name);
                            return result;
                        },
                        [[], []],
                    );

                const columnOrder: string[] = [
                    ...fields,
                    ...tableCalculations,
                    ...customBinDimensionsRows,
                ]
                    .sort((a, b) => a.order - b.order)
                    .map((x) => x.name);

                const chartConfig = {
                    type: savedQuery.chart_type,
                    config: savedQuery.chart_config,
                } as ChartConfig;

                const verification =
                    (await this.contentVerificationModel?.getByContent(
                        ContentType.CHART,
                        savedQuery.saved_query_uuid,
                    )) ?? null;

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
                            nullsFirst: sort.nulls_first ?? undefined,
                        })),
                        limit: savedQuery.row_limit,
                        metricOverrides:
                            savedQuery.metric_overrides || undefined,
                        dimensionOverrides:
                            savedQuery.dimension_overrides || undefined,
                        tableCalculations: tableCalculations.map(
                            (tableCalculation) =>
                                ({
                                    name: tableCalculation.name,
                                    displayName: tableCalculation.display_name,
                                    sql:
                                        tableCalculation.calculation_raw_sql ||
                                        undefined,
                                    format:
                                        tableCalculation.format || undefined,
                                    type: tableCalculation.type || undefined,
                                    template:
                                        tableCalculation.template || undefined,
                                    formula:
                                        tableCalculation.formula || undefined,
                                }) as TableCalculation,
                        ),
                        additionalMetrics,
                        customDimensions: [
                            ...(
                                customBinDimensionsRows || []
                            ).map<CustomBinDimension>((cd) => {
                                const base = {
                                    id: cd.id,
                                    name: cd.name,
                                    type: CustomDimensionType.BIN as const,
                                    dimensionId: cd.dimension_id,
                                    table: cd.table,
                                };
                                switch (cd.bin_type) {
                                    case BinType.FIXED_NUMBER:
                                        return {
                                            ...base,
                                            binType: BinType.FIXED_NUMBER,
                                            binNumber: cd.bin_number || 1,
                                        };
                                    case BinType.FIXED_WIDTH:
                                        return {
                                            ...base,
                                            binType: BinType.FIXED_WIDTH,
                                            binWidth: cd.bin_width || 1,
                                        };
                                    case BinType.CUSTOM_RANGE:
                                        return {
                                            ...base,
                                            binType: BinType.CUSTOM_RANGE,
                                            customRange: cd.custom_range || [],
                                        };
                                    case BinType.CUSTOM_GROUP:
                                        return {
                                            ...base,
                                            binType: BinType.CUSTOM_GROUP,
                                            customGroups:
                                                cd.custom_groups || [],
                                        };
                                    default:
                                        throw new Error(
                                            `Unknown bin type "${cd.bin_type}" for custom dimension "${cd.name}"`,
                                        );
                                }
                            }),
                            ...(
                                customSqlDimensionsRows || []
                            ).map<CustomSqlDimension>((cd) => ({
                                id: cd.id,
                                name: cd.name,
                                type: CustomDimensionType.SQL,
                                table: cd.table,
                                sql: cd.sql,
                                dimensionType: cd.dimension_type,
                            })),
                        ],
                        timezone: savedQuery.timezone || undefined,
                    },
                    parameters: savedQuery.parameters || undefined,
                    chartConfig,
                    tableConfig: {
                        columnOrder,
                    },
                    organizationUuid: savedQuery.organization_uuid,
                    ...(savedQuery.pivot_dimensions
                        ? {
                              pivotConfig: {
                                  columns: savedQuery.pivot_dimensions,
                              },
                          }
                        : {}),
                    spaceUuid: savedQuery.space_uuid,
                    spaceName: savedQuery.spaceName,
                    pinnedListUuid: savedQuery.pinned_list_uuid,
                    pinnedListOrder: null,
                    dashboardUuid: savedQuery.dashboard_uuid,
                    dashboardName: savedQuery.dashboardName,
                    colorPalette: resolvedPalette.colors,
                    colorPaletteUuid: savedQuery.color_palette_uuid ?? null,
                    resolvedColorPalette: resolvedPalette,
                    slug: savedQuery.slug,
                    verification,
                    // Soft delete fields (only populated when deleted: true)
                    ...(savedQuery.deleted_at
                        ? {
                              deletedAt: savedQuery.deleted_at,
                              deletedBy: savedQuery.deleted_by_user_uuid
                                  ? {
                                        userUuid:
                                            savedQuery.deleted_by_user_uuid,
                                        firstName:
                                            savedQuery.deleted_by_user_first_name ??
                                            '',
                                        lastName:
                                            savedQuery.deleted_by_user_last_name ??
                                            '',
                                    }
                                  : null,
                          }
                        : {}),
                };
            },
        );
    }

    async getSummary(savedChartUuid: string): Promise<ChartSummary> {
        return Sentry.startSpan(
            {
                op: 'SavedChartModel.getSummary',
                name: 'Get chart summary',
            },
            async () => {
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
            },
        );
    }

    private async getChartsNotInTilesUuids(
        savedCharts: Pick<SavedChartDAO, 'uuid' | 'dashboardUuid'>[],
    ): Promise<string[]> {
        const dashboardUuids = savedCharts.map((chart) => chart.dashboardUuid);
        const getChartsInTilesQuery = this.database(DashboardTileChartTableName)
            .distinct('saved_chart_id')
            .leftJoin(
                DashboardVersionsTableName,
                `${DashboardVersionsTableName}.dashboard_version_id`,
                `${DashboardTileChartTableName}.dashboard_version_id`,
            )
            .leftJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_id`,
                `${DashboardVersionsTableName}.dashboard_id`,
            )
            .whereIn(`${DashboardsTableName}.dashboard_uuid`, dashboardUuids)
            .andWhere(
                // filter by last version
                `${DashboardVersionsTableName}.dashboard_version_id`,
                this.database.raw(`(select dashboard_version_id
                    from ${DashboardVersionsTableName} dv
                    where dv.dashboard_id = ${DashboardsTableName}.dashboard_id
                    order by dv.created_at desc
                    limit 1)`),
            )
            // Exclude NULL saved_chart_id to prevent NOT IN issues
            .whereNotNull(`${DashboardTileChartTableName}.saved_chart_id`);

        const chartsNotInTilesUuids = await this.database(SavedChartsTableName)
            .pluck(`saved_query_uuid`)
            .whereIn(`${SavedChartsTableName}.dashboard_uuid`, dashboardUuids)
            .whereNotIn(`saved_query_id`, getChartsInTilesQuery)
            .whereNull(`${SavedChartsTableName}.deleted_at`);

        return chartsNotInTilesUuids;
    }

    // CTE to get the last version of each chart in the project
    private getProjectChartsLastVersionCTE(
        qb: Knex.QueryBuilder,
        projectUuid: string,
    ) {
        // First, get all chart IDs that belong to this project
        const projectChartIds = this.database
            .select('sq.saved_query_id')
            .from(`${SavedChartsTableName} as sq`)
            .leftJoin(`${DashboardsTableName} as d`, function joinDashboards() {
                this.on('d.dashboard_uuid', '=', 'sq.dashboard_uuid').andOnNull(
                    'd.deleted_at',
                );
            })
            .joinRaw(
                `INNER JOIN ${SpaceTableName} as s ON s.space_id = COALESCE(sq.space_id, d.space_id) AND s.deleted_at IS NULL`,
            )
            .innerJoin(
                `${ProjectTableName} as p`,
                'p.project_id',
                's.project_id',
            )
            .where('p.project_uuid', projectUuid)
            .whereNull('sq.deleted_at');

        // Select latest versions for charts in this project
        const latestVersions = this.database
            .select('saved_query_id')
            .max('saved_queries_version_id as max_version_id')
            .from(SavedChartVersionsTableName)
            .whereIn('saved_query_id', projectChartIds)
            .groupBy('saved_query_id')
            .as('latest');

        return qb.unionAll([
            // First part of UNION - charts in space
            this.database
                .select({
                    saved_query_uuid: 'sq.saved_query_uuid',
                    name: 'sq.name',
                    saved_queries_version_id: 'latest.max_version_id',
                    dashboard_uuid: 'sq.dashboard_uuid',
                })
                .from(`${SavedChartsTableName} as sq`)
                .innerJoin(
                    latestVersions,
                    'latest.saved_query_id',
                    'sq.saved_query_id',
                )
                .innerJoin(
                    `${SpaceTableName} as s`,
                    's.space_id',
                    'sq.space_id',
                )
                .innerJoin(
                    `${ProjectTableName} as p`,
                    'p.project_id',
                    's.project_id',
                )
                .where('p.project_uuid', projectUuid)
                .whereNull('sq.deleted_at'),

            // Second part of UNION - charts saved inside dashboards
            this.database
                .select({
                    saved_query_uuid: 'sq.saved_query_uuid',
                    name: 'sq.name',
                    saved_queries_version_id: 'latest.max_version_id',
                    dashboard_uuid: 'sq.dashboard_uuid',
                })
                .from(`${SavedChartsTableName} as sq`)
                .innerJoin(
                    latestVersions,
                    'latest.saved_query_id',
                    'sq.saved_query_id',
                )
                .innerJoin(
                    `${DashboardsTableName} as d`,
                    'd.dashboard_uuid',
                    'sq.dashboard_uuid',
                )
                .innerJoin(`${SpaceTableName} as s`, 's.space_id', 'd.space_id')
                .innerJoin(
                    `${ProjectTableName} as p`,
                    'p.project_id',
                    's.project_id',
                )
                .where('p.project_uuid', projectUuid)
                .whereNull('sq.deleted_at'),
        ]);
    }

    async findChartsForValidation(
        projectUuid: string,
        chartUuid?: string,
    ): Promise<
        Array<{
            uuid: string;
            name: string;
            tableName: string;
            filters: Filters;
            dimensions: string[];
            metrics: string[];
            tableCalculations: string[];
            customMetrics: string[];
            customMetricsBaseDimensions: string[];
            customBinDimensions: string[];
            customSqlDimensions: string[];
            sorts: string[];
            customMetricsFilters: MetricFilterRule[];
            dashboardUuid: string | undefined;
            chartType: ChartConfig['type'];
            chartConfig: ChartConfig['config'] | undefined;
            pivotDimensions: string[];
        }>
    > {
        // Optimized: Use scalar subqueries instead of multiple LEFT JOINs to avoid cartesian product.
        // Previously, joining 6 child tables caused row explosion (e.g., 5 fields × 2 calcs × 3 metrics = 30+ rows per chart)
        const cteName = 'chart_last_version_cte';
        let query = this.database
            .with(cteName, (qb) =>
                this.getProjectChartsLastVersionCTE(qb, projectUuid),
            )
            .select({
                uuid: `${cteName}.saved_query_uuid`,
                name: `${cteName}.name`,
                dashboardUuid: `${cteName}.dashboard_uuid`,
                tableName: 'saved_queries_versions.explore_name',
                filters: 'saved_queries_versions.filters',
                parameters: 'saved_queries_versions.parameters',
                chartType: 'saved_queries_versions.chart_type',
                chartConfig: 'saved_queries_versions.chart_config',
                pivotDimensions: 'saved_queries_versions.pivot_dimensions',
                dimensions: this.database.raw(
                    `COALESCE((SELECT ARRAY_AGG(DISTINCT svf.name) FROM saved_queries_version_fields svf WHERE svf.saved_queries_version_id = saved_queries_versions.saved_queries_version_id AND svf.field_type = 'dimension'), '{}')`,
                ),
                metrics: this.database.raw(
                    `COALESCE((SELECT ARRAY_AGG(DISTINCT svf.name) FROM saved_queries_version_fields svf WHERE svf.saved_queries_version_id = saved_queries_versions.saved_queries_version_id AND svf.field_type = 'metric'), '{}')`,
                ),
                tableCalculations: this.database.raw(
                    `COALESCE((SELECT ARRAY_AGG(DISTINCT sqvtc.name) FROM saved_queries_version_table_calculations sqvtc WHERE sqvtc.saved_queries_version_id = saved_queries_versions.saved_queries_version_id), '{}')`,
                ),
                customMetrics: this.database.raw(
                    `COALESCE((SELECT ARRAY_AGG(DISTINCT (sqvam.table || '_' || sqvam.name)) FROM saved_queries_version_additional_metrics sqvam WHERE sqvam.saved_queries_version_id = saved_queries_versions.saved_queries_version_id), '{}')`,
                ),
                customMetricsFilters: this.database.raw(
                    `COALESCE((SELECT ARRAY_AGG(sqvam.filters) FROM saved_queries_version_additional_metrics sqvam WHERE sqvam.saved_queries_version_id = saved_queries_versions.saved_queries_version_id AND sqvam.filters IS NOT NULL), '{}')`,
                ),
                customMetricsBaseDimensions: this.database.raw(
                    `COALESCE((SELECT ARRAY_AGG(DISTINCT (sqvam.table || '_' || sqvam.base_dimension_name)) FROM saved_queries_version_additional_metrics sqvam WHERE sqvam.saved_queries_version_id = saved_queries_versions.saved_queries_version_id AND sqvam.base_dimension_name IS NOT NULL), '{}')`,
                ),
                customBinDimensions: this.database.raw(
                    `COALESCE((SELECT ARRAY_AGG(DISTINCT sqvcd.id) FROM saved_queries_version_custom_dimensions sqvcd WHERE sqvcd.saved_queries_version_id = saved_queries_versions.saved_queries_version_id), '{}')`,
                ),
                customSqlDimensions: this.database.raw(
                    `COALESCE((SELECT ARRAY_AGG(DISTINCT sqvcsd.id) FROM saved_queries_version_custom_sql_dimensions sqvcsd WHERE sqvcsd.saved_queries_version_id = saved_queries_versions.saved_queries_version_id), '{}')`,
                ),
                sorts: this.database.raw(
                    `COALESCE((SELECT ARRAY_AGG(DISTINCT sqvs.field_name) FROM saved_queries_version_sorts sqvs WHERE sqvs.saved_queries_version_id = saved_queries_versions.saved_queries_version_id), '{}')`,
                ),
            })
            .from(cteName)
            .leftJoin(
                SavedChartVersionsTableName,
                `${cteName}.saved_queries_version_id`,
                'saved_queries_versions.saved_queries_version_id',
            );

        // Filter by specific chart UUID if provided
        if (chartUuid) {
            query = query.where(`${cteName}.saved_query_uuid`, chartUuid);
        }

        const savedCharts = await query;

        // Filter out charts that are saved in a dashboard and don't belong to any tile in their dashboard last version
        const chartsNotInTilesUuids =
            await this.getChartsNotInTilesUuids(savedCharts);
        return savedCharts
            .map((chart) => ({
                ...chart,
                customMetricsFilters: chart.customMetricsFilters.flat(),
                pivotDimensions: chart.pivotDimensions ?? [],
            }))
            .filter((chart) => !chartsNotInTilesUuids.includes(chart.uuid));
    }

    async getSlugsForUuids(uuids: string[]): Promise<string[]> {
        const charts = await this.database(SavedChartsTableName)
            .whereIn(`${SavedChartsTableName}.saved_query_uuid`, uuids)
            .whereNull(`${SavedChartsTableName}.deleted_at`)
            .select(`${SavedChartsTableName}.slug`);
        return charts.map((chart) => chart.slug);
    }

    async find(filters: {
        projectUuid?: string;
        spaceUuids?: string[];
        slug?: string;
        slugs?: string[];
        exploreName?: string;
        exploreNames?: string[];
        excludeChartsSavedInDashboard?: boolean;
        includeOrphanChartsWithinDashboard?: boolean;
    }): Promise<(ChartSummary & { updatedAt: Date })[]> {
        return Sentry.startSpan(
            {
                op: 'SavedChartModel.find',
                name: 'SavedChartModel.find',
            },
            async () => {
                const query = this.getChartSummaryQuery();
                if (filters.projectUuid) {
                    void query.where(
                        'projects.project_uuid',
                        filters.projectUuid,
                    );
                }

                if (filters.excludeChartsSavedInDashboard) {
                    void query.whereNotNull(`${SavedChartsTableName}.space_id`); // Note: charts saved in dashboards have saved_queries.space_id = null
                }
                if (filters.includeOrphanChartsWithinDashboard) {
                    // Ignore chart_uuid to be in dashboard_tiles
                } else {
                    // Get charts not saved in a dashboard OR the charts saved a dashboard AND used in the latest dashboard version
                    void query
                        .leftJoin(
                            DashboardVersionsTableName,
                            `${DashboardVersionsTableName}.dashboard_id`,
                            '=',
                            `${DashboardsTableName}.dashboard_id`,
                        )
                        .leftJoin(
                            DashboardTileChartTableName,
                            function chartsJoin() {
                                this.on(
                                    `${DashboardTileChartTableName}.dashboard_version_id`,
                                    '=',
                                    `${DashboardVersionsTableName}.dashboard_version_id`,
                                );
                                this.andOn(
                                    `${DashboardTileChartTableName}.saved_chart_id`,
                                    '=',
                                    `${SavedChartsTableName}.saved_query_id`,
                                );
                            },
                        )
                        .where((whereBuilder) => {
                            void whereBuilder
                                .whereNull(
                                    `${DashboardsTableName}.dashboard_id`,
                                )
                                .orWhere((orWhereBuilder) => {
                                    void orWhereBuilder
                                        .whereNotNull(
                                            `${DashboardTileChartTableName}.saved_chart_id`,
                                        )
                                        .andWhere(
                                            `${DashboardVersionsTableName}.created_at`,
                                            '=',
                                            this.database
                                                .from(
                                                    DashboardVersionsTableName,
                                                )
                                                .max('created_at')
                                                .where(
                                                    `${DashboardVersionsTableName}.dashboard_id`,
                                                    this.database.ref(
                                                        `${DashboardsTableName}.dashboard_id`,
                                                    ),
                                                ),
                                        );
                                });
                        })
                        // Deduplicate results since dashboard_versions JOIN can produce
                        // multiple rows when a chart appears in multiple dashboard versions
                        .distinctOn(`${SavedChartsTableName}.saved_query_uuid`);
                }

                if (filters.spaceUuids) {
                    void query.whereIn(
                        `${SpaceTableName}.space_uuid`,
                        filters.spaceUuids,
                    );
                }
                if (filters.slug) {
                    void query.where(
                        `${SavedChartsTableName}.slug`,
                        filters.slug,
                    );
                }
                if (filters.slugs) {
                    void query.whereIn(
                        `${SavedChartsTableName}.slug`,
                        filters.slugs,
                    );
                }

                if (filters.exploreName) {
                    // TODO: Explore name is not an index in saved_queries_versions
                    // This is something we could easily optimize (requires migration)
                    void query
                        .leftJoin(
                            SavedChartVersionsTableName,
                            `${SavedChartVersionsTableName}.saved_query_id`,
                            `${SavedChartsTableName}.saved_query_id`,
                        )
                        .where(
                            'saved_queries_versions.explore_name',
                            filters.exploreName,
                        )
                        .distinctOn(`${SavedChartsTableName}.saved_query_uuid`);
                }
                if (filters.exploreNames) {
                    void query
                        .leftJoin(
                            SavedChartVersionsTableName,
                            `${SavedChartVersionsTableName}.saved_query_id`,
                            `${SavedChartsTableName}.saved_query_id`,
                        )
                        .whereIn(
                            'saved_queries_versions.explore_name',
                            filters.exploreNames,
                        )
                        .distinctOn(`${SavedChartsTableName}.saved_query_uuid`);
                }
                const chartSummaries = await query;
                return chartSummaries.map((chart) => ({
                    ...chart,
                    chartType: getChartType(chart.chartKind),
                }));
            },
        );
    }

    private getChartSummaryQuery() {
        return this.database(SavedChartsTableName)
            .select({
                uuid: `${SavedChartsTableName}.saved_query_uuid`,
                name: `${SavedChartsTableName}.name`,
                description: `${SavedChartsTableName}.description`,
                spaceUuid: `${SpaceTableName}.space_uuid`,
                spaceName: `${SpaceTableName}.name`,
                projectUuid: 'projects.project_uuid',
                organizationUuid: 'organizations.organization_uuid',
                pinnedListUuid: `${PinnedListTableName}.pinned_list_uuid`,
                chartKind: `${SavedChartsTableName}.last_version_chart_kind`,
                dashboardUuid: `${DashboardsTableName}.dashboard_uuid`,
                dashboardName: `${DashboardsTableName}.name`,
                updatedAt: `${SavedChartsTableName}.last_version_updated_at`,
                slug: `${SavedChartsTableName}.slug`,
                viewsCount: `${SavedChartsTableName}.views_count`,
            })
            .leftJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${SavedChartsTableName}.dashboard_uuid`,
            )
            .joinRaw(
                `INNER JOIN ${SpaceTableName} ON ${SpaceTableName}.space_id = COALESCE(${SavedChartsTableName}.space_id, ${DashboardsTableName}.space_id) AND ${SpaceTableName}.deleted_at IS NULL`,
            )
            .leftJoin(
                'projects',
                `${SpaceTableName}.project_id`,
                'projects.project_id',
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
            .whereNull(`${SavedChartsTableName}.deleted_at`);
    }

    async getInfoForAvailableFilters(savedChartUuids: string[]): Promise<
        ({
            spaceUuid: Space['uuid'];
        } & Pick<SavedChartDAO, 'uuid' | 'name' | 'tableName'> &
            Pick<Project, 'projectUuid'> &
            Pick<Organization, 'organizationUuid'>)[]
    > {
        const charts = await this.database(SavedChartsTableName)
            .whereIn(
                `${SavedChartsTableName}.saved_query_uuid`,
                savedChartUuids,
            )
            .select({
                uuid: `${SavedChartsTableName}.saved_query_uuid`,
                name: `${SavedChartsTableName}.name`,
                spaceUuid: `${SpaceTableName}.space_uuid`,
                tableName: `${SavedChartVersionsTableName}.explore_name`,
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
                SavedChartVersionsTableName,
                `${SavedChartsTableName}.saved_query_id`,
                'saved_queries_versions.saved_query_id',
            )
            .leftJoin(
                'projects',
                `${SpaceTableName}.project_id`,
                'projects.project_id',
            )
            .leftJoin(
                OrganizationTableName,
                'organizations.organization_id',
                'projects.organization_id',
            )
            .where(
                // filter by last version
                `saved_queries_version_id`,
                this.database.raw(`(select saved_queries_version_id
                                           from ${SavedChartVersionsTableName}
                                           where ${SavedChartsTableName}.saved_query_id = ${SavedChartVersionsTableName}.saved_query_id
                                           order by ${SavedChartVersionsTableName}.created_at desc
                                           limit 1)`),
            )
            .whereNull(`${SavedChartsTableName}.deleted_at`)
            .whereNull(`${SpaceTableName}.deleted_at`);

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
        return this.database(SavedChartsTableName)
            .select({
                uuid: `${SavedChartsTableName}.saved_query_uuid`,
                name: `${SavedChartsTableName}.name`,
                description: `${SavedChartsTableName}.description`,
                tableName: `${SavedChartVersionsTableName}.explore_name`,
                firstName: `${UserTableName}.first_name`,
                lastName: `${UserTableName}.last_name`,
            })
            .innerJoin(
                SavedChartVersionsTableName,
                `${SavedChartsTableName}.saved_query_id`,
                'saved_queries_versions.saved_query_id',
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
            .leftJoin(
                'projects',
                `${SpaceTableName}.project_id`,
                'projects.project_id',
            )
            .leftJoin(
                UserTableName,
                `${SavedChartVersionsTableName}.updated_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .where('projects.project_uuid', projectUuid)
            .where(
                // filter by last version
                `saved_queries_version_id`,
                this.database.raw(`(select saved_queries_version_id
                                           from ${SavedChartVersionsTableName}
                                           where ${SavedChartsTableName}.saved_query_id = ${SavedChartVersionsTableName}.saved_query_id
                                           order by ${SavedChartVersionsTableName}.created_at desc
                                           limit 1)`),
            )
            .whereNull(`${SavedChartsTableName}.deleted_at`)
            .whereNull(`${SpaceTableName}.deleted_at`);
    }

    async findChartsWithCustomFields(projectUuid: string): Promise<
        Array<{
            uuid: string;
            name: string;
            tableName: string;
            dashboardUuid: string | null;
            customMetrics: AdditionalMetric[];
        }>
    > {
        const cteName = 'chart_last_version_cte';
        const savedCharts = await this.database
            .with(cteName, (qb) =>
                this.getProjectChartsLastVersionCTE(qb, projectUuid),
            )
            .select({
                uuid: `${cteName}.saved_query_uuid`,
                name: `${cteName}.name`,
                dashboardUuid: `${cteName}.dashboard_uuid`,
                tableName: 'saved_queries_versions.explore_name',
                customMetrics: this.database.raw(
                    "COALESCE(jsonb_agg(sqvam) FILTER (WHERE sqvam.name IS NOT NULL), '[]')",
                ),
            })
            .from(cteName)
            .leftJoin(
                SavedChartVersionsTableName,
                `${cteName}.saved_queries_version_id`,
                'saved_queries_versions.saved_queries_version_id',
            )
            .leftJoin(
                'saved_queries_version_additional_metrics as sqvam',
                'saved_queries_versions.saved_queries_version_id',
                'sqvam.saved_queries_version_id',
            )
            .groupBy(1, 2, 3, 4)
            .havingRaw(
                'jsonb_agg(sqvam) FILTER (WHERE sqvam.name IS NOT NULL) IS NOT NULL',
            );

        // Filter out charts that are saved in a dashboard and don't belong to any tile in their dashboard last version
        const chartsNotInTilesUuids =
            await this.getChartsNotInTilesUuids(savedCharts);
        return savedCharts
            .filter((chart) => !chartsNotInTilesUuids.includes(chart.uuid))
            .map((chart) => ({
                ...chart,
                customMetrics: chart.customMetrics.map(
                    SavedChartModel.convertDbSavedChartAdditionalMetricToAdditionalMetric,
                ),
            }));
    }

    async moveToSpace(
        {
            projectUuid,
            itemUuid: savedChartUuid,
            targetSpaceUuid,
        }: {
            projectUuid: string;
            itemUuid: string;
            targetSpaceUuid: string | null;
        },
        { tx = this.database }: { tx?: Knex } = {},
    ): Promise<void> {
        if (targetSpaceUuid === null) {
            throw new Error('Cannot move saved chart out of a space');
        }

        const space = await tx(SpaceTableName)
            .select('space_id')
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .where('space_uuid', targetSpaceUuid)
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .first();

        if (!space) {
            throw new NotFoundError('Space not found');
        }

        const updateCount = await tx(SavedChartsTableName)
            // if we move a chart from a dashboard to a space, we need to set the dashboard_uuid to null
            .update({ space_id: space.space_id, dashboard_uuid: null })
            .where('saved_query_uuid', savedChartUuid)
            .whereNull('deleted_at');

        if (updateCount !== 1) {
            throw new Error('Failed to move saved chart to space');
        }
    }

    /**
     * Get deleted charts for a project with optional filters
     */
    async getDeletedCharts(
        projectUuid: string,
        filters: DeletedContentFilters,
        paginateArgs?: KnexPaginateArgs,
        userUuid?: string,
    ): Promise<KnexPaginatedData<DeletedDbtChartContentSummary[]>> {
        const query = this.database(SavedChartsTableName)
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
                `${ProjectTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
            .leftJoin(
                UserTableName,
                `${SavedChartsTableName}.deleted_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .select<
                {
                    uuid: string;
                    name: string;
                    description: string | null;
                    chart_kind: ChartKind | null;
                    deleted_at: Date;
                    deleted_by_user_uuid: string | null;
                    first_name: string | null;
                    last_name: string | null;
                    space_uuid: string;
                    space_name: string;
                    project_uuid: string;
                    organization_uuid: string;
                }[]
            >([
                `${SavedChartsTableName}.saved_query_uuid as uuid`,
                `${SavedChartsTableName}.name`,
                `${SavedChartsTableName}.description`,
                `${SavedChartsTableName}.last_version_chart_kind as chart_kind`,
                `${SavedChartsTableName}.deleted_at`,
                `${SavedChartsTableName}.deleted_by_user_uuid`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${SpaceTableName}.space_uuid`,
                `${SpaceTableName}.name as space_name`,
                `${ProjectTableName}.project_uuid`,
                `${OrganizationTableName}.organization_uuid`,
            ])
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .whereNotNull(`${SavedChartsTableName}.deleted_at`);

        // Filter by user if not admin (when userUuid is provided)
        if (userUuid) {
            void query.where(
                `${SavedChartsTableName}.deleted_by_user_uuid`,
                userUuid,
            );
        }

        // Apply search filter
        if (filters.search) {
            void query.whereILike(
                `${SavedChartsTableName}.name`,
                `%${filters.search}%`,
            );
        }

        // Apply deletedByUserUuids filter
        if (
            filters.deletedByUserUuids &&
            filters.deletedByUserUuids.length > 0
        ) {
            void query.whereIn(
                `${SavedChartsTableName}.deleted_by_user_uuid`,
                filters.deletedByUserUuids,
            );
        }

        // Order by deleted_at descending (most recently deleted first)
        void query.orderBy(`${SavedChartsTableName}.deleted_at`, 'desc');

        const { pagination, data } = await KnexPaginate.paginate(
            query,
            paginateArgs,
        );

        return {
            pagination,
            data: data.map((chart) => ({
                uuid: chart.uuid,
                name: chart.name,
                description: chart.description,
                contentType: ContentType.CHART as const,
                source: ChartSourceType.DBT_EXPLORE,
                chartKind: chart.chart_kind,
                deletedAt: chart.deleted_at,
                deletedBy: chart.deleted_by_user_uuid
                    ? {
                          userUuid: chart.deleted_by_user_uuid,
                          firstName: chart.first_name ?? '',
                          lastName: chart.last_name ?? '',
                      }
                    : null,
                spaceUuid: chart.space_uuid,
                spaceName: chart.space_name,
                projectUuid: chart.project_uuid,
                organizationUuid: chart.organization_uuid,
            })),
        };
    }

    /**
     * Restore a soft-deleted chart
     */
    async restore(savedChartUuid: string): Promise<void> {
        const updateCount = await this.database(SavedChartsTableName)
            .update({
                deleted_at: null,
                deleted_by_user_uuid: null,
            })
            .where('saved_query_uuid', savedChartUuid)
            .whereNotNull('deleted_at');

        if (updateCount !== 1) {
            throw new NotFoundError('Deleted chart not found');
        }
    }

    /**
     * Rollback a chart to the version that was active at the given timestamp.
     * Returns undefined if no version existed at that time.
     */
    async rollbackToVersionAtTimestamp(
        savedChartUuid: string,
        targetTimestamp: Date,
        user: SessionUser,
        tx?: Knex,
    ): Promise<SavedChartDAO | undefined> {
        const version = await this.getVersionSummaryAtTimestamp(
            savedChartUuid,
            targetTimestamp,
        );
        if (!version) {
            return undefined;
        }
        const chartVersion = await this.get(
            savedChartUuid,
            version.versionUuid,
        );
        return this.createVersion(savedChartUuid, chartVersion, user, tx);
    }
}
