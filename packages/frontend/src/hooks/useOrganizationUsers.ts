import {
    type ApiError,
    type ApiOrganizationMemberProfiles,
    type IKnexPaginateArgs,
    type OrganizationMemberProfileUpdate,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Fuse from 'fuse.js';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';
import useToaster from './toaster/useToaster';
import useQueryError from './useQueryError';

const getOrganizationUsersQuery = async (
    includeGroups?: number,
    paginateArgs?: IKnexPaginateArgs,
) => {
    const urlParams = new URLSearchParams({
        ...(paginateArgs
            ? {
                  page: String(paginateArgs.page),
                  pageSize: String(paginateArgs.pageSize),
              }
            : {}),
        ...(includeGroups ? { includeGroups: String(includeGroups) } : {}),
    }).toString();

    return lightdashApi<ApiOrganizationMemberProfiles['results']>({
        url: `/org/users${urlParams ? `?${urlParams}` : ''}`,
        method: 'GET',
        body: undefined,
    });
};

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
    return useQuery<ApiOrganizationMemberProfiles['results']['data'], ApiError>(
        {
            queryKey: ['organization_users', params?.includeGroups],
            queryFn: async () => {
                return (await getOrganizationUsersQuery(params?.includeGroups))
                    .data;
            },
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
        },
    );
};

export const usePaginatedOrganizationUsers = (params: {
    searchInput?: string;
    includeGroups?: number;
    paginateArgs?: IKnexPaginateArgs;
}) => {
    const setErrorResponse = useQueryError();
    return useQuery<ApiOrganizationMemberProfiles['results'], ApiError>({
        queryKey: [
            'organization_users',
            params.includeGroups,
            params.paginateArgs,
        ],
        queryFn: () =>
            getOrganizationUsersQuery(
                params.includeGroups,
                params.paginateArgs,
            ),
        onError: (result) => setErrorResponse(result),
        select: (result) => {
            if (params.searchInput) {
                return {
                    ...result,
                    data: new Fuse(result.data, {
                        keys: ['firstName', 'lastName', 'email', 'role'],
                        ignoreLocation: true,
                        threshold: 0.3,
                    })
                        .search(params.searchInput)
                        .map((r) => r.item),
                };
            }
            return result;
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
