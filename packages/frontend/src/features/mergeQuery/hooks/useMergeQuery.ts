import {
    type ApiCompiledMergeQueryResults,
    type ApiExecuteAsyncComposeMergeQueryRequest,
    type ApiExecuteAsyncMergeQueryResults,
    type ApiExecuteAsyncSavedMergeQueryRequest,
    type CompileMergeQueryRequest,
    isMetricSourcedMergeQuery,
    type MergeQuery,
    type MergeQueryExecutionMode,
    type ParametersValuesMap,
    QueryExecutionContext,
    type SavedChartDAO,
    type UUID,
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

const toMergeMode = (
    csvLimit: number | null | undefined,
): MergeQueryExecutionMode =>
    csvLimit === undefined
        ? { type: 'interactive' }
        : { type: 'export', limit: csvLimit };

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
            mode: toMergeMode(csvLimit),
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

/** The chart a view-mode merge runs from: the server runs its saved merge. */
export type SavedMergeChartRun = {
    savedChartUuid: UUID;
    includeUnpublishedDraft: boolean;
};

export const executeSavedMergeQuery = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    { savedChartUuid, includeUnpublishedDraft }: SavedMergeChartRun,
    parameters: ParametersValuesMap,
    pivotResults: boolean,
    csvLimit?: number | null,
): Promise<MergeQueryRun> =>
    lightdashApi<ApiExecuteAsyncMergeQueryResults>({
        url: `/projects/${projectUuid}/query/saved-merge-query`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify({
            savedChartUuid,
            includeUnpublishedDraft,
            parameters,
            pivotResults,
            context: QueryExecutionContext.CHART,
            mode: toMergeMode(csvLimit),
        } satisfies ApiExecuteAsyncSavedMergeQueryRequest),
    });
