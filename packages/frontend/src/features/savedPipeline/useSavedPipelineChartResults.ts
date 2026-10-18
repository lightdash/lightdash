import { type SavedChart } from '@lightdash/common';
import { useMemo } from 'react';
import {
    useGetReadyQueryResults,
    useInfiniteQueryResults,
} from '../../hooks/useQueryResults';

/**
 * A saved pipeline chart's run and rows: the chart query endpoint runs the
 * stored nodes and the chart node, whose result is keyed by the chart's
 * field ids like every saved chart result.
 */
export const useSavedPipelineChartResults = (
    chart: Pick<SavedChart, 'uuid' | 'projectUuid' | 'tableName' | 'name'>,
) => {
    const query = useGetReadyQueryResults(
        useMemo(
            () => ({
                projectUuid: chart.projectUuid,
                tableId: chart.tableName,
                chartUuid: chart.uuid,
                pivotResults: true,
            }),
            [chart.projectUuid, chart.tableName, chart.uuid],
        ),
        [],
    );
    const queryResults = useInfiniteQueryResults(
        chart.projectUuid,
        query.data?.queryUuid,
        chart.name,
    );
    const resultsData = useMemo(
        () => ({
            ...queryResults,
            metricQuery: query.data?.metricQuery,
            fields: query.data?.fields,
            resolvedTimezone: query.data?.resolvedTimezone ?? undefined,
        }),
        [queryResults, query.data],
    );
    const isLoading =
        query.isFetching ||
        queryResults.isFetchingRows ||
        !query.data?.queryUuid ||
        queryResults.queryUuid !== query.data.queryUuid;
    return {
        query,
        resultsData,
        isLoading,
        error: query.error ?? queryResults.error ?? null,
    };
};
