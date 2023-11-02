import {
    ApiError,
    ApiQueryResults,
    Filters,
    getCustomDimensionId,
    MetricQuery,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useMutation, useQuery } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { convertDateFilters } from '../utils/dateFilter';
import useToaster from './toaster/useToaster';
import useQueryError from './useQueryError';

type QueryResultsProps = {
    projectUuid: string;
    tableId: string;
    query?: MetricQuery;
    csvLimit?: number | null; //giving null returns all results (no limit)
    chartUuid?: string;
};

// This API call will be used for getting charts in view mode and dashboard tiles
const getChartResults = async ({
    chartUuid,
    filters,
    invalidateCache,
}: {
    chartUuid?: string;
    filters?: Filters;
    invalidateCache?: boolean;
}) => {
    return lightdashApi<ApiQueryResults>({
        url: `/saved/${chartUuid}/results`,
        method: 'POST',
        body: JSON.stringify({
            filters,
            ...(invalidateCache && { invalidateCache: true }),
        }),
    });
};

const getQueryResults = async ({
    projectUuid,
    tableId,
    query,
    csvLimit,
}: QueryResultsProps) => {
    const timezoneFixQuery = query && {
        ...query,
        filters: convertDateFilters(query.filters),
    };

    return lightdashApi<ApiQueryResults>({
        url: `/projects/${projectUuid}/explores/${tableId}/runQuery`,
        method: 'POST',
        body: JSON.stringify({ ...timezoneFixQuery, csvLimit }),
    });
};

export const useQueryResults = (props?: {
    chartUuid?: string;
    isViewOnly?: boolean;
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const setErrorResponse = useQueryError();
    const { showToastError } = useToaster();
    const fetchQuery =
        props?.isViewOnly === true ? getChartResults : getQueryResults;
    const mutation = useMutation<ApiQueryResults, ApiError, QueryResultsProps>(
        fetchQuery,
        {
            mutationKey: ['queryResults'],
            onError: useCallback(
                (result) => {
                    showToastError({
                        title: 'Error running query',
                        subtitle: result.error.message,
                    });

                    return setErrorResponse(result);
                },
                [setErrorResponse, showToastError],
            ),
        },
    );

    const { mutateAsync } = mutation;

    const mutateAsyncOverride = useCallback(
        async (tableName: string, metricQuery: MetricQuery) => {
            const fields = new Set([
                ...metricQuery.dimensions,
                ...metricQuery.metrics,
                ...metricQuery.tableCalculations.map(({ name }) => name),
                ...(metricQuery.customDimensions?.map(getCustomDimensionId) ||
                    []),
            ]);
            const isValidQuery = fields.size > 0;
            if (!!tableName && isValidQuery) {
                await mutateAsync({
                    projectUuid,
                    tableId: tableName,
                    query: metricQuery,
                    chartUuid: props?.chartUuid,
                });
            } else {
                console.warn(
                    `Can't make SQL request, invalid state`,
                    tableName,
                    isValidQuery,
                    metricQuery,
                );
                return Promise.reject();
            }
        },
        [mutateAsync, projectUuid, props?.chartUuid],
    );

    return useMemo(
        () => ({ ...mutation, mutateAsync: mutateAsyncOverride }),
        [mutation, mutateAsyncOverride],
    );
};

const getUnderlyingDataResults = async ({
    projectUuid,
    tableId,
    query,
}: {
    projectUuid: string;
    tableId: string;
    query: MetricQuery;
}) => {
    const timezoneFixQuery = {
        ...query,
        filters: convertDateFilters(query.filters),
    };

    return lightdashApi<ApiQueryResults>({
        url: `/projects/${projectUuid}/explores/${tableId}/runUnderlyingDataQuery`,
        method: 'POST',
        body: JSON.stringify(timezoneFixQuery),
    });
};

export const useUnderlyingDataResults = (
    tableId: string,
    query: MetricQuery,
) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryKey = [
        'underlyingDataResults',
        projectUuid,
        JSON.stringify(query),
    ];
    return useQuery<ApiQueryResults, ApiError>({
        queryKey,
        queryFn: () =>
            getUnderlyingDataResults({
                projectUuid,
                tableId,
                query,
            }),
        retry: false,
    });
};

// This hook will be used for getting charts in view mode and dashboard tiles
export const useChartResults = (
    chartUuid: string,
    filters?: Filters,
    invalidateCache?: boolean,
) => {
    const queryKey = [
        'savedChartResults',
        chartUuid,
        JSON.stringify(filters),
        invalidateCache,
    ];
    const timezoneFixFilters = filters && convertDateFilters(filters);

    return useQuery<ApiQueryResults, ApiError>({
        queryKey,
        queryFn: () =>
            getChartResults({
                chartUuid,
                filters: timezoneFixFilters,
                invalidateCache,
            }),
        retry: false,
        refetchOnMount: false,
    });
};

const getChartVersionResults = async (
    chartUuid: string,
    versionUuid: string,
) => {
    return lightdashApi<ApiQueryResults>({
        url: `/saved/${chartUuid}/version/${versionUuid}/results`,
        method: 'POST',
        body: undefined,
    });
};

export const useChartVersionResultsMutation = (
    chartUuid: string,
    versionUuid?: string,
) => {
    const { showToastError } = useToaster();
    const mutation = useMutation<ApiQueryResults, ApiError>(
        () => getChartVersionResults(chartUuid, versionUuid!),
        {
            mutationKey: ['chartVersionResults', chartUuid, versionUuid],
            onError: useCallback(
                (result) => {
                    showToastError({
                        title: 'Error running query',
                        subtitle: result.error.message,
                    });
                },
                [showToastError],
            ),
        },
    );
    const { mutateAsync } = mutation;
    // needs these args to work with ExplorerProvider
    const mutateAsyncOverride = useCallback(
        async (_tableName: string, _metricQuery: MetricQuery) => {
            await mutateAsync();
        },
        [mutateAsync],
    );

    return useMemo(
        () => ({
            ...mutation,
            mutateAsync: mutateAsyncOverride,
        }),
        [mutation, mutateAsyncOverride],
    );
};
