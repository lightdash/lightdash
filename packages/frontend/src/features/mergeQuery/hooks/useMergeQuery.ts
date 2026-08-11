import {
    type ApiCompiledMergeQueryResults,
    type ApiExecuteAsyncMetricQueryResults,
    type ApiMergePivotValuesResults,
    type ApiError,
    type MergeQuery,
    type MetricQuery,
} from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

export type CompiledMergeQuery = ApiCompiledMergeQueryResults;

const compileMergeQuery = (projectUuid: string, mergeQuery: MergeQuery) =>
    lightdashApi<CompiledMergeQuery>({
        url: `/projects/${projectUuid}/mergeQuery/compile`,
        method: 'POST',
        body: JSON.stringify(mergeQuery),
    });

export type MergeQueryRun = {
    /** Errors that stopped the merge running. Empty when `started` is set. */
    errors: CompiledMergeQuery['errors'];
    /** The query to page results from, or null when the merge was refused. */
    started: ApiExecuteAsyncMetricQueryResults | null;
};

const runMergeQuery = (projectUuid: string, mergeQuery: MergeQuery) =>
    lightdashApi<ApiExecuteAsyncMetricQueryResults>({
        url: `/projects/${projectUuid}/mergeQuery/run`,
        method: 'POST',
        body: JSON.stringify(mergeQuery),
    });

/**
 * Compiles a merge, then runs it as an ordinary async query.
 *
 * Compiling first is what lets a refusal be shown against the query row that
 * caused it: a merge that would produce wrong numbers is a result to render,
 * not a failure to throw. Once it compiles, running it returns a query uuid
 * that pages, formats and cancels like any other query's.
 */
export const useMergeQueryRun = (projectUuid: string | undefined) =>
    useMutation<MergeQueryRun, ApiError, MergeQuery>(
        async (mergeQuery) => {
            if (!projectUuid) {
                throw new Error('No project to run the merge against.');
            }

            const compiled = await compileMergeQuery(projectUuid, mergeQuery);
            if (!compiled.sql) {
                return { errors: compiled.errors, started: null };
            }

            return {
                errors: [],
                started: await runMergeQuery(projectUuid, mergeQuery),
            };
        },
        { mutationKey: ['mergeQuery', 'run', projectUuid] },
    );

export type MergePivotValues = ApiMergePivotValuesResults;

/**
 * Distinct values of the dimension a query would spread into columns.
 *
 * Asked of the warehouse rather than read off the rows already on screen: SQL
 * names one column per value, so a value the client never fetched would
 * silently lose its column.
 */
export const useMergePivotValues = (
    projectUuid: string | undefined,
    metricQuery: MetricQuery,
    fieldId: string | null,
    limit: number,
) =>
    useQuery<MergePivotValues, ApiError>({
        queryKey: ['mergeQuery', 'pivotValues', projectUuid, fieldId, limit],
        enabled: !!projectUuid && !!fieldId,
        queryFn: () =>
            lightdashApi<MergePivotValues>({
                url: `/projects/${projectUuid}/mergeQuery/pivotValues`,
                method: 'POST',
                body: JSON.stringify({ metricQuery, fieldId, limit }),
            }),
    });
