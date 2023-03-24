import {
    ApiError,
    ApiQueryResults,
    MetricQuery,
    SavedChart,
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

export const getDashboardTileQueryResults = async ({
    projectUuid,
    chartUuid,
}: {
    projectUuid: string;
    chartUuid: string;
}) => {
    return lightdashApi<ApiQueryResults>({
        url: `/projects/${projectUuid}/runDashboardTileQuery`,
        method: 'POST',
        body: JSON.stringify({ chartUuid }),
    });
};

export const getQueryResults = async ({
    projectUuid,
    tableId,
    query,
    csvLimit,
}: QueryResultsProps) => {
    const timezoneFixQuery = query && convertDateFilters(query);
    return lightdashApi<ApiQueryResults>({
        url: `/projects/${projectUuid}/explores/${tableId}/runQuery`,
        method: 'POST',
        body: JSON.stringify({ ...timezoneFixQuery, csvLimit }),
    });
};

export const getViewChartResults = async ({
    projectUuid,
    chartUuid,
}: QueryResultsProps) => {
    return lightdashApi<ApiQueryResults>({
        url: `/projects/${projectUuid}/runViewChartQuery`,
        method: 'POST',
        body: JSON.stringify({ chartUuid }),
    });
};

export const useQueryResults = (props?: {
    chartUuid?: string;
    isViewOnly?: boolean;
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const setErrorResponse = useQueryError();

    const fetchQuery =
        props?.isViewOnly === true ? getViewChartResults : getQueryResults;
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
                return mutateAsync({
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
        [mutateAsync, projectUuid],
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
    const timezoneFixQuery = convertDateFilters(query);
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

export const useSavedChartResults = (
    projectUuid: string,
    chartUuid: string,
) => {
    const queryKey = ['savedChartResults', chartUuid, projectUuid];
    return useQuery<ApiQueryResults, ApiError>({
        queryKey,
        queryFn: () =>
            getDashboardTileQueryResults({
                projectUuid,
                chartUuid,
            }),
        retry: false,
        refetchOnMount: false,
    });
};
