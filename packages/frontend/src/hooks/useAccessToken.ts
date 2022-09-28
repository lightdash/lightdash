import {
    ApiCreateUserTokenResults,
    ApiError,
    CreatePersonalAccessToken,
    PersonalAccessToken,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    UseQueryOptions,
} from 'react-query';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';
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

export const useAccessToken = (
    useQueryOptions?: UseQueryOptions<PersonalAccessToken[], ApiError>,
) => {
    const setErrorResponse = useQueryError();
    return useQuery<PersonalAccessToken[], ApiError>({
        queryKey: ['personal_access_tokens'],
        queryFn: () => getAccessToken(),
        retry: false,
        onError: (result) => setErrorResponse(result),
        ...useQueryOptions,
    });
};

export const useCreateAccessToken = () => {
    const queryClient = useQueryClient();
    const { showToastError } = useToaster();
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
    const { showToastSuccess, showToastError } = useToaster();
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
