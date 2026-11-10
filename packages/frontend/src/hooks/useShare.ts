import {
    type ApiError,
    type CreateShareUrl,
    type ShareUrl,
} from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';

const getShare = async (lightdashApi: LightdashApi, shareNanoid: string) =>
    lightdashApi<ShareUrl>({
        url: `/share/${shareNanoid}`,
        method: 'GET',
        body: undefined,
    });

export const useGetShare = (shareNanoid?: string) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ShareUrl, ApiError>({
        queryKey: ['share', shareNanoid],
        queryFn: () => getShare(lightdashApi, shareNanoid!),
        enabled: shareNanoid !== undefined,
        retry: false,
    });
};

const createShareUrl = async (
    lightdashApi: LightdashApi,
    data: CreateShareUrl,
) =>
    lightdashApi<ShareUrl>({
        url: `/share/`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useCreateShareMutation = () => {
    const lightdashApi = useLightdashApi();
    return useMutation<ShareUrl, ApiError, CreateShareUrl>(
        (data) => createShareUrl(lightdashApi, data),
        {
            //mutationKey: ['share'],
            onSuccess: async () => {},
            onError: () => {},
        },
    );
};
