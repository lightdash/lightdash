import { useMemo } from 'react';
import { useMergeSafe } from '../../../features/mergeQuery/context/useMerge';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';

/**
 * The results the Explorer's chart renders: the primary query, or the merge
 * that replaced it.
 */
export const useExplorerResultsData = () => {
    const {
        query,
        queryResults,
        isLoading,
        getDownloadQueryUuid,
        validQueryArgs,
        missingRequiredParameters,
    } = useExplorerQuery();
    // A configured merge replaces the query it was built from: its result is
    // the chart's result, so running both would cost two warehouse queries to
    // show one of them.
    const merge = useMergeSafe();
    const mergeResults = merge?.mergeResults ?? null;
    // A restored merge is the chart. Until it lands, the primary source's rows are the
    // wrong numbers wearing the right config — show loading, not them.
    const awaitingRestoredMerge =
        !!merge?.isMerging &&
        merge.wasRestored &&
        !mergeResults &&
        !merge.runError &&
        merge.runErrors.length === 0;
    const suppressPrimaryResults =
        awaitingRestoredMerge ||
        (!!merge?.isMerging &&
            !mergeResults &&
            (merge.isRunning ||
                !!merge.runError ||
                merge.runErrors.length > 0));
    const isLoadingQueryResults = mergeResults
        ? mergeResults.results.isFetchingRows
        : !!merge?.isRunning ||
          awaitingRestoredMerge ||
          isLoading ||
          queryResults.isFetchingRows;

    const resultsData = useMemo(() => {
        if (mergeResults) {
            return {
                ...mergeResults.results,
                metricQuery: mergeResults.metricQuery,
                fields: mergeResults.fields,
                resolvedTimezone: undefined,
            };
        }
        // No fields and no rows while the restored merge is pending: the
        // chart config validates its layout against whatever fields it is
        // given, and primary-source fields would fail the saved merged layout and
        // rebuild it from defaults — silently discarding the saved config.
        if (suppressPrimaryResults) {
            return {
                ...queryResults,
                rows: [],
                metricQuery: undefined,
                fields: undefined,
                resolvedTimezone: undefined,
            };
        }
        return {
            ...queryResults,
            metricQuery: query.data?.metricQuery,
            fields: query.data?.fields,
            resolvedTimezone: query.data?.resolvedTimezone ?? undefined,
        };
    }, [query.data, queryResults, mergeResults, suppressPrimaryResults]);

    return {
        query,
        queryResults,
        getDownloadQueryUuid,
        validQueryArgs,
        missingRequiredParameters,
        merge,
        mergeResults,
        suppressPrimaryResults,
        isLoadingQueryResults,
        resultsData,
    };
};

export type ExplorerResultsData = ReturnType<
    typeof useExplorerResultsData
>['resultsData'];
