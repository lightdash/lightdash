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
    const metricQuery = useExplorerContext(
        (context) => context.state.customSql?.results?.metricQuery,
    );

    // TODO:cleanup
    if (!metricQuery) {
        throw new Error('No metric query found');
    }

    const {
        dimensions,
        metrics,
        sorts,
        filters,
        limit,
        tableCalculations,
        additionalMetrics,
        customDimensions,
    } = metricQuery;

    const setErrorResponse = useQueryError();
    const customMetricQuery: MetricQuery = {
        exploreName: 'custom_explore',
        dimensions: Array.from(dimensions),
        metrics: Array.from(metrics),
        sorts,
        filters,
        limit: limit || 500,
        tableCalculations,
        additionalMetrics,
        customDimensions,
    };

    const queryKey = ['customCompiledQuery', metricQuery, projectUuid];
    return useQuery<ApiCompiledQueryResults, ApiError>({
        queryKey,
        queryFn: () =>
            getCustomCompiledQuery(projectUuid, explore, customMetricQuery),
        onError: (result) => setErrorResponse(result),
    });
};
