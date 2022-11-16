import {
    ApiError,
    ApiQueryResults,
    CreateSavedChartVersion,
    MetricQuery,
    SavedChart,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useMutation, useQuery } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { convertDateFilters } from '../utils/dateFilter';
import useQueryError from './useQueryError';

export const getQueryResults = async ({
    projectUuid,
    tableId,
    query,
    csvLimit,
}: {
    projectUuid: string;
    tableId: string;
    query: MetricQuery;
    csvLimit?: number | null; //giving null returns all results (no limit)
}) => {
    const timezoneFixQuery = convertDateFilters(query);
    return lightdashApi<ApiQueryResults>({
        url: `/projects/${projectUuid}/explores/${tableId}/runQuery`,
        method: 'POST',
        body: JSON.stringify({ ...timezoneFixQuery, csvLimit }),
    });
};

export const useQueryResults = (
    isValidQuery: boolean,
    unsavedChartVersion: CreateSavedChartVersion,
) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const setErrorResponse = useQueryError();
    const mutation = useMutation<
        ApiQueryResults,
        ApiError,
        {
            projectUuid: string;
            tableId: string;
            query: MetricQuery;
        }
    >(getQueryResults, {
        mutationKey: ['queryResults'],
        onError: useCallback(
            (result) => setErrorResponse(result),
            [setErrorResponse],
        ),
    });
    const { mutateAsync } = mutation;

    const mutateAsyncOverride = useCallback(() => {
        if (!!unsavedChartVersion.tableName && isValidQuery) {
            return mutateAsync({
                projectUuid,
                tableId: unsavedChartVersion.tableName,
                query: unsavedChartVersion.metricQuery,
            });
        } else {
            console.warn(
                `Can't make SQL request, invalid state`,
                unsavedChartVersion.tableName,
                isValidQuery,
            );
            return Promise.reject();
        }
    }, [mutateAsync, projectUuid, isValidQuery, unsavedChartVersion]);

    return useMemo(
        () => ({ ...mutation, mutateAsync: mutateAsyncOverride }),
        [mutation, mutateAsyncOverride],
    );
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
            getQueryResults({
                projectUuid,
                tableId,
                query,
            }),
        retry: false,
    });
};

export const useSavedChartResults = (
    projectUuid: string,
    savedChart: SavedChart,
) => {
    const queryKey = [
        'savedChartResults',
        savedChart.uuid,
        JSON.stringify(savedChart),
        projectUuid,
    ];
    return useQuery<ApiQueryResults, ApiError>({
        queryKey,
        queryFn: () =>
            getQueryResults({
                projectUuid,
                tableId: savedChart.tableName,
                query: savedChart.metricQuery,
            }),
        retry: false,
        refetchOnMount: false,
    });
};
