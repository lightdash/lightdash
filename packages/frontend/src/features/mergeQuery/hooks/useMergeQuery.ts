import {
    type ApiCompiledMergeQueryResults,
    type ApiExecuteAsyncMergeQueryRequest,
    type ApiExecuteAsyncMergeQueryResults,
    type CompileMergeQueryRequest,
    type MergeQuery,
    type ParametersValuesMap,
    type SavedChartDAO,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';

export type CompiledMergeQuery = ApiCompiledMergeQueryResults;

export const compileMergeQuery = (
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
    projectUuid: string,
    mergeQuery: MergeQuery,
    parameters: ParametersValuesMap | undefined,
    savedChart: Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'> | undefined,
    csvLimit?: number | null,
) =>
    lightdashApi<ApiExecuteAsyncMergeQueryResults>({
        url: `/projects/${projectUuid}/query/merge-query`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify({
            mergeQuery,
            parameters,
            chartConfig: savedChart?.chartConfig,
            pivotConfig: savedChart?.pivotConfig,
            csvLimit,
        } satisfies ApiExecuteAsyncMergeQueryRequest),
    });

/**
 * Starts a merge through the async query interface. Validation failures are
 * returned as data so the caller can render them against their source rows.
 */
export const executeMergeQuery = async (
    projectUuid: string,
    mergeQuery: MergeQuery,
    parameters?: ParametersValuesMap,
    savedChart?: Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'>,
    csvLimit?: number | null,
): Promise<MergeQueryRun> => {
    return runMergeQuery(
        projectUuid,
        mergeQuery,
        parameters,
        savedChart,
        csvLimit,
    );
};
