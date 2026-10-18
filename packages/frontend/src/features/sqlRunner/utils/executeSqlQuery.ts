import {
    QueryHistoryStatus,
    type ApiExecuteAsyncSqlQueryResults,
    type ParametersValuesMap,
    type PivotConfiguration,
    type RawResultRow,
    type ResultColumns,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';
import { pollForResults } from '../../../api/asyncQuery';
import { getResultsFromStream } from '../../../utils/request';

export type ResultsAndColumns = {
    queryUuid: string;
    fileUrl: string | undefined;
    results: RawResultRow[];
    /** The statement's columns, keyed by reference, as the chart's fields are built from them. */
    columns: ResultColumns;
    durationMs: number | null;
};

export type ExecuteSqlQueryOptions = {
    signal?: AbortSignal;
    /** Pivots the statement's rows on the warehouse, addressed by result column. */
    pivotConfiguration?: PivotConfiguration;
    // Fires once the warehouse has accepted the query, so it can be cancelled
    onQueryStarted?: (queryUuid: string) => void;
};

const throwIfAborted = (signal: AbortSignal | undefined) => {
    if (signal?.aborted) {
        throw new DOMException('Query cancelled', 'AbortError');
    }
};

type SubmitSqlQueryArgs = {
    projectUuid: string;
    sql: string;
    limit?: number;
    parameterValues?: ParametersValuesMap;
    invalidateCache?: boolean;
    warehouseConnectionUuid?: string | null;
    pivotConfiguration?: PivotConfiguration;
};

/** Starts a SQL runner query and returns its id without waiting for it. */
export const submitSqlQuery = async ({
    projectUuid,
    sql,
    limit,
    parameterValues,
    invalidateCache,
    warehouseConnectionUuid,
    pivotConfiguration,
}: SubmitSqlQueryArgs): Promise<ApiExecuteAsyncSqlQueryResults> =>
    lightdashApi<ApiExecuteAsyncSqlQueryResults>({
        url: `/projects/${projectUuid}/query/sql`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify({
            sql,
            limit,
            parameters: parameterValues,
            invalidateCache,
            ...(pivotConfiguration ? { pivotConfiguration } : {}),
            ...(warehouseConnectionUuid === undefined
                ? {}
                : { warehouseConnectionUuid }),
        }),
    });

/** Runs a SQL runner query to completion and reads every row of its result. */
export const executeSqlQuery = async (
    projectUuid: string,
    sql: string,
    limit?: number,
    parameterValues?: ParametersValuesMap,
    invalidateCache?: boolean,
    warehouseConnectionUuid?: string | null,
    options: ExecuteSqlQueryOptions = {},
): Promise<ResultsAndColumns> => {
    throwIfAborted(options.signal);
    const response = await submitSqlQuery({
        projectUuid,
        sql,
        limit,
        parameterValues,
        invalidateCache,
        warehouseConnectionUuid,
        pivotConfiguration: options.pivotConfiguration,
    });

    options.onQueryStarted?.(response.queryUuid);
    const query = await pollForResults(
        projectUuid,
        response.queryUuid,
        250,
        options.signal,
    );

    if (
        query.status === QueryHistoryStatus.ERROR ||
        query.status === QueryHistoryStatus.EXPIRED
    ) {
        throw new Error(query.error || 'Error executing SQL query');
    }

    if (query.status !== QueryHistoryStatus.READY) {
        throw new Error('Unexpected query status');
    }

    const fileUrl = `/api/v2/projects/${projectUuid}/query/${response.queryUuid}/results`;

    const results = await getResultsFromStream<RawResultRow>(fileUrl);

    return {
        queryUuid: query.queryUuid,
        fileUrl,
        results,
        columns: query.columns,
        durationMs: query.metadata.performance.initialQueryExecutionMs,
    };
};
