import {
    ApiError,
    ApiQueryResults,
    Filters,
    MetricQuery,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useMutation, useQuery } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { convertDateFilters } from '../utils/dateFilter';
import useQueryError from './useQueryError';

type QueryResultsProps = {
    projectUuid: string;
    tableId: string;
    query?: MetricQuery;
    csvLimit?: number | null; //giving null returns all results (no limit)
    chartUuid?: string;
};

// This API call will be used for getting charts in view mode and dashboard tiles
export const getChartResults = async ({
    chartUuid,
    filters,
}: {
    chartUuid?: string;
    filters?: Filters;
}) => {
    return lightdashApi<ApiQueryResults>({
        url: `/saved/${chartUuid}/results`,
        method: 'POST',
        body: JSON.stringify({ filters }),
    });
};

export const getQueryResults = async ({
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

    const fetchQuery =
        props?.isViewOnly === true ? getChartResults : getQueryResults;
    const mutation = useMutation<ApiQueryResults, ApiError, QueryResultsProps>(
        fetchQuery,
        {
            mutationKey: ['queryResults'],
            onError: useCallback(
                (result) => setErrorResponse(result),
                [setErrorResponse],
            ),
        },
    );

    const { mutateAsync } = mutation;

    const mutateAsyncOverride = useCallback(
        (tableName: string, metricQuery: MetricQuery) => {
            const fields = new Set([
                ...metricQuery.dimensions,
                ...metricQuery.metrics,
                ...metricQuery.tableCalculations.map(({ name }) => name),
            ]);
            const isValidQuery = fields.size > 0;
            if (!!tableName && isValidQuery) {
                mutateAsync({
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

export const getUnderlyingDataResults = async ({
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
export const useChartResults = (chartUuid: string, filters?: Filters) => {
    const queryKey = ['savedChartResults', chartUuid, JSON.stringify(filters)];
    const timezoneFixFilters = filters && convertDateFilters(filters);

    return useQuery<ApiQueryResults, ApiError>({
        queryKey,
        queryFn: () =>
            getChartResults({
                chartUuid,
                filters: timezoneFixFilters,
            }),
        retry: false,
        refetchOnMount: false,
    });
};
