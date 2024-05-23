import {
    type ApiError,
    type OrganizationMemberProfile,
    type OrganizationMemberProfileUpdate,
    type OrganizationMemberProfileWithGroups,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Fuse from 'fuse.js';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';
import useToaster from './toaster/useToaster';
import useQueryError from './useQueryError';

const getOrganizationUsersQuery = async (includeGroups?: number) =>
    lightdashApi<
        OrganizationMemberProfile[] | OrganizationMemberProfileWithGroups[]
    >({
        url: `/org/users${
            includeGroups ? `?includeGroups=${includeGroups}` : ''
        }`,
        method: 'GET',
        body: undefined,
    });

const deleteUserQuery = async (id: string) =>
    lightdashApi<null>({
        url: `/org/user/${id}`,
        method: 'DELETE',
        body: undefined,
    });

const updateUser = async (id: string, data: OrganizationMemberProfileUpdate) =>
    lightdashApi<null>({
        url: `/org/users/${id}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useOrganizationUsers = (params?: {
    searchInput?: string;
    includeGroups?: number;
}) => {
    const setErrorResponse = useQueryError();
    return useQuery<OrganizationMemberProfile[], ApiError>({
        queryKey: ['organization_users', params?.includeGroups],
        queryFn: () => getOrganizationUsersQuery(params?.includeGroups),
        onError: (result) => setErrorResponse(result),
        select: (data) => {
            if (params?.searchInput) {
                return new Fuse(Object.values(data), {
                    keys: ['firstName', 'lastName', 'email', 'role'],
                    ignoreLocation: true,
                    threshold: 0.3,
                })
                    .search(params.searchInput)
                    .map((result) => result.item);
            }
            return data;
        },
    });
};

export const useDeleteOrganizationUserMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, string>(deleteUserQuery, {
        mutationKey: ['organization_users_delete'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['organization_users']);
            showToastSuccess({
                title: `Success! User was deleted.`,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to delete user`,
                apiError: error,
            });
        },
    });
};

export const useUpdateUserMutation = (userUuid: string) => {
    const queryClient = useQueryClient();
    const { user } = useApp();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, OrganizationMemberProfileUpdate>(
        (data) => {
            if (userUuid) {
                return updateUser(userUuid, data);
            }
            throw new Error('user ID is undefined');
        },
        {
            mutationKey: ['organization_membership_roles'],
            onSuccess: async () => {
                if (user.data?.userUuid === userUuid) {
                    await queryClient.refetchQueries(['user']);
                }
                await queryClient.refetchQueries(['organization_users']);
                showToastSuccess({
                    title: `Success! User was updated.`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to update user's permissions`,
                    apiError: error,
                });
            },
        },
    );
};
