import {
    VIZ_DEFAULT_AGGREGATION,
    type DashboardFilters,
    type PivotChartData,
    type QueryExecutionContext,
    type RunPivotQuery,
    type SemanticLayerField,
    type SemanticLayerQuery,
    type SortField,
    type SqlRunnerPivotQueryBody,
    type VizColumn,
    type VizSortBy,
} from '@lightdash/common';
import { getVizIndexTypeFromSemanticLayerFieldType } from './BaseResultsRunner';
import {
    executeDashboardSqlChartPivotQuery,
    executeSqlChartPivotQuery,
    executeSqlPivotQuery,
} from './executeQuery';

// TODO: REMOVE THIS - temporary mapping logic - also needs access to fields :(
const convertSemanticLayerQueryToSqlRunnerPivotQuery = (
    query: SemanticLayerQuery,
    fields: SemanticLayerField[],
): Pick<
    SqlRunnerPivotQueryBody,
    'indexColumn' | 'groupByColumns' | 'valuesColumns'
> => {
    const index = fields.find((field) => field.name === query.pivot?.index[0]);
    const values = query.pivot?.values.map((value) => {
        const customMetric = query.customMetrics?.find(
            (metric) => metric.name === value,
        );

        // This should never be true
        if (!customMetric || customMetric.baseDimension === undefined) {
            throw new Error(
                'Unexpected error: incorrect pivot configuration, no metric',
            );
        }
        return {
            name: customMetric.baseDimension,
            aggregation: customMetric.aggType,
        };
    });
    const groupBy = query.pivot?.on.map((on) => {
        const f = fields.find((field) => field.name === on);
        if (!f) {
            throw new Error(
                'Unexpected error: incorrect pivot configuration, invalid groupBy',
            );
        }
        return f;
    });

    if (index === undefined || values === undefined || values.length === 0) {
        throw new Error('Unexpected error: incorrect pivot configuration');
    }
    return {
        indexColumn: {
            reference: index.name,
            type: getVizIndexTypeFromSemanticLayerFieldType(index.type),
        },
        valuesColumns: values.map((value) => ({
            reference: value.name,
            aggregation: value.aggregation ?? VIZ_DEFAULT_AGGREGATION,
        })),
        groupByColumns: groupBy?.map((f) => ({ reference: f.name })),
    };
};
// TEMPORARY
export const getPivotQueryFunctionForSqlQuery = ({
    projectUuid,
    limit,
    sortBy,
    sql,
    fields,
    context,
}: {
    projectUuid: string;
    limit?: number;
    sql: string;
    sortBy?: VizSortBy[];
    fields: SemanticLayerField[];
    context?: QueryExecutionContext;
}): RunPivotQuery => {
    return async (query: SemanticLayerQuery) => {
        const index = query.pivot?.index[0];

        if (index === undefined) {
            return {
                results: [],
                indexColumn: undefined,
                valuesColumns: [],
                columns: [],
                fileUrl: undefined,
                columnCount: undefined,
            };
        }

        const { indexColumn, valuesColumns, groupByColumns } =
            convertSemanticLayerQueryToSqlRunnerPivotQuery(query, fields);

        const pivotResults = await executeSqlPivotQuery(projectUuid, {
            context,
            limit,
            sql,
            pivotConfiguration: {
                indexColumn,
                valuesColumns,
                groupByColumns,
                sortBy,
            },
        });

        const columns: VizColumn[] = Object.keys(pivotResults.columns).map(
            (field) => ({
                reference: field,
            }),
        );

        return {
            fileUrl: pivotResults.fileUrl,
            results: pivotResults.results,
            indexColumn: pivotResults.indexColumn,
            valuesColumns: pivotResults.valuesColumns,
            columns,
            columnCount: pivotResults.columnCount,
        };
    };
};

export const getPivotQueryFunctionForSqlChart = ({
    projectUuid,
    savedSqlUuid,
    limit,
    context,
}: {
    projectUuid: string;
    savedSqlUuid?: string;
    limit?: number;
    context?: QueryExecutionContext;
}): RunPivotQuery => {
    return async (query: SemanticLayerQuery) => {
        const index = query.pivot?.index[0];

        if (index === undefined || savedSqlUuid === undefined) {
            return {
                results: [],
                indexColumn: undefined,
                valuesColumns: [],
                columns: [],
                fileUrl: undefined,
                columnCount: undefined,
            };
        }

        const pivotResults = await executeSqlChartPivotQuery(projectUuid, {
            savedSqlUuid,
            context,
            limit,
        });

        const columns: VizColumn[] = Object.keys(pivotResults.columns).map(
            (field) => ({
                reference: field,
            }),
        );

        return {
            fileUrl: pivotResults.fileUrl,
            results: pivotResults.results,
            indexColumn: pivotResults.indexColumn,
            valuesColumns: pivotResults.valuesColumns,
            columns,
            columnCount: pivotResults.columnCount,
        };
    };
};

export const getPivotQueryFunctionForDashboard = async ({
    projectUuid,
    dashboardUuid,
    tileUuid,
    savedSqlUuid,
    limit,
    dashboardFilters,
    dashboardSorts,
    context,
}: {
    projectUuid: string;
    dashboardUuid: string;
    tileUuid: string;
    savedSqlUuid: string;
    limit?: number;
    dashboardFilters: DashboardFilters;
    dashboardSorts: SortField[]; // TODO: check if dashboardSorts is needed, seems to be unused
    context?: QueryExecutionContext;
}): Promise<PivotChartData> => {
    const pivotResults = await executeDashboardSqlChartPivotQuery(projectUuid, {
        dashboardUuid,
        tileUuid,
        savedSqlUuid,
        context,
        dashboardFilters,
        dashboardSorts,
        limit,
    });

    const columns: VizColumn[] = Object.keys(pivotResults.columns).map(
        (field) => ({
            reference: field,
        }),
    );

    return {
        fileUrl: pivotResults.fileUrl,
        results: pivotResults.results,
        indexColumn: pivotResults.indexColumn,
        valuesColumns: pivotResults.valuesColumns,
        columns,
        columnCount: pivotResults.columnCount,
    };
};
