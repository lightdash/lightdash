import {
    ApiError,
    ApiJobStartedResults,
    CreateProject,
    MostPopularAndRecentlyUpdated,
    Project,
    UpdateProject,
    UserWarehouseCredentials,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { useActiveJob } from '../providers/ActiveJobProvider';
import useToaster from './toaster/useToaster';
import useQueryError from './useQueryError';

const createProject = async (data: CreateProject) =>
    lightdashApi<ApiJobStartedResults>({
        url: `/org/projects/precompiled`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateProject = async (id: string, data: UpdateProject) =>
    lightdashApi<ApiJobStartedResults>({
        url: `/projects/${id}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const getProject = async (id: string) =>
    lightdashApi<Project>({
        url: `/projects/${id}`,
        method: 'GET',
        body: undefined,
    });

export const useProject = (id: string | undefined) => {
    const setErrorResponse = useQueryError();
    return useQuery<Project, ApiError>({
        queryKey: ['project', id],
        queryFn: () => getProject(id || ''),
        enabled: id !== undefined,
        retry: false,
        onError: (result) => setErrorResponse(result),
    });
};

export const useUpdateMutation = (id: string) => {
    const queryClient = useQueryClient();
    const { setActiveJobId } = useActiveJob();
    const { showToastError } = useToaster();
    return useMutation<ApiJobStartedResults, ApiError, UpdateProject>(
        (data) => updateProject(id, data),
        {
            mutationKey: ['project_update', id],
            onSuccess: async (data) => {
                setActiveJobId(data.jobUuid);

                await queryClient.invalidateQueries(['projects']);
                await queryClient.invalidateQueries(['project', id]);
                await queryClient.invalidateQueries(['tables']);
                await queryClient.invalidateQueries(['queryResults']);
                await queryClient.invalidateQueries(['status']);
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to update project`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

export const useCreateMutation = () => {
    const { setActiveJobId } = useActiveJob();
    const { showToastError } = useToaster();
    return useMutation<ApiJobStartedResults, ApiError, CreateProject>(
        (data) => createProject(data),
        {
            mutationKey: ['project_create'],
            retry: 3,
            onSuccess: (data) => {
                setActiveJobId(data.jobUuid);
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to create project`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

const getMostPopularAndRecentlyUpdated = async (projectUuid: string) =>
    lightdashApi<MostPopularAndRecentlyUpdated>({
        url: `/projects/${projectUuid}/most-popular-and-recently-updated`,
        method: 'GET',
        body: undefined,
    });

export const useMostPopularAndRecentlyUpdated = (projectUuid: string) =>
    useQuery<MostPopularAndRecentlyUpdated, ApiError>({
        queryKey: ['most-popular-and-recently-updated', projectUuid],
        queryFn: () => getMostPopularAndRecentlyUpdated(projectUuid || ''),
    });

const getProjectUserWarehouseCredentialsPreference = async (
    projectUuid: string,
) =>
    lightdashApi<UserWarehouseCredentials>({
        url: `/projects/${projectUuid}/user-credentials`,
        method: 'GET',
        body: undefined,
    });

export const useProjectUserWarehouseCredentialsPreference = (
    projectUuid: string | undefined,
) => {
    return useQuery<UserWarehouseCredentials, ApiError>({
        queryKey: [
            'project-user-warehouse-credentials-preference',
            projectUuid,
        ],
        queryFn: () =>
            getProjectUserWarehouseCredentialsPreference(projectUuid!),
        enabled: projectUuid !== undefined,
        retry: false,
    });
};

const updateProjectUserWarehouseCredentialsPreference = async (
    projectUuid: string,
    userWarehouseCredentialsUuid: string,
) =>
    lightdashApi<null>({
        url: `/projects/${projectUuid}/user-credentials/${userWarehouseCredentialsUuid}`,
        method: 'PATCH',
        body: undefined,
    });

export const useProjectUserWarehouseCredentialsPreferenceMutation = () => {
    const queryClient = useQueryClient();
    const { showToastError, showToastSuccess } = useToaster();
    return useMutation<
        null,
        ApiError,
        { projectUuid: string; userWarehouseCredentialsUuid: string }
    >(
        ({ projectUuid, userWarehouseCredentialsUuid }) =>
            updateProjectUserWarehouseCredentialsPreference(
                projectUuid,
                userWarehouseCredentialsUuid,
            ),
        {
            mutationKey: ['update-project-user-credentials-preference'],
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    'project-user-warehouse-credentials-preference',
                ]);
                showToastSuccess({
                    title: 'Credentials preference saved successfully',
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to save credentials preference`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};
