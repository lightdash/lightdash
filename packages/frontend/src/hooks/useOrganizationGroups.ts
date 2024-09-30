import {
    type ApiError,
    type CreateGroup,
    type Group,
    type GroupWithMembers,
    type UpdateGroupWithMembers,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import Fuse from 'fuse.js';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';
import useQueryError from './useQueryError';

const getOrganizationGroupsQuery = async (includeMembers?: number) =>
    lightdashApi<GroupWithMembers[]>({
        url: `/org/groups${
            includeMembers ? `?includeMembers=${includeMembers}` : ''
        }`,
        method: 'GET',
        body: undefined,
    });

export const useOrganizationGroups = ({
    search,
    includeMembers,
    queryOptions,
}: {
    search?: string;
    includeMembers?: number;
    queryOptions?: UseQueryOptions<GroupWithMembers[], ApiError>;
}) => {
    const setErrorResponse = useQueryError();
    return useQuery<GroupWithMembers[], ApiError>({
        queryKey: ['organization_groups', includeMembers],
        queryFn: () => getOrganizationGroupsQuery(includeMembers),
        onError: (result) => setErrorResponse(result),
        select: (data) => {
            if (search) {
                return new Fuse(Object.values(data), {
                    keys: [
                        'name',
                        'members.firstName',
                        'members.lastName',
                        'members.email',
                    ],
                    ignoreLocation: true,
                    threshold: 0.3,
                })
                    .search(search)
                    .map((result) => result.item);
            }
            return data;
        },
        ...queryOptions,
    });
};

const createGroupQuery = async (data: CreateGroup) =>
    lightdashApi<Group>({
        url: `/org/groups`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useGroupCreateMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<Group, ApiError, CreateGroup>(
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
