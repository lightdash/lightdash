import { ApiError, ApiStatusResults } from 'common';
import { useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import useQueryError from './useQueryError';

const getStatus = async (projectUuid: string) =>
    lightdashApi<ApiStatusResults>({
        method: 'GET',
        url: `/projects/${projectUuid}/status`,
        body: undefined,
    });

export const useServerStatus = (refetchInterval = 5000) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const setErrorResponse = useQueryError();
    const queryKey = 'status';
    const [previousState, setPreviousState] = useState<string>();
    return useQuery<ApiStatusResults, ApiError>({
        queryKey,
        queryFn: () => getStatus(projectUuid),
        refetchInterval: (data) =>
            data === 'loading' ? 1000 : refetchInterval,
        onSuccess: async (data) => {
            if (
                !!previousState &&
                previousState !== data &&
                data !== 'loading'
            ) {
                await queryClient.invalidateQueries('tables');
            }
            setPreviousState(data);
        },
        onError: (result) => setErrorResponse(result),
        refetchIntervalInBackground: false,
    });
};
