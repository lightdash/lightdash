import {
    type ApiCompiledMergeQueryResults,
    type ApiExecuteAsyncMetricQueryResults,
    type CompileMergeQueryRequest,
    type MergeQuery,
    type ParametersValuesMap,
    type RunMergeQueryRequest,
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

export type MergeQueryRun = {
    /** Errors that stopped the merge running. Empty when `started` is set. */
    errors: CompiledMergeQuery['errors'];
    /** The query to page results from, or null when the merge was refused. */
    started: ApiExecuteAsyncMetricQueryResults | null;
};

const runMergeQuery = (
    projectUuid: string,
    mergeQuery: MergeQuery,
    parameters: ParametersValuesMap | undefined,
) =>
    lightdashApi<ApiExecuteAsyncMetricQueryResults>({
        url: `/projects/${projectUuid}/mergeQuery/run`,
        method: 'POST',
        body: JSON.stringify({
            mergeQuery,
            parameters,
        } satisfies RunMergeQueryRequest),
    });

/**
 * Compiles a merge, then runs it as an ordinary async query.
 *
 * Compiling first is what lets a refusal be shown against the query row that
 * caused it: a merge that would produce wrong numbers is a result to render,
 * not a failure to throw. A plain async function rather than a mutation —
 * the caller owns the state, and there is no cache identity for a run that
 * only ever belongs to the screen that started it.
 */
export const executeMergeQuery = async (
    projectUuid: string,
    mergeQuery: MergeQuery,
    parameters?: ParametersValuesMap,
): Promise<MergeQueryRun> => {
    const compiled = await compileMergeQuery(
        projectUuid,
        mergeQuery,
        parameters,
    );
    if (!compiled.sql) {
        return { errors: compiled.errors, started: null };
    }
    return {
        errors: [],
        started: await runMergeQuery(projectUuid, mergeQuery, parameters),
    };
};
