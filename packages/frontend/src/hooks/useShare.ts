import {
    type ApiError,
    type CreateShareUrl,
    type ShareUrl,
} from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const getShare = async (shareNanoid: string) =>
    lightdashApi<ShareUrl>({
        url: `/share/${shareNanoid}`,
        method: 'GET',
        body: undefined,
    });

export const useGetShare = (shareNanoid?: string) =>
    useQuery<ShareUrl, ApiError>({
        queryKey: ['share', shareNanoid],
        queryFn: () => getShare(shareNanoid!),
        enabled: shareNanoid !== undefined,
        retry: false,
    });

const createShareUrl = async (data: CreateShareUrl) =>
    lightdashApi<ShareUrl>({
        url: `/share/`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useCreateShareMutation = () => {
    return useMutation<ShareUrl, ApiError, CreateShareUrl>(
        (data) => createShareUrl(data),
        {
            //mutationKey: ['share'],
            onSuccess: async () => {},
            onError: () => {},
        },
    );
};
