import {
    ApiError,
    CreateGroup,
    Group,
    GroupWithMembers,
    UpdateGroupWithMembers,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    UseQueryOptions,
} from '@tanstack/react-query';
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

export const useOrganizationGroups = (
    includeMembers?: number,
    queryOptions?: UseQueryOptions<GroupWithMembers[], ApiError>,
) => {
    const setErrorResponse = useQueryError();
    return useQuery<GroupWithMembers[], ApiError>({
        queryKey: ['organization_groups', includeMembers],
        queryFn: () => getOrganizationGroupsQuery(includeMembers),
        onError: (result) => setErrorResponse(result),
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
    const { showToastSuccess, showToastError } = useToaster();
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
            onError: (error) => {
                showToastError({
                    title: `Failed to create group`,
                    subtitle: error.error.message,
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
    const { showToastSuccess, showToastError } = useToaster();
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
        onError: (error) => {
            showToastError({
                title: `Failed to update group`,
                subtitle: error.error.message,
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
    const { showToastSuccess, showToastError } = useToaster();
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
            onError: (error) => {
                showToastError({
                    title: `Failed to delete group`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};
