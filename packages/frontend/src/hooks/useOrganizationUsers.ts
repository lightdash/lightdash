import {
    type ApiError,
    type ApiOrganizationMemberProfiles,
    type ApiReassignUserSchedulersResponse,
    type ApiUserSchedulersSummaryResponse,
    type KnexPaginateArgs,
} from '@lightdash/common';
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
    type UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import Fuse from 'fuse.js';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';
import useQueryError from './useQueryError';

const getOrganizationUsersQuery = async (params?: {
    includeGroups?: number;
    paginateArgs?: KnexPaginateArgs;
    searchQuery?: string;
    projectUuid?: string;
    googleOidcOnly?: boolean;
}) => {
    const urlParams = new URLSearchParams({
        ...(params?.paginateArgs
            ? {
                  page: String(params.paginateArgs.page),
                  pageSize: String(params.paginateArgs.pageSize),
              }
            : {}),
        ...(params?.includeGroups
            ? { includeGroups: String(params?.includeGroups) }
            : {}),
        ...(params?.searchQuery ? { searchQuery: params.searchQuery } : {}),
        ...(params?.projectUuid ? { projectUuid: params.projectUuid } : {}),
        ...(params?.googleOidcOnly
            ? { googleOidcOnly: String(params.googleOidcOnly) }
            : {}),
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

export const useOrganizationUsers = (params?: {
    searchInput?: string;
    includeGroups?: number;
    projectUuid?: string;
    enabled?: boolean;
    paginateArgs?: KnexPaginateArgs;
}) => {
    const setErrorResponse = useQueryError();
    return useQuery<ApiOrganizationMemberProfiles['results']['data'], ApiError>(
        {
            queryKey: [
                'organization_users',
                params?.includeGroups,
                params?.searchInput,
            ],
            queryFn: async () => {
                return (
                    await getOrganizationUsersQuery({
                        includeGroups: params?.includeGroups,
                        searchQuery: params?.searchInput,
                        projectUuid: params?.projectUuid,
                        paginateArgs: params?.paginateArgs,
                    })
                ).data;
            },
            onError: (result) => setErrorResponse(result),
            enabled: params?.enabled !== false,
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

export const useInfiniteOrganizationUsers = (
    {
        searchInput,
        includeGroups,
        pageSize,
        projectUuid,
        googleOidcOnly,
    }: {
        searchInput?: string;
        includeGroups?: number;
        projectUuid?: string;
        pageSize: number;
        googleOidcOnly?: boolean;
    },
    infinityQueryOpts: UseInfiniteQueryOptions<
        ApiOrganizationMemberProfiles['results'],
        ApiError
    > = {},
) => {
    const setErrorResponse = useQueryError();
    return useInfiniteQuery<ApiOrganizationMemberProfiles['results'], ApiError>(
        {
            queryKey: [
                'organization_users',
                includeGroups,
                pageSize,
                searchInput,
                projectUuid,
                googleOidcOnly,
            ],
            queryFn: ({ pageParam }) => {
                return getOrganizationUsersQuery({
                    includeGroups,
                    paginateArgs: {
                        pageSize: pageSize,
                        page: pageParam ?? 1,
                    },
                    searchQuery: searchInput,
                    projectUuid,
                    googleOidcOnly,
                });
            },
            onError: (result) => setErrorResponse(result),
            getNextPageParam: (lastPage) => {
                if (lastPage.pagination) {
                    return lastPage.pagination.page <
                        lastPage.pagination.totalPageCount
                        ? lastPage.pagination.page + 1
                        : undefined;
                }
            },
            ...infinityQueryOpts,
        },
    );
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

const getUserSchedulersSummaryQuery = async (userUuid: string) =>
    lightdashApi<ApiUserSchedulersSummaryResponse['results']>({
        url: `/org/user/${userUuid}/schedulers-summary`,
        method: 'GET',
        body: undefined,
    });

export const useUserSchedulersSummary = (
    userUuid: string,
    enabled: boolean = true,
) => {
    const setErrorResponse = useQueryError();
    return useQuery<ApiUserSchedulersSummaryResponse['results'], ApiError>({
        queryKey: ['user_schedulers_summary', userUuid],
        queryFn: () => getUserSchedulersSummaryQuery(userUuid),
        onError: (result) => setErrorResponse(result),
        enabled,
    });
};

const reassignUserSchedulersQuery = async ({
    userUuid,
    newOwnerUserUuid,
}: {
    userUuid: string;
    newOwnerUserUuid: string;
}) =>
    lightdashApi<ApiReassignUserSchedulersResponse['results']>({
        url: `/org/user/${userUuid}/reassign-schedulers`,
        method: 'PATCH',
        body: JSON.stringify({ newOwnerUserUuid }),
    });

export const useReassignUserSchedulersMutation = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        ApiReassignUserSchedulersResponse['results'],
        ApiError,
        { userUuid: string; newOwnerUserUuid: string }
    >(reassignUserSchedulersQuery, {
        mutationKey: ['reassign_user_schedulers'],
        onSuccess: async (data) => {
            showToastSuccess({
                title: `Success! ${data.reassignedCount} scheduled ${
                    data.reassignedCount === 1 ? 'delivery' : 'deliveries'
                } reassigned.`,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to reassign scheduled deliveries`,
                apiError: error,
            });
        },
    });
};
