import { type ApiError, type ApiFlashResults } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';

const getFlash = async (lightdashApi: LightdashApi) =>
    lightdashApi<ApiFlashResults>({
        method: 'GET',
        url: '/flash',
        body: undefined,
    });

export const useFlashMessages = () => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiFlashResults, ApiError>({
        queryKey: ['flash'],
        queryFn: () => getFlash(lightdashApi),
        cacheTime: 200,
        refetchInterval: false,
    });
};
