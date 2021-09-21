import {
    ApiError,
    CreateSavedQuery,
    CreateSavedQueryVersion,
    SavedQuery,
    UpdateSavedQuery,
} from 'common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useHistory, useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';

const createSavedQuery = async (projectUuid: string, data: CreateSavedQuery) =>
    lightdashApi<SavedQuery>({
        url: `/projects/${projectUuid}/saved`,
        method: 'POST',
        body: JSON.stringify({ savedQuery: data }),
    });

const deleteSavedQuery = async (id: string) =>
    lightdashApi<undefined>({
        url: `/saved/${id}`,
        method: 'DELETE',
        body: undefined,
    });

const updateSavedQuery = async (id: string, data: UpdateSavedQuery) =>
    lightdashApi<SavedQuery>({
        url: `/saved/${id}`,
        method: 'PATCH',
        body: JSON.stringify({ savedQuery: data }),
    });

const getSavedQuery = async (id: string) =>
    lightdashApi<SavedQuery>({
        url: `/saved/${id}`,
        method: 'GET',
        body: undefined,
    });

const addVersionSavedQuery = async ({
    uuid,
    data,
}: {
    uuid: string;
    data: CreateSavedQueryVersion;
}) =>
    lightdashApi<SavedQuery>({
        url: `/saved/${uuid}/version`,
        method: 'POST',
        body: JSON.stringify({ savedQuery: data }),
    });

interface Args {
    id?: string;
}

export const useSavedQuery = ({ id }: Args = {}) =>
    useQuery<SavedQuery, ApiError>({
        queryKey: ['saved_query', id],
        queryFn: () => getSavedQuery(id || ''),
        enabled: id !== undefined,
        retry: false,
    });

export const useDeleteMutation = () => {
    const history = useHistory();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useApp();
    return useMutation<undefined, ApiError, string>(deleteSavedQuery, {
        mutationKey: ['saved_query_create'],
        onSuccess: async () => {
            await queryClient.invalidateQueries('spaces');
            showToastSuccess({
                title: `Chart deleted with success`,
            });
            history.push({
                pathname: `/saved`,
            });
        },
        onError: (error) => {
            showToastError({
                title: `Failed to delete chart`,
                subtitle: error.error.message,
            });
        },
    });
};

export const useUpdateMutation = (savedQueryUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useApp();
    return useMutation<SavedQuery, ApiError, UpdateSavedQuery>(
        (data) => updateSavedQuery(savedQueryUuid, data),
        {
            mutationKey: ['saved_query_create'],
            onSuccess: async (data) => {
                await queryClient.invalidateQueries('spaces');
                queryClient.setQueryData(['saved_query', data.uuid], data);
                showToastSuccess({
                    title: `Chart saved with success`,
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to save chart`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

export const useCreateMutation = () => {
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useApp();
    return useMutation<SavedQuery, ApiError, CreateSavedQuery>(
        (data) => createSavedQuery(projectUuid, data),
        {
            mutationKey: ['saved_query_create'],
            onSuccess: (data) => {
                queryClient.setQueryData(['saved_query', data.uuid], data);
                showToastSuccess({
                    title: `Chart updated with success`,
                });
                history.push({
                    pathname: `/saved/${data.uuid}`,
                    state: {
                        fromExplorer: true,
                    },
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to save chart`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

export const useAddVersionMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useApp();
    return useMutation<
        SavedQuery,
        ApiError,
        { uuid: string; data: CreateSavedQueryVersion }
    >(addVersionSavedQuery, {
        mutationKey: ['saved_query_version'],
        onSuccess: (data) => {
            queryClient.setQueryData(['saved_query', data.uuid], data);
            showToastSuccess({
                title: `Chart saved with success`,
            });
        },
        onError: (error) => {
            showToastError({
                title: `Failed to save chart`,
                subtitle: error.error.message,
            });
        },
    });
};
