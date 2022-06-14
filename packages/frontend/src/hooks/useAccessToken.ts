import {
    ApiCreateUserTokenResults,
    ApiError,
    CreatePersonalAccessToken,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';
import useQueryError from './useQueryError';

// gets users access tokens
const getAccessToken = async () =>
    lightdashApi<any[]>({
        url: `/user/me/personal-access-tokens`,
        method: 'GET',
        body: undefined,
    });

const createAccessToken = async (data: CreatePersonalAccessToken) =>
    lightdashApi<ApiCreateUserTokenResults>({
        url: `/user/me/personal-access-tokens`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const deleteAccessToken = async (tokenUuid: string) =>
    lightdashApi<undefined>({
        url: `/user/me/personal-access-tokens/${tokenUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useAccessToken = () => {
    const setErrorResponse = useQueryError();
    return useQuery<any[], ApiError>({
        queryKey: ['personal_access_tokens'],
        queryFn: () => getAccessToken(),
        retry: false,
        onError: (result) => setErrorResponse(result),
    });
};

export const useCreateAccessToken = () => {
    const queryClient = useQueryClient();
    const { showToastError } = useApp();
    return useMutation<
        ApiCreateUserTokenResults,
        ApiError,
        CreatePersonalAccessToken
    >((data) => createAccessToken(data), {
        mutationKey: ['personal_access_tokens'],
        retry: 3,
        onSuccess: async (data) => {
            await queryClient.invalidateQueries('personal_access_tokens');
        },
        onError: (error) => {
            showToastError({
                title: `Failed to create token`,
                subtitle: error.error.message,
            });
        },
    });
};

export const useDeleteAccessToken = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useApp();
    return useMutation<undefined, ApiError, string>(deleteAccessToken, {
        mutationKey: ['personal_access_tokens'],
        onSuccess: async () => {
            await queryClient.invalidateQueries('personal_access_tokens');
            showToastSuccess({
                title: `Success! Your token was deleted.`,
            });
        },
        onError: (error) => {
            showToastError({
                title: `Failed to delete token`,
                subtitle: error.error.message,
            });
        },
    });
};
