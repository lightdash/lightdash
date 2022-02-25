import {
    CreateSavedChart,
    CreateSavedChartVersion,
    DBChartTypes,
    DBFieldTypes,
    SavedChart,
    SortField,
    UpdateSavedChart,
    ChartConfig,
    CartesianChartConfig,
} from 'common';
import { Knex } from 'knex';
import { NotFoundError } from '../../errors';
import database from '../database';
import { getSpace } from './spaces';

export const SavedQueriesTableName = 'saved_queries';
export const SavedQueriesVersionsTableName = 'saved_queries_versions';

type DbSavedChart = {
    saved_query_id: number;
    saved_query_uuid: string;
    space_id: number;
    name: string;
    created_at: Date;
};

export type SavedChartTable = Knex.CompositeTableType<
    DbSavedChart,
    Pick<DbSavedChart, 'name' | 'space_id'>,
    Pick<DbSavedChart, 'name'>
>;

export type DbSavedChartVersion = {
    saved_queries_version_id: number;
    saved_queries_version_uuid: string;
    created_at: Date;
    explore_name: string;
    filters: any;
    row_limit: number;
    chart_type: 'big_number' | 'table' | 'cartesian';
    saved_query_id: number;
    chart_config: ChartConfig['config'];
    pivot_dimensions: string[];
};

export type SavedChartVersionsTable = Knex.CompositeTableType<
    DbSavedChartVersion,
    CreateDbSavedChartVersion
>;

export type CreateDbSavedChartVersion = Pick<
    DbSavedChartVersion,
    | 'saved_query_id'
    | 'explore_name'
    | 'filters'
    | 'row_limit'
    | 'chart_type'
    | 'pivot_dimensions'
    | 'chart_config'
>;

type DbSavedChartVersionYMetric = {
    saved_queries_version_y_metric_id: number;
    saved_queries_version_id: number;
    field_name: string;
    order: number;
};

type CreateDbSavedChartVersionYMetric = Pick<
    DbSavedChartVersionYMetric,
    'field_name' | 'saved_queries_version_id' | 'order'
>;

type DbSavedChartVersionField = {
    saved_queries_version_field_id: number;
    saved_queries_version_id: number;
    name: string;
    field_type: DBFieldTypes;
    order: number;
};

type CreateDbSavedChartVersionField = Pick<
    DbSavedChartVersionField,
    'saved_queries_version_id' | 'name' | 'field_type' | 'order'
>;

export const SavedChartVersionFieldsTableName = 'saved_queries_version_fields';
export type SavedChartVersionFieldsTable = Knex.CompositeTableType<
    DbSavedChartVersionField,
    CreateDbSavedChartVersionField
>;

type DbSavedChartVersionSort = {
    saved_queries_version_sort_id: number;
    saved_queries_version_id: number;
    field_name: string;
    descending: boolean;
    order: number;
};

type CreateDbSavedChartVersionSort = Pick<
    DbSavedChartVersionSort,
    'saved_queries_version_id' | 'field_name' | 'descending' | 'order'
>;

export const SavedChartVersionSortsTableName = 'saved_queries_version_sorts';
export type SavedChartVersionSortsTable = Knex.CompositeTableType<
    DbSavedChartVersionSort,
    CreateDbSavedChartVersionSort
>;

export const SavedChartTableCalculationTableName =
    'saved_queries_version_table_calculations';
export type DbSavedChartTableCalculation = {
    saved_queries_version_table_calculations_id: number;
    name: string;
    display_name: string;
    order: number;
    calculation_raw_sql: string;
    saved_queries_version_id: number;
};

type DbSavedChartTableCalculationInsert = Omit<
    DbSavedChartTableCalculation,
    'saved_queries_version_table_calculations_id'
>;
export type SavedChartTableCalculationTable = Knex.CompositeTableType<
    DbSavedChartTableCalculation,
    DbSavedChartTableCalculationInsert
>;

export const getSavedChartByUuid = async (
    db: Knex,
    savedQueryUuid: string,
): Promise<SavedChart> => {};

const createSavedChartVersionYMetric = async (
    db: Knex,
    data: CreateDbSavedChartVersionYMetric,
): Promise<DbSavedChartVersionYMetric> => {
    const results = await db<DbSavedChartVersionYMetric>(
        'saved_queries_version_y_metrics',
    )
        .insert<CreateDbSavedChartVersionYMetric>(data)
        .returning('*');
    return results[0];
};

export const deleteSavedChart = async (
    db: Knex,
    savedQueryUuid: string,
): Promise<void> => {
    await db<DbSavedChart>('saved_queries')
        .where('saved_query_uuid', savedQueryUuid)
        .delete();
};

export const updateSavedChart = async (
    savedQueryUuid: string,
    data: UpdateSavedChart,
): Promise<SavedChart> => {
    await database<DbSavedChart>('saved_queries')
        .update<UpdateSavedChart>(data)
        .where('saved_query_uuid', savedQueryUuid);
    return getSavedChartByUuid(database, savedQueryUuid);
};

const createSavedChartVersionField = async (
    db: Knex,
    data: CreateDbSavedChartVersionField,
): Promise<DbSavedChartVersionField> => {
    const results = await db<DbSavedChartVersionField>(
        'saved_queries_version_fields',
    )
        .insert<CreateDbSavedChartVersionField>(data)
        .returning('*');
    return results[0];
};

