import {
    type ApiError,
    type CreateShareUrl,
    type ShareUrl,
    type UpdateShareUrl,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const getShare = async (shareNanoid: string) =>
    lightdashApi<ShareUrl>({
        url: `/share/${shareNanoid}`,
        method: 'GET',
        body: undefined,
    });

export const useGetShare = (shareNanoid: string | null) =>
    useQuery<ShareUrl, ApiError>({
        queryKey: ['share', shareNanoid!],
        queryFn: () => getShare(shareNanoid!),
        retry: false,
        enabled: shareNanoid != null,
    });

const createShareUrl = async (data: CreateShareUrl) =>
    lightdashApi<ShareUrl>({
        url: `/share/`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateShareUrl = async (shareNanoid: string, data: UpdateShareUrl) =>
    lightdashApi<ShareUrl>({
        url: `/share/${shareNanoid}`,
        method: 'PATCH',
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

export const useUpdateShareMutation = (shareNanoid: string | null) => {
    const client = useQueryClient();

    return useMutation<ShareUrl, ApiError, UpdateShareUrl>(
        (data) => {
            if (!shareNanoid) {
                throw new Error(
                    `useUpdateShareMutation mutation called without a nullish shareNanoId`,
                );
            }

            return updateShareUrl(shareNanoid, data);
        },
        {
            //mutationKey: ['share'],
            onSuccess: async (result) => {
                /**
                 * Override the local share state, without having to fetch it again. This allows us
                 * to close the loop with `useGetShare` as the source of truth.
                 */
                client.setQueryData(['share', shareNanoid], result);
            },
            onError: () => {},
        },
    );
};
