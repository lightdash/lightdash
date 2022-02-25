import { Knex } from 'knex';
import { ChartConfig, DBFieldTypes, SavedChart, SortField } from 'common';
import { NotFoundError } from '../errors';

type DbSavedChartDetails = {
    project_uuid: string;
    saved_query_id: number;
    saved_query_uuid: string;
    name: string;
    saved_queries_version_id: number;
    explore_name: string;
    filters: any;
    row_limit: number;
    chart_type: ChartConfig['type'];
    chart_config: ChartConfig['config'] | undefined;
    pivot_dimensions: string[] | undefined;
    created_at: Date;
};

export class SessionModel {
    private database: Knex;

    constructor(database: Knex) {
        this.database = database;
    }

    async getSavedChartByUuid(savedChartUuid: string): Promise<SavedChart> {
        const [savedQuery] = await this.database<DbSavedChartDetails>(
            'saved_queries',
        )
            .innerJoin('spaces', 'saved_queries.space_id', 'spaces.space_id')
            .innerJoin('projects', 'spaces.project_id', 'projects.project_id')
            .innerJoin(
                'saved_queries_versions',
                'saved_queries.saved_query_id',
                'saved_queries_versions.saved_query_id',
            )
            .select<DbSavedChartDetails[]>([
                'projects.project_uuid',
                'saved_queries.saved_query_id',
                'saved_queries.saved_query_uuid',
                'saved_queries.name',
                'saved_queries_versions.saved_queries_version_id',
                'saved_queries_versions.explore_name',
                'saved_queries_versions.filters',
                'saved_queries_versions.row_limit',
                'saved_queries_versions.chart_type',
                'saved_queries_versions.created_at',
                'saved_queries_versions.chart_config',
                'saved_queries_versions.pivot_dimensions',
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
            tableName: savedQuery.explore_name,
            updatedAt: savedQuery.created_at,
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
            },
            chartConfig,
            tableConfig: {
                columnOrder,
            },
            ...(savedQuery.pivot_dimensions
                ? { pivotConfig: { columns: savedQuery.pivot_dimensions } }
                : {}),
        };
    }
}
