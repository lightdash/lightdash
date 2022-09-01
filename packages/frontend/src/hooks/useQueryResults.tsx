import {
    ApiError,
    ApiQueryResults,
    CreateSavedChartVersion,
    MetricQuery,
    SavedChart,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useMutation, useQuery } from 'react-query';
import { StringParam, useQueryParam } from 'use-query-params';
import { lightdashApi } from '../api';
import useQueryError from './useQueryError';

export const getQueryResults = async ({
    projectUuid,
    tableId,
    query,
}: {
    projectUuid: string;
    tableId: string;
    query: MetricQuery;
}) =>
    lightdashApi<ApiQueryResults>({
        url: `/projects/${projectUuid}/explores/${tableId}/runQuery`,
        method: 'POST',
        body: JSON.stringify(query),
    });

export const useQueryResults = (
    isValidQuery: boolean,
    unsavedChartVersion: CreateSavedChartVersion,
) => {
    const [projectUuid] = useQueryParam('projectUuid', StringParam);
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
    const { mutate } = mutation;

    const mutateOverride = useCallback(() => {
        if (!!unsavedChartVersion.tableName && isValidQuery && projectUuid) {
            mutate({
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
        }
    }, [mutate, projectUuid, isValidQuery, unsavedChartVersion]);

    return useMemo(
        () => ({ ...mutation, mutate: mutateOverride }),
        [mutateOverride, mutation],
    );
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
