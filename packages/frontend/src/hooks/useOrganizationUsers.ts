import { ApiError, OrganizationUser } from 'common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';
import useQueryError from './useQueryError';

const getOrganizationUsersQuery = async () =>
    lightdashApi<OrganizationUser[]>({
        url: `/org/users`,
        method: 'GET',
        body: undefined,
    });

const deleteUserQuery = async (id: string) =>
    lightdashApi<undefined>({
        url: `/org/user/${id}`,
        method: 'DELETE',
        body: undefined,
    });

export const useOrganizationUsers = () => {
    const [, setErrorResponse] = useQueryError();
    return useQuery<OrganizationUser[], ApiError>({
        queryKey: ['organization_users'],
        queryFn: getOrganizationUsersQuery,
        onError: (result) => setErrorResponse(result.error),
    });
};

export const useDeleteUserMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useApp();
    return useMutation<undefined, ApiError, string>(deleteUserQuery, {
        mutationKey: ['saved_query_create'],
        onSuccess: async () => {
            await queryClient.invalidateQueries('organization_users');
            showToastSuccess({
                title: `User deleted with success`,
            });
        },
        onError: (error) => {
            showToastError({
                title: `Failed to delete user`,
                subtitle: error.error.message,
            });
        },
    });
};
