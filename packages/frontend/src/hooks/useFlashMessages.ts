import { ApiError, ApiFlashResults } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const getFlash = async () =>
    lightdashApi<ApiFlashResults>({
        method: 'GET',
        url: '/flash',
        body: undefined,
    });

export const useFlashMessages = () =>
    useQuery<ApiFlashResults, ApiError>({
        queryKey: ['flash'],
        queryFn: getFlash,
        cacheTime: 200,
        refetchInterval: false,
    });
