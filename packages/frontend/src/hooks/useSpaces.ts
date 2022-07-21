import { ApiError, Space } from '@lightdash/common';
import { useMutation, useQuery } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';

export type UpdateSpace = Pick<Space, 'name'>; //TODO replace with /common
export type CreateSpace = Pick<Space, 'name'>;

const getSpaces = async (projectUuid: string) =>
    lightdashApi<Space[]>({
        url: `/projects/${projectUuid}/spaces`,
        method: 'GET',
        body: undefined,
    });

export const useSpaces = (projectUuid: string) =>
    useQuery<Space[], ApiError>({
        queryKey: ['spaces', projectUuid],
        queryFn: () => getSpaces(projectUuid),
    });

export const useSavedCharts = (projectUuid: string) => {
    const spaces = useSpaces(projectUuid);
    return { ...spaces, data: spaces.data?.[0]?.queries };
};

const deleteQuery = async (projectUuid: string, spaceUuid: string) =>
    lightdashApi<undefined>({
        url: `/projects/${projectUuid}/spaces/${spaceUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteMutation = () => {
    const { showToastSuccess, showToastError } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    return useMutation<undefined, ApiError, string>(
        (spaceUuid) => deleteQuery(projectUuid, spaceUuid),
        {
            mutationKey: ['spaces', projectUuid],
            onSuccess: async () => {
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

export const useUpdateMutation = (spaceUuid: string) => {
    const { showToastSuccess, showToastError } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    return useMutation<Space, ApiError, UpdateSpace>(
        (data) => updateSpace(projectUuid, spaceUuid, data),
        {
            mutationKey: ['spaces', projectUuid],
            onSuccess: async () => {
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

export const useCreateMutation = () => {
    const { showToastSuccess, showToastError } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    return useMutation<UpdateSpace, ApiError, CreateSpace>(
        (data) => createSpace(projectUuid, data),
        {
            mutationKey: ['spaces', projectUuid],
            onSuccess: async () => {
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
