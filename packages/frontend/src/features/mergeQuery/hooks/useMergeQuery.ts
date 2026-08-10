import {
    type ApiCompiledMergeQueryResults,
    type ApiMergePivotValuesResults,
    type ApiError,
    type MergeQuery,
    type MetricQuery,
} from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import { executeSqlQuery } from '../../queryRunner/executeQuery';

export type CompiledMergeQuery = ApiCompiledMergeQueryResults;

const compileMergeQuery = (projectUuid: string, mergeQuery: MergeQuery) =>
    lightdashApi<CompiledMergeQuery>({
        url: `/projects/${projectUuid}/mergeQuery/compile`,
        method: 'POST',
        body: JSON.stringify(mergeQuery),
    });

export type MergeQueryRun = {
    compiled: CompiledMergeQuery;
    rows: Record<string, unknown>[];
};

/**
 * Compiles a merge to a single statement, then runs it through the normal SQL
 * path. Two calls rather than one because the merge is a compiler: execution,
 * limits and caching stay where they already are.
 *
 * A merge that would produce wrong numbers comes back compiled-but-unrunnable
 * (`sql: null` with errors), which is a result to render, not a failure to
 * throw — the explorer shows it against the query row that caused it.
 */
export const useMergeQueryRun = (projectUuid: string | undefined) =>
    useMutation<MergeQueryRun, ApiError, MergeQuery>(
        async (mergeQuery) => {
            if (!projectUuid) {
                throw new Error('No project to run the merge against.');
            }

            const compiled = await compileMergeQuery(projectUuid, mergeQuery);
            if (!compiled.sql) {
                return { compiled, rows: [] };
            }

            const results = await executeSqlQuery(
                projectUuid,
                compiled.sql,
                mergeQuery.limit,
            );

            return { compiled, rows: results?.results ?? [] };
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
