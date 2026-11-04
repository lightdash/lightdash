import {
    type ApiError,
    type CreateUserAttribute,
    type UserAttribute,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import useToaster from './toaster/useToaster';
import useQueryError from './useQueryError';

const getUserAttributes = async (lightdashApi: LightdashApi) =>
    lightdashApi<UserAttribute[]>({
        url: `/org/attributes`,
        method: 'GET',
        body: undefined,
    });

export const useUserAttributes = () => {
    const lightdashApi = useLightdashApi();
    const setErrorResponse = useQueryError();
    return useQuery<UserAttribute[], ApiError>({
        queryKey: ['user_attributes'],
        queryFn: () => getUserAttributes(lightdashApi),
        onError: (result) => setErrorResponse(result),
    });
};

const createUserAttributes = async (
    lightdashApi: LightdashApi,
    data: CreateUserAttribute,
) =>
    lightdashApi<null>({
        url: `/org/attributes`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useCreateUserAtributesMutation = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<null, ApiError, CreateUserAttribute>(
        (data: CreateUserAttribute) => createUserAttributes(lightdashApi, data),
        {
            mutationKey: ['user_attributes'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['user_attributes']);
                showToastSuccess({
                    title: `Success! user attribute was created.`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to create user attribute`,
                    apiError: error,
                });
            },
        },
    );
};

const updateUserAttributes = async (
    lightdashApi: LightdashApi,
    userAttributeUuid: string,
    data: CreateUserAttribute,
) =>
    lightdashApi<null>({
        url: `/org/attributes/${userAttributeUuid}`,
        method: 'PUT',
        body: JSON.stringify(data),
    });

export const useUpdateUserAtributesMutation = (userAttributeUuuid?: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<null, ApiError, CreateUserAttribute>(
        (data) =>
            updateUserAttributes(lightdashApi, userAttributeUuuid || '', data),

        {
            mutationKey: ['user_attributes'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['user_attributes']);
                showToastSuccess({
                    title: `Success! user attribute was updated.`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to update user attribute`,
                    apiError: error,
                });
            },
        },
    );
};

const deleteUserAttributes = async (lightdashApi: LightdashApi, uuid: string) =>
    lightdashApi<null>({
        url: `/org/attributes/${uuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useUserAttributesDeleteMutation = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, string>(
        (uuid: string) => deleteUserAttributes(lightdashApi, uuid),
        {
            mutationKey: ['delete_user_attributes'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['user_attributes']);
                showToastSuccess({
                    title: `Success! user attribute was deleted.`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to delete user attribute`,
                    apiError: error,
                });
            },
        },
    );
};