const createSavedChartVersionSort = async (
    db: Knex,
    data: CreateDbSavedChartVersionSort,
): Promise<DbSavedChartVersionSort> => {
    const results = await db<DbSavedChartVersionSort>(
        'saved_queries_version_sorts',
    )
        .insert<CreateDbSavedChartVersionSort>(data)
        .returning('*');
    return results[0];
};

const createSavedChartVersionTableCalculation = async (
    db: Knex,
    data: DbSavedChartTableCalculationInsert,
): Promise<DbSavedChartTableCalculation> => {
    const results = await db('saved_queries_version_table_calculations')
        .insert(data)
        .returning('*');
    return results[0];
};

export const createSavedChartVersion = async (
    db: Knex,
    savedQueryId: number,
    {
        tableName,
        metricQuery: {
            limit,
            filters,
            dimensions,
            metrics,
            sorts,
            tableCalculations,
        },
        chartConfig,
        tableConfig,
    }: CreateSavedChartVersion,
): Promise<void> => {
    await db.transaction(async (trx) => {
        const pivotDimensions = chartConfig.seriesLayout.groupDimension
            ? [chartConfig.seriesLayout.groupDimension]
            : undefined;
        let convertedChartType: DbSavedChartVersion['chart_type'] = 'cartesian';
        let convertedChartConfig:
            | DbSavedChartVersion['chart_config']
            | undefined;
        switch (chartConfig.chartType) {
            case DBChartTypes.BIG_NUMBER:
                convertedChartType = 'big_number';
                convertedChartConfig = undefined;
                break;
            case DBChartTypes.TABLE:
                convertedChartType = 'table';
                convertedChartConfig = undefined;
                break;
            case DBChartTypes.COLUMN:
            case DBChartTypes.LINE:
            case DBChartTypes.SCATTER:
            case DBChartTypes.BAR:
                convertedChartType = 'cartesian';
                const { xDimension } = chartConfig.seriesLayout;
                let cartesianType: CartesianChartConfig['config']['series'][number]['type'];
                switch (chartConfig.chartType) {
                    case DBChartTypes.BAR:
                    case DBChartTypes.COLUMN:
                        cartesianType = 'bar';
                        break;
                    case DBChartTypes.LINE:
                        cartesianType = 'line';
                        break;
                    case DBChartTypes.SCATTER:
                        cartesianType = 'scatter';
                        break;
                    default:
                        const never: never = chartConfig.chartType;
                }
                if (xDimension && chartConfig.seriesLayout.yMetrics) {
                    convertedChartConfig = {
                        series: chartConfig.seriesLayout.yMetrics.map<
                            CartesianChartConfig['config']['series'][number]
                        >((yField) => ({
                            xField: xDimension,
                            yField,
                            type: cartesianType,
                            flipAxes:
                                chartConfig.chartType === DBChartTypes.BAR,
                        })),
                    };
                } else {
                    convertedChartConfig = { series: [] };
                }
                break;
            default:
                const never: never = chartConfig.chartType;
        }
        try {
            const results = await trx<DbSavedChartVersion>(
                'saved_queries_versions',
            )
                .insert<CreateDbSavedChartVersion>({
                    row_limit: limit,
                    filters: JSON.stringify(filters),
                    explore_name: tableName,
                    saved_query_id: savedQueryId,
                    pivot_dimensions: pivotDimensions,
                    chart_type: convertedChartType,
                    chart_config: convertedChartConfig,
                })
                .returning('*');
            const version = results[0];

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

            await Promise.all(promises);
        } catch (e) {
            await trx.rollback(e);
            throw e;
        }
    });
};

export const createSavedChart = async (
    projectUuid: string,
    {
        name,
        tableName,
        metricQuery,
        chartConfig,
        tableConfig,
    }: CreateSavedChart,
): Promise<SavedChart> => {
    const newSavedChartUuid = await database.transaction(async (trx) => {
        try {
            const space = await getSpace(trx, projectUuid);

            const results = await trx<DbSavedChart>('saved_queries')
                .insert<Pick<DbSavedChart, 'name'>>({
                    name,
                    space_id: space.space_id,
                })
                .returning('*');
            const newSavedChart = results[0];

            await createSavedChartVersion(trx, newSavedChart.saved_query_id, {
                tableName,
                metricQuery,
                chartConfig,
                tableConfig,
            });

            return newSavedChart.saved_query_uuid;
        } catch (e) {
            await trx.rollback(e);
            throw e;
        }
    });
    return getSavedChartByUuid(database, newSavedChartUuid);
};

export const addSavedChartVersion = async (
    savedQueryUuid: string,
    data: CreateSavedChartVersion,
): Promise<SavedChart> => {
    await database.transaction(async (trx) => {
        try {
            const savedQuery = await database<DbSavedChart>('saved_queries')
                .select<{ saved_query_id: number }[]>([
                    'saved_queries.saved_query_id',
                ])
                .where('saved_query_uuid', savedQueryUuid)
                .limit(1);

            await createSavedChartVersion(
                trx,
                savedQuery[0].saved_query_id,
                data,
            );
        } catch (e) {
            await trx.rollback(e);
            throw e;
        }
    });
    return getSavedChartByUuid(database, savedQueryUuid);
};
