import { ApiError, ApiRefreshResults } from 'common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import useQueryError from './useQueryError';

const refresh = async (projectUuid: string) =>
    lightdashApi<ApiRefreshResults>({
        method: 'POST',
        url: `/projects/${projectUuid}/refresh`,
        body: undefined,
    });

const getJob = async (jobUuid: string) =>
    lightdashApi<ApiRefreshResults>({
        method: 'GET',
        url: `/jobs/${jobUuid}`,
        body: undefined,
    });

export const useGetRefreshData = async (jobId: string) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const setErrorResponse = useQueryError();
    const queryKey = ['refresh', projectUuid];
    return useQuery<ApiRefreshResults, ApiError>({
        queryKey,
        queryFn: () => getJob(jobId || ''),
        refetchInterval: (data) => data === 'loading' && 1000,
        onSuccess: async () => {
            await queryClient.invalidateQueries('refresh');
        },
        onError: (result) => setErrorResponse(result),
        refetchIntervalInBackground: false,
    });
};

export const useRefreshServer = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const setErrorResponse = useQueryError();

    return useMutation<void, ApiError>({
        mutationKey: ['refresh', projectUuid],
        mutationFn: () => refresh(projectUuid),
        onSettled: async () => queryClient.setQueryData('status', 'loading'),
        onError: (result) => setErrorResponse(result),
    });
};
