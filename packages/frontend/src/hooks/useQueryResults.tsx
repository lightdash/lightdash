import {
    ApiError,
    ApiQueryResults,
    MetricQuery,
    SavedChart,
} from '@lightdash/common';
import { useCallback } from 'react';
import { useMutation, useQuery } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { ExplorerState } from '../providers/ExplorerProvider';
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

export const useQueryResults = (state: ExplorerState) => {
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
        onError: (result) => setErrorResponse(result),
    });

    const mutate = useCallback(() => {
        if (!!state.unsavedChartVersion.tableName && state.isValidQuery) {
            mutation.mutate({
                projectUuid,
                tableId: state.unsavedChartVersion.tableName,
                query: state.unsavedChartVersion.metricQuery,
            });
        } else {
            console.warn(
                `Can't make SQL request, invalid state`,
                state.unsavedChartVersion.tableName,
                state.isValidQuery,
            );
        }
    }, [mutation, projectUuid, state]);

    return { ...mutation, mutate };
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
