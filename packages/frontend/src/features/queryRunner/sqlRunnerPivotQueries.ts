import {
    QueryHistoryStatus,
    VIZ_DEFAULT_AGGREGATION,
    type ApiDownloadAsyncQueryResults,
    type ApiExecuteAsyncSqlQueryResults,
    type ApiGetAsyncQueryResults,
    type DashboardFilters,
    type ExecuteAsyncDashboardSqlChartRequestParams,
    type ExecuteAsyncSqlChartRequestParams,
    type ExecuteAsyncSqlQueryRequestParams,
    type QueryExecutionContext,
    type RawResultRow,
    type RunPivotQuery,
    type SemanticLayerField,
    type SemanticLayerQuery,
    type SortField,
    type SqlRunnerPivotQueryBody,
    type VizSortBy,
} from '@lightdash/common';
import { lightdashApi } from '../../api';
import { getResultsFromStream } from '../../utils/request';
import { getVizIndexTypeFromSemanticLayerFieldType } from './BaseResultsRunner';

const pollForResults = async (
    projectUuid: string,
    queryUuid: string,
): Promise<ApiGetAsyncQueryResults> => {
    const results = await lightdashApi<ApiGetAsyncQueryResults>({
        url: `/projects/${projectUuid}/query/${queryUuid}`,
        version: 'v2',
        method: 'GET',
        body: undefined,
    });

    if (results.status === QueryHistoryStatus.PENDING) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return pollForResults(projectUuid, queryUuid);
    }

    return results;
};

const getPivotQueryResults = async (projectUuid: string, queryUuid: string) => {
    const query = await pollForResults(projectUuid, queryUuid);

    if (query.status === QueryHistoryStatus.ERROR) {
        throw new Error(query.error || 'Error executing SQL query');
    }

    if (query.status !== QueryHistoryStatus.READY) {
        throw new Error('Unexpected query status');
    }

    const downloadResponse = await lightdashApi<ApiDownloadAsyncQueryResults>({
        url: `/projects/${projectUuid}/query/${queryUuid}/download`,
        version: 'v2',
        method: 'GET',
        body: undefined,
    });

    const results = await getResultsFromStream<RawResultRow>(
        downloadResponse.fileUrl,
    );

    return {
        results,
        indexColumn: query.pivotDetails?.indexColumn,
        valuesColumns: query.pivotDetails?.valuesColumns ?? [],
        columnCount: query.pivotDetails?.totalColumnCount ?? undefined,
        fileUrl: downloadResponse.fileUrl,
        columns: Object.values(query.columns),
    };
};

const executeSqlPivotQuery = async (
    projectUuid: string,
    payload: ExecuteAsyncSqlQueryRequestParams,
) => {
    if (!payload.pivotConfiguration) {
        throw new Error('Pivot configuration is required');
    }

    const response = await lightdashApi<ApiExecuteAsyncSqlQueryResults>({
        url: `/projects/${projectUuid}/query/sql`,
        method: 'POST',
        body: JSON.stringify({ ...payload }),
        version: 'v2',
    });

    return getPivotQueryResults(projectUuid, response.queryUuid);
};

const executeSqlChartPivotQuery = async (
    projectUuid: string,
    payload: ExecuteAsyncSqlChartRequestParams,
) => {
    const response = await lightdashApi<ApiExecuteAsyncSqlQueryResults>({
        url: `/projects/${projectUuid}/query/sql-chart`,
        method: 'POST',
        body: JSON.stringify(payload),
        version: 'v2',
    });

    return getPivotQueryResults(projectUuid, response.queryUuid);
};

const executeDashboardSqlChartPivotQuery = async (
    projectUuid: string,
    payload: ExecuteAsyncDashboardSqlChartRequestParams,
) => {
    const executeQueryResponse =
        await lightdashApi<ApiExecuteAsyncSqlQueryResults>({
            url: `/projects/${projectUuid}/query/dashboard-sql-chart`,
            method: 'POST',
            body: JSON.stringify(payload),
            version: 'v2',
        });

    return getPivotQueryResults(projectUuid, executeQueryResponse.queryUuid);
};

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

        return {
            fileUrl: pivotResults.fileUrl,
            results: pivotResults.results,
            indexColumn: pivotResults.indexColumn,
            valuesColumns: pivotResults.valuesColumns,
            columns: Object.values(pivotResults.columns),
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

        return {
            fileUrl: pivotResults.fileUrl,
            results: pivotResults.results,
            indexColumn: pivotResults.indexColumn,
            valuesColumns: pivotResults.valuesColumns,
            columns: Object.values(pivotResults.columns),
            columnCount: pivotResults.columnCount,
        };
    };
};

export const getPivotQueryFunctionForDashboard = ({
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
    dashboardUuid?: string;
    tileUuid?: string;
    savedSqlUuid?: string;
    limit?: number;
    dashboardFilters: DashboardFilters;
    dashboardSorts: SortField[]; // TODO: check if dashboardSorts is needed, seems to be unused
    context?: QueryExecutionContext;
}): RunPivotQuery => {
    return async (query: SemanticLayerQuery) => {
        const index = query.pivot?.index[0];

        if (
            index === undefined ||
            dashboardUuid === undefined ||
            tileUuid === undefined ||
            savedSqlUuid === undefined
        ) {
            return {
                results: [],
                indexColumn: undefined,
                valuesColumns: [],
                columns: [],
                fileUrl: undefined,
                columnCount: undefined,
            };
        }

        const pivotResults = await executeDashboardSqlChartPivotQuery(
            projectUuid,
            {
                dashboardUuid,
                tileUuid,
                savedSqlUuid,
                context,
                dashboardFilters,
                dashboardSorts,
                limit,
            },
        );

        return {
            fileUrl: pivotResults.fileUrl,
            results: pivotResults.results,
            indexColumn: pivotResults.indexColumn,
            valuesColumns: pivotResults.valuesColumns,
            columns: Object.values(pivotResults.columns),
            columnCount: pivotResults.columnCount,
        };
    };
};
