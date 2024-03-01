import {
    ApiCompiledQueryResults,
    ApiError,
    Explore,
    MetricQuery,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useExplorerContext } from '../providers/ExplorerProvider';
import { convertDateFilters } from '../utils/dateFilter';
import useQueryError from './useQueryError';

const getCustomCompiledQuery = async (
    projectUuid: string,
    explore: Explore,
    metricQuery: MetricQuery,
) => {
    const timezoneFixQuery = {
        ...metricQuery,
        filters: convertDateFilters(metricQuery.filters),
    };

    return lightdashApi<ApiCompiledQueryResults>({
        url: `/projects/${projectUuid}/explores/compileCustomQuery`,
        method: 'POST',
        body: JSON.stringify({
            explore: explore,
            metricQuery: timezoneFixQuery,
        }),
    });
};

export const useCustomCompiledSql = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const customExplore = useExplorerContext((c) => c.state.customExplore);

    const explore = customExplore?.explore;

    const {
        dimensions,
        metrics,
        sorts,
        filters,
        limit,
        tableCalculations,
        additionalMetrics,
        customDimensions,
    } = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery,
    );

    const setErrorResponse = useQueryError();

    const customMetricQuery: MetricQuery = {
        exploreName: 'custom_explore',
        dimensions: Array.from(dimensions),
        metrics: Array.from(metrics),
        sorts: sorts,
        filters: filters,
        limit: limit || 500,
        tableCalculations: tableCalculations,
        additionalMetrics,
        customDimensions,
    };

    return useQuery<ApiCompiledQueryResults, ApiError>({
        // TODO: better key
        queryKey: ['customCompiledQuery', projectUuid, customMetricQuery],
        enabled: !!explore,
        queryFn: () =>
            getCustomCompiledQuery(
                projectUuid,
                // TODO: fix bangs
                explore!,
                customMetricQuery,
            ),
        onError: (result) => setErrorResponse(result),
    });
};
