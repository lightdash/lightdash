import {
    ChartConfig,
    CreateSavedChart,
    CreateSavedChartVersion,
    DBFieldTypes,
    NotFoundError,
    SavedChart,
    SessionUser,
    SortField,
    UpdatedByUser,
    UpdateMultipleSavedChart,
    UpdateSavedChart,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    CreateDbSavedChartVersionField,
    CreateDbSavedChartVersionSort,
    DbSavedChartAdditionalMetricInsert,
    DbSavedChartTableCalculationInsert,
    SavedChartAdditionalMetricTableName,
} from '../database/entities/savedCharts';
import { getSpace, getSpaceId } from '../database/entities/spaces';

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
        try {
            const [version] = await trx('saved_queries_versions')
                .insert({
                    row_limit: limit,
                    filters: JSON.stringify(filters),
                    explore_name: tableName,
                    saved_query_id: savedChartId,
                    pivot_dimensions: pivotConfig
                        ? pivotConfig.columns
                        : undefined,
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
                        saved_queries_version_id:
                            version.saved_queries_version_id,
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
                        saved_queries_version_id:
                            version.saved_queries_version_id,
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
                        saved_queries_version_id:
                            version.saved_queries_version_id,
                        order: index,
                    }),
                );
            });
            tableCalculations.forEach((tableCalculation, index) => {
                promises.push(
                    createSavedChartVersionTableCalculation(trx, {
                        name: tableCalculation.name,
                        display_name: tableCalculation.displayName,
                        calculation_raw_sql: tableCalculation.sql,
                        saved_queries_version_id:
                            version.saved_queries_version_id,
                        order: tableConfig.columnOrder.findIndex(
                            (column) => column === tableCalculation.name,
                        ),
                    }),
                );
            });
            additionalMetrics?.forEach((additionalMetric, index) => {
                promises.push(
                    createSavedChartVersionAdditionalMetrics(trx, {
                        table: additionalMetric.table,
                        name: additionalMetric.name,
                        type: additionalMetric.type,
                        label: additionalMetric.label,
                        description: additionalMetric.description,
                        sql: additionalMetric.sql,
                        hidden: additionalMetric.hidden,
                        round: additionalMetric.round,
                        format: additionalMetric.format,
                        saved_queries_version_id:
                            version.saved_queries_version_id,
                    }),
                );
            });
            await Promise.all(promises);
        } catch (e: any) {
            await trx.rollback(e);
            throw e;
        }
    });
};

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
        }: CreateSavedChart & { updatedByUser: UpdatedByUser },
    ): Promise<SavedChart> {
        const newSavedChartUuid = await this.database.transaction(
            async (trx) => {
                try {
                    const spaceId = spaceUuid
                        ? await getSpaceId(trx, spaceUuid)
                        : await (
                              await getSpace(trx, projectUuid)
                          ).space_id;
                    const [newSavedChart] = await trx('saved_queries')
                        .insert({ name, space_id: spaceId, description })
                        .returning('*');
                    await createSavedChartVersion(
                        trx,
                        newSavedChart.saved_query_id,
                        {
                            tableName,
                            metricQuery,
                            chartConfig,
                            tableConfig,
                            pivotConfig,
                            updatedByUser,
                        },
                    );
                    return newSavedChart.saved_query_uuid;
                } catch (e: any) {
                    await trx.rollback(e);
                    throw e;
                }
            },
        );
        return this.get(newSavedChartUuid);
    }

    async createVersion(
        savedChartUuid: string,
        data: CreateSavedChartVersion,
        user: SessionUser,
    ): Promise<SavedChart> {
        await this.database.transaction(async (trx) => {
            try {
                const [savedChart] = await trx('saved_queries')
                    .select(['saved_query_id'])
                    .where('saved_query_uuid', savedChartUuid);

                await createSavedChartVersion(trx, savedChart.saved_query_id, {
                    ...data,
                    updatedByUser: user,
                });
            } catch (e: any) {
                trx.rollback(e);
                throw e;
            }
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
            })
            .where('saved_query_uuid', savedChartUuid);
        return this.get(savedChartUuid);
    }

    async updateMultiple(
        data: UpdateMultipleSavedChart[],
    ): Promise<SavedChart[]> {
        await this.database.transaction(async (trx) => {
            try {
                const promises = data.map(async (savedChart) =>
                    trx('saved_queries')
                        .update({
                            name: savedChart.name,
                            description: savedChart.description,
                            space_id: await getSpaceId(
                                trx,
                                savedChart.spaceUuid,
                            ),
                        })
                        .where('saved_query_uuid', savedChart.uuid),
                );
                await Promise.all(promises);
            } catch (e: any) {
                trx.rollback(e);
                throw e;
            }
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
        const [savedQuery] = await this.database<DbSavedChartDetails>(
            'saved_queries',
        )
            .innerJoin('spaces', 'saved_queries.space_id', 'spaces.space_id')
            .innerJoin('projects', 'spaces.project_id', 'projects.project_id')
            .innerJoin(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .innerJoin(
                'saved_queries_versions',
                'saved_queries.saved_query_id',
                'saved_queries_versions.saved_query_id',
            )
            .leftJoin(
                'users',
                'saved_queries_versions.updated_by_user_uuid',
                'users.user_uuid',
            )
            .select<
                (DbSavedChartDetails & {
                    space_uuid: string;
                    spaceName: string;
                })[]
            >([
                'projects.project_uuid',
                'saved_queries.saved_query_id',
                'saved_queries.saved_query_uuid',
                'saved_queries.name',
                'saved_queries.description',
                'saved_queries_versions.saved_queries_version_id',
                'saved_queries_versions.explore_name',
                'saved_queries_versions.filters',
                'saved_queries_versions.row_limit',
                'saved_queries_versions.chart_type',
                'saved_queries_versions.created_at',
                'saved_queries_versions.chart_config',
                'saved_queries_versions.pivot_dimensions',
                'organizations.organization_uuid',
                'users.user_uuid',
                'users.first_name',
                'users.last_name',
                'spaces.space_uuid',
                'spaces.name as spaceName',
            ])
            .where('saved_query_uuid', savedChartUuid)
            .orderBy('saved_queries_versions.created_at', 'desc')
            .limit(1);
        if (savedQuery === undefined) {
            throw new NotFoundError('Saved query not found');
        }
        const fields = await this.database('saved_queries_version_fields')
            .select(['name', 'field_type', 'order'])
            .where(
                'saved_queries_version_id',
                savedQuery.saved_queries_version_id,
            )
            .orderBy('order', 'asc');
        const sorts = await this.database('saved_queries_version_sorts')
            .select(['field_name', 'descending'])
            .where(
                'saved_queries_version_id',
                savedQuery.saved_queries_version_id,
            )
            .orderBy('order', 'asc');
        const tableCalculations = await this.database(
            'saved_queries_version_table_calculations',
        )
            .select(['name', 'display_name', 'calculation_raw_sql', 'order'])
            .where(
                'saved_queries_version_id',
                savedQuery.saved_queries_version_id,
            );
        const additionalMetrics = await this.database(
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
            ])
            .where(
                'saved_queries_version_id',
                savedQuery.saved_queries_version_id,
            );

        // Filters out "null" fields
        const additionalMetricsFiltered = additionalMetrics.map((addMetric) =>
            Object.keys(addMetric).reduce(
                (acc, key) => ({
                    ...acc,
                    [key]: addMetric[key] !== null ? addMetric[key] : undefined,
                }),
                { ...addMetric },
            ),
        );

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
                    }),
                ),
                additionalMetrics: additionalMetricsFiltered,
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
        };
    }
}
