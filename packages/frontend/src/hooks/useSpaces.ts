import { ApiError, CreateSpace, Space, UpdateSpace } from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useHistory } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';

const getSpaces = async (projectUuid: string) =>
    lightdashApi<Space[]>({
        url: `/projects/${projectUuid}/spaces`,
        method: 'GET',
        body: undefined,
    });

export const useSpaces = (projectUuid: string) => {
    return useQuery<Space[], ApiError>({
        queryKey: ['spaces', projectUuid],
        queryFn: () => getSpaces(projectUuid),
    });
};

export const useSavedCharts = (projectUuid: string) => {
    const spaces = useSpaces(projectUuid);
    const allCharts = spaces.data?.flatMap((space) => space.queries);
    return { ...spaces, data: allCharts };
};

const getSpace = async (projectUuid: string, spaceUuid: string) =>
    lightdashApi<Space>({
        url: `/projects/${projectUuid}/spaces/${spaceUuid}`,
        method: 'GET',
        body: undefined,
    });

export const useSpace = (projectUuid: string, spaceUuid: string) =>
    useQuery<Space, ApiError>({
        queryKey: ['space', projectUuid, spaceUuid],
        queryFn: () => getSpace(projectUuid, spaceUuid),
    });

const deleteQuery = async (projectUuid: string, spaceUuid: string) =>
    lightdashApi<undefined>({
        url: `/projects/${projectUuid}/spaces/${spaceUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteMutation = (projectUuid: string) => {
    const history = useHistory();
    const { showToastSuccess, showToastError } = useApp();
    const queryClient = useQueryClient();

    return useMutation<undefined, ApiError, string>(
        (spaceUuid) => deleteQuery(projectUuid, spaceUuid),
        {
            mutationKey: ['space_delete', projectUuid],
            onSuccess: async () => {
                await queryClient.refetchQueries(['spaces', projectUuid]);
                history.push({
                    pathname: `/projects/${projectUuid}/home`,
                });
                showToastSuccess({
                    title: `Success! Space was deleted.`,
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to delete space`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

const updateSpace = async (
    projectUuid: string,
    spaceUuid: string,
    data: UpdateSpace,
) =>
    lightdashApi<Space>({
        url: `/projects/${projectUuid}/spaces/${spaceUuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useUpdateMutation = (projectUuid: string, spaceUuid: string) => {
    const { showToastSuccess, showToastError } = useApp();
    const queryClient = useQueryClient();

    return useMutation<Space, ApiError, UpdateSpace>(
        (data) => updateSpace(projectUuid, spaceUuid, data),
        {
            mutationKey: ['space_update', projectUuid],
            onSuccess: async (data) => {
                await queryClient.refetchQueries(['spaces', projectUuid]);
                queryClient.setQueryData(
                    ['space', projectUuid, spaceUuid],
                    data,
                );

                showToastSuccess({
                    title: `Success! Space was updated.`,
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to update space`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

const createSpace = async (projectUuid: string, data: CreateSpace) =>
    lightdashApi<Space>({
        url: `/projects/${projectUuid}/spaces/`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useCreateMutation = (projectUuid: string) => {
    const { showToastSuccess, showToastError } = useApp();
    const queryClient = useQueryClient();

    return useMutation<Space, ApiError, CreateSpace>(
        (data) => createSpace(projectUuid, data),
        {
            mutationKey: ['space_create', projectUuid],
            onSuccess: async () => {
                await queryClient.refetchQueries(['spaces', projectUuid]);

                showToastSuccess({
                    title: `Success! Space was created.`,
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to create space`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};
