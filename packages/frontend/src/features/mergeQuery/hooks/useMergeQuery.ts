import {
    type ApiCompiledMergeQueryResults,
    type ApiExecuteAsyncComposeMergeQueryRequest,
    type ApiExecuteAsyncMergeQueryResults,
    type CompileMergeQueryRequest,
    isMetricSourcedMergeQuery,
    type MergeQuery,
    type ParametersValuesMap,
    QueryExecutionContext,
    type SavedChartDAO,
} from '@lightdash/common';
import { type LightdashApi } from '../../../api';

export type CompiledMergeQuery = ApiCompiledMergeQueryResults;

export const compileMergeQuery = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    mergeQuery: MergeQuery,
    parameters: ParametersValuesMap | undefined,
) =>
    lightdashApi<CompiledMergeQuery>({
        url: `/projects/${projectUuid}/mergeQuery/compile`,
        method: 'POST',
        body: JSON.stringify({
            mergeQuery,
            parameters,
        } satisfies CompileMergeQueryRequest),
    });

export type MergeQueryRun = ApiExecuteAsyncMergeQueryResults;

const runMergeQuery = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    mergeQuery: MergeQuery,
    parameters: ParametersValuesMap | undefined,
    savedChart: Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'> | undefined,
    csvLimit?: number | null,
) =>
    lightdashApi<ApiExecuteAsyncMergeQueryResults>({
        // Merges referencing existing query results need the compose endpoint
        url: isMetricSourcedMergeQuery(mergeQuery)
            ? `/projects/${projectUuid}/query/merge-query`
            : `/projects/${projectUuid}/query/compose-merge-query`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify({
            mergeQuery,
            parameters,
            context: QueryExecutionContext.EXPLORE,
            mode:
                csvLimit === undefined
                    ? { type: 'interactive' }
                    : { type: 'export', limit: csvLimit },
            chart: savedChart,
        } satisfies ApiExecuteAsyncComposeMergeQueryRequest),
    });

/**
 * Starts a merge through the async query interface. Validation failures are
 * returned as data so the caller can render them against their source rows.
 */
export const executeMergeQuery = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    mergeQuery: MergeQuery,
    parameters?: ParametersValuesMap,
    savedChart?: Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'>,
    csvLimit?: number | null,
): Promise<MergeQueryRun> => {
    return runMergeQuery(
        lightdashApi,
        projectUuid,
        mergeQuery,
        parameters,
        savedChart,
        csvLimit,
    );
};
