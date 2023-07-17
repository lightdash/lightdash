import { ApiError, CreateOrgAttribute, OrgAttribute } from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';
import useQueryError from './useQueryError';

const getUserAttributes = async () =>
    lightdashApi<OrgAttribute[]>({
        url: `/org/attributes`,
        method: 'GET',
        body: undefined,
    });

export const useUserAttributes = () => {
    const setErrorResponse = useQueryError();
    return useQuery<OrgAttribute[], ApiError>({
        queryKey: ['user_attributes'],
        queryFn: getUserAttributes,
        onError: (result) => setErrorResponse(result),
    });
};

const createUserAttributes = async (data: CreateOrgAttribute) =>
    lightdashApi<undefined>({
        url: `/org/attributes`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useUserAtributesMutation = () => {
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError, CreateOrgAttribute>(
        createUserAttributes,
        {
            mutationKey: ['user_attributes'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['user_attributes']);
            },
        },
    );
};

const updateUserAttributes = async (
    userAttributeUuid: string,
    data: CreateOrgAttribute,
) =>
    lightdashApi<undefined>({
        url: `/org/attributes/${userAttributeUuid}`,
        method: 'PUT',
        body: JSON.stringify(data),
    });

export const useUpdateUserAtributesMutation = (userAttributeUuuid?: string) => {
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError, CreateOrgAttribute>(
        (data) => updateUserAttributes(userAttributeUuuid || '', data),

        {
            mutationKey: ['user_attributes'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['user_attributes']);
            },
        },
    );
};

const deleteUserAttributes = async (uuid: string) =>
    lightdashApi<undefined>({
        url: `/org/attributes/${uuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useUserAttributesDeleteMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<undefined, ApiError, string>(deleteUserAttributes, {
        mutationKey: ['delete_user_attributes'],
        onSuccess: async () => {
            await queryClient.invalidateQueries('user_attributes');
            showToastSuccess({
                title: `Success! user attribute was delete.`,
            });
        },
        onError: (error) => {
            showToastError({
                title: `Failed to delete user attribute`,
                subtitle: error.error.message,
            });
        },
    });
};
