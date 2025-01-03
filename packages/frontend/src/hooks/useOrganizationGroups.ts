import {
    type ApiError,
    type ApiGroupListResponse,
    type CreateGroup,
    type Group,
    type GroupWithMembers,
    type KnexPaginateArgs,
    type UpdateGroupWithMembers,
} from '@lightdash/common';
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
    type UseInfiniteQueryOptions,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';
import useQueryError from './useQueryError';

const getOrganizationGroupsQuery = async (
    includeMembers?: number,
    searchQuery?: string,
    paginateArgs?: KnexPaginateArgs,
) => {
    const urlParams = new URLSearchParams({
        ...(paginateArgs
            ? {
                  page: String(paginateArgs.page),
                  pageSize: String(paginateArgs.pageSize),
              }
            : {}),
        ...(includeMembers ? { includeMembers: String(includeMembers) } : {}),
        ...(searchQuery ? { searchQuery } : {}),
    }).toString();

    return lightdashApi<ApiGroupListResponse['results']>({
        url: `/org/groups${urlParams ? `?${urlParams}` : ''}`,
        method: 'GET',
        body: undefined,
    });
};

export const useOrganizationGroups = ({
    searchInput,
    includeMembers,
    queryOptions,
}: {
    searchInput?: string;
    includeMembers?: number;
    queryOptions?: UseQueryOptions<
        ApiGroupListResponse['results']['data'],
        ApiError
    >;
}) => {
    const setErrorResponse = useQueryError();
    return useQuery<ApiGroupListResponse['results']['data'], ApiError>({
        queryKey: ['organization_groups', includeMembers, searchInput],
        queryFn: async () => {
            return (
                await getOrganizationGroupsQuery(includeMembers, searchInput)
            ).data;
        },
        onError: (result) => setErrorResponse(result),
        ...queryOptions,
    });
};

export const useInfiniteOrganizationGroups = (
    {
        searchInput,
        includeMembers,
        pageSize,
    }: {
        searchInput?: string;
        includeMembers?: number;
        pageSize: number;
    },
    infinityQueryOpts: UseInfiniteQueryOptions<
        ApiGroupListResponse['results'],
        ApiError
    > = {},
) => {
    const setErrorResponse = useQueryError();
    return useInfiniteQuery<ApiGroupListResponse['results'], ApiError>({
        queryKey: [
            'organization_groups',
            includeMembers,
            pageSize,
            searchInput,
        ],
        queryFn: async ({ pageParam }) => {
            return getOrganizationGroupsQuery(includeMembers, searchInput, {
                pageSize: pageSize,
                page: pageParam ?? 1,
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
    });
};

const createGroupQuery = async (data: CreateGroup) =>
    lightdashApi<GroupWithMembers>({
        url: `/org/groups`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useGroupCreateMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<GroupWithMembers, ApiError, CreateGroup>(
        (data) => createGroupQuery(data),
        {
            mutationKey: ['create_group'],
            onSuccess: async (_) => {
                await queryClient.invalidateQueries(['organization_groups']);
                await queryClient.invalidateQueries(['organization_users']);

                showToastSuccess({
                    title: `Success! Group was created.`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to create group`,
                    apiError: error,
                });
            },
        },
    );
};

const updateGroupQuery = async (
    data: UpdateGroupWithMembers & { uuid: string },
) =>
    lightdashApi<GroupWithMembers>({
        url: `/groups/${data.uuid}`,
        method: 'PATCH',
        body: JSON.stringify({
            name: data.name,
            members: data.members,
        }),
    });

export const useGroupUpdateMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        Group,
        ApiError,
        UpdateGroupWithMembers & { uuid: string }
    >((data) => updateGroupQuery(data), {
        mutationKey: ['update_group'],
        onSuccess: async (group) => {
            await queryClient.invalidateQueries(['organization_groups']);
            await queryClient.invalidateQueries(['organization_users']);
            showToastSuccess({
                title: `Success! Group '${group.name}' was updated.`,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to update group`,
                apiError: error,
            });
        },
    });
};

const deleteGroupQuery = async (data: Group) =>
    lightdashApi<Group>({
        url: `/groups/${data.uuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useGroupDeleteMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<Group, ApiError, Group>(
        (data) => deleteGroupQuery(data),
        {
            mutationKey: ['delete_group'],
            onSuccess: async (_, deletedGroup) => {
                await queryClient.invalidateQueries(['organization_groups']);
                await queryClient.invalidateQueries(['organization_users']);

                showToastSuccess({
                    title: `Success! Group '${deletedGroup.name}' was deleted.`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to delete group`,
                    apiError: error,
                });
            },
        },
    );
};
