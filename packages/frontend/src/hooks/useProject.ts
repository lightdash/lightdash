import {
    type AgentSqlScope,
    type ApiDataTimezonePreviewResults,
    type ApiCreateProjectResults,
    type ApiError,
    type ApiJobStartedResults,
    type ApiWarehouseConnectionTestBody,
    type WarehouseConnectionTestResults,
    type CreateProject,
    omitEmptySecrets,
    type CreateWarehouseCredentials,
    type DataTimezonePreviewRequest,
    type MostPopularAndRecentlyUpdated,
    type Project,
    type UpdateAgentSqlScope,
    type UpdateDefaultUserSpaces,
    type UpdateProject,
    type UpdateQueryTimezoneSettings,
    type UpdateSchedulerSettings,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useLocation } from 'react-router';
import { type LightdashApi } from '../api';
import useActiveJob from '../providers/ActiveJob/useActiveJob';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';
import useToaster from './toaster/useToaster';
import { getInFlightJobUuidFromError } from './useActiveCreateProjectJob';
import useQueryError from './useQueryError';

const createProject = async (lightdashApi: LightdashApi, data: CreateProject) =>
    lightdashApi<ApiJobStartedResults>({
        url: `/org/projects/precompiled`,
        method: 'POST',
        body: JSON.stringify(data),
        sensitive: true,
        diagnoseTransportFailures: true,
    });

const createProjectWithoutCompile = async (
    lightdashApi: LightdashApi,
    data: CreateProject,
) =>
    lightdashApi<ApiCreateProjectResults>({
        url: `/org/projects`,
        method: 'POST',
        body: JSON.stringify(data),
        sensitive: true,
        diagnoseTransportFailures: true,
    });

const updateProject = async (
    lightdashApi: LightdashApi,
    uuid: string,
    data: UpdateProject,
) =>
    lightdashApi<ApiJobStartedResults>({
        url: `/projects/${uuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
        sensitive: true,
        diagnoseTransportFailures: true,
    });

export const getProject = async (lightdashApi: LightdashApi, uuid: string) =>
    lightdashApi<Project>({
        url: `/projects/${uuid}`,
        method: 'GET',
        body: undefined,
    });

const postDataTimezonePreview = async (
    lightdashApi: LightdashApi,
    body: DataTimezonePreviewRequest,
) =>
    lightdashApi<ApiDataTimezonePreviewResults>({
        url: `/projects/preview-data-timezone`,
        method: 'POST',
        body: JSON.stringify(body),
    });

export const useDataTimezonePreviewMutation = () => {
    const lightdashApi = useLightdashApi();
    return useMutation<
        ApiDataTimezonePreviewResults,
        ApiError,
        DataTimezonePreviewRequest
    >({
        mutationFn: (body: DataTimezonePreviewRequest) =>
            postDataTimezonePreview(lightdashApi, body),
    });
};

const updateProjectSchedulerSettings = async (
    lightdashApi: LightdashApi,
    uuid: string,
    data: UpdateSchedulerSettings,
) =>
    lightdashApi<undefined>({
        url: `/projects/${uuid}/schedulerSettings`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useProject = (
    id: string | undefined,
    options?: UseQueryOptions<Project, ApiError>,
) => {
    const lightdashApi = useLightdashApi();
    const setErrorResponse = useQueryError();
    return useQuery<Project, ApiError>({
        queryKey: ['project', id],
        queryFn: () => getProject(lightdashApi, id || ''),
        enabled: !!id,
        retry: false,
        onError: (result) => setErrorResponse(result),
        ...options,
    });
};

export const useUpdateMutation = (uuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { setActiveJobId } = useActiveJob();
    const { showToastApiError } = useToaster();
    return useMutation<ApiJobStartedResults, ApiError, UpdateProject>(
        (data) => updateProject(lightdashApi, uuid, data),
        {
            mutationKey: ['project_update', uuid],
            onSuccess: async (data) => {
                setActiveJobId(data.jobUuid);

                await queryClient.invalidateQueries(['projects']);
                await queryClient.invalidateQueries(['project', uuid]);
                await queryClient.invalidateQueries(['tables']);
                await queryClient.invalidateQueries(['query-all-results'], {
                    exact: false,
                });
                await queryClient.invalidateQueries(['status']);
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to update project`,
                    apiError: error,
                });
            },
        },
    );
};

export const useCreateMutation = (options?: {
    quietJobToast?: boolean;
    warehouseOnly?: boolean;
}) => {
    const lightdashApi = useLightdashApi();
    const { setActiveJobId, setQuietActiveJobId } = useActiveJob();
    const { showToastApiError, showToastInfo } = useToaster();
    const { track } = useTracking();
    const { pathname } = useLocation();
    const onboardingFlow = pathname.startsWith('/onboarding/')
        ? 'new'
        : 'legacy';
    return useMutation<ApiJobStartedResults, ApiError, CreateProject>(
        (data) => createProject(lightdashApi, data),
        {
            mutationKey: ['project_create'],
            retry: (failureCount, { error }) =>
                error.statusCode !== 409 && failureCount < 3,
            onSuccess: (data) => {
                if (options?.quietJobToast) {
                    setQuietActiveJobId(data.jobUuid);
                } else {
                    setActiveJobId(data.jobUuid);
                }
            },
            onError: ({ error }, data) => {
                const inFlightJobUuid = getInFlightJobUuidFromError(error);
                if (inFlightJobUuid) {
                    if (options?.quietJobToast) {
                        setQuietActiveJobId(inFlightJobUuid);
                    } else {
                        setActiveJobId(inFlightJobUuid);
                    }
                    return;
                }
                if (error.statusCode === 409) {
                    showToastInfo({ title: error.message });
                    return;
                }
                track({
                    name: EventName.CREATE_PROJECT_FAILED,
                    properties: {
                        warehouse: data.warehouseConnection.type,
                        errorType: error.name,
                        warehouseOnly: options?.warehouseOnly,
                        onboardingFlow,
                    },
                });
                showToastApiError({
                    title: `Failed to create project`,
                    apiError: error,
                });
            },
        },
    );
};

export const useCreateProjectWithoutCompileMutation = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<ApiCreateProjectResults, ApiError, CreateProject>(
        (data) => createProjectWithoutCompile(lightdashApi, data),
        {
            mutationKey: ['project_create_without_compile'],
            retry: false,
            onSuccess: async () => {
                await queryClient.invalidateQueries(['projects']);
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to create project',
                    apiError: error,
                });
            },
        },
    );
};

const updateWarehouseCredentials = async (
    lightdashApi: LightdashApi,
    uuid: string,
    warehouseCredentials: CreateWarehouseCredentials,
) =>
    lightdashApi<undefined>({
        url: `/projects/${uuid}/warehouse-credentials`,
        method: 'PUT',
        body: JSON.stringify({
            warehouseConnection: warehouseCredentials,
        }),
        sensitive: true,
    });

const testWarehouseConnection = async (
    lightdashApi: LightdashApi,
    uuid: string,
    body: ApiWarehouseConnectionTestBody,
) =>
    lightdashApi<WarehouseConnectionTestResults>({
        url: `/projects/${uuid}/warehouse/test`,
        method: 'POST',
        body: JSON.stringify(body),
        sensitive: true,
        diagnoseTransportFailures: true,
    });

export const useTestWarehouseConnectionMutation = (uuid: string) => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError } = useToaster();
    return useMutation<
        WarehouseConnectionTestResults,
        ApiError,
        CreateWarehouseCredentials
    >(
        (warehouseConnection) =>
            testWarehouseConnection(lightdashApi, uuid, {
                warehouseConnection: omitEmptySecrets(warehouseConnection),
            }),
        {
            mutationKey: ['project_warehouse_connection_test', uuid],
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Could not run the connection test',
                    apiError: error,
                });
            },
        },
    );
};

export const useUpdateWarehouseCredentialsMutation = (uuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<undefined, ApiError, CreateWarehouseCredentials>(
        (warehouseCredentials) =>
            updateWarehouseCredentials(
                lightdashApi,
                uuid,
                warehouseCredentials,
            ),
        {
            mutationKey: ['project_warehouse_credentials_update', uuid],
            onSuccess: async () => {
                showToastSuccess({
                    title: 'Warehouse credentials updated',
                });
                await queryClient.invalidateQueries(['project', uuid]);
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to update warehouse credentials',
                    apiError: error,
                });
            },
        },
    );
};

const getMostPopularAndRecentlyUpdated = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<MostPopularAndRecentlyUpdated>({
        url: `/projects/${projectUuid}/most-popular-and-recently-updated`,
        method: 'GET',
        body: undefined,
    });

export const useMostPopularAndRecentlyUpdated = (
    projectUuid: string | undefined,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<MostPopularAndRecentlyUpdated, ApiError>({
        queryKey: ['most-popular-and-recently-updated', projectUuid],
        queryFn: () =>
            getMostPopularAndRecentlyUpdated(lightdashApi, projectUuid!),
        enabled: !!projectUuid,
    });
};

export const useProjectUpdateSchedulerSettings = (uuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError, UpdateSchedulerSettings>(
        (data) => updateProjectSchedulerSettings(lightdashApi, uuid, data),
        {
            mutationKey: ['project_scheduler_settings_update', uuid],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['project', uuid]);
                await queryClient.invalidateQueries(['schedulerLogs']);
            },
        },
    );
};

const updateQueryTimezoneSettings = async (
    lightdashApi: LightdashApi,
    uuid: string,
    data: UpdateQueryTimezoneSettings,
) =>
    lightdashApi<undefined>({
        url: `/projects/${uuid}/queryTimezoneSettings`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useProjectUpdateQueryTimezoneSettings = (uuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError, UpdateQueryTimezoneSettings>(
        (data) => updateQueryTimezoneSettings(lightdashApi, uuid, data),
        {
            mutationKey: ['project_query_timezone_settings_update', uuid],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['project', uuid]);
            },
        },
    );
};

const getAgentSqlScope = async (lightdashApi: LightdashApi, uuid: string) =>
    lightdashApi<AgentSqlScope | null>({
        url: `/projects/${uuid}/agentSqlScope`,
        method: 'GET',
        body: undefined,
    });

export const useAgentSqlScope = (uuid: string) => {
    const lightdashApi = useLightdashApi();
    return useQuery<AgentSqlScope | null, ApiError>({
        queryKey: ['project_agent_sql_scope', uuid],
        queryFn: () => getAgentSqlScope(lightdashApi, uuid),
    });
};

const updateAgentSqlScope = async (
    lightdashApi: LightdashApi,
    uuid: string,
    data: UpdateAgentSqlScope,
) =>
    lightdashApi<undefined>({
        url: `/projects/${uuid}/agentSqlScope`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useProjectUpdateAgentSqlScope = (uuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError, UpdateAgentSqlScope>(
        (data) => updateAgentSqlScope(lightdashApi, uuid, data),
        {
            mutationKey: ['project_agent_sql_scope_update', uuid],
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    'project_agent_sql_scope',
                    uuid,
                ]);
                await queryClient.invalidateQueries(['project', uuid]);
            },
        },
    );
};

const updateDefaultUserSpaces = async (
    lightdashApi: LightdashApi,
    uuid: string,
    data: UpdateDefaultUserSpaces,
) =>
    lightdashApi<undefined>({
        url: `/projects/${uuid}/hasDefaultUserSpaces`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const updateProjectColorPalette = async (
    lightdashApi: LightdashApi,
    uuid: string,
    colorPaletteUuid: string | null,
) =>
    lightdashApi<undefined>({
        url: `/projects/${uuid}/colorPalette`,
        method: 'PATCH',
        body: JSON.stringify({ colorPaletteUuid }),
    });

export const useUpdateProjectColorPalette = (uuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<undefined, ApiError, string | null>(
        (colorPaletteUuid) =>
            updateProjectColorPalette(lightdashApi, uuid, colorPaletteUuid),
        {
            mutationKey: ['project_color_palette_update', uuid],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['project', uuid]);
                showToastSuccess({
                    title: 'Project color palette updated',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to update project color palette',
                    apiError: error,
                });
            },
        },
    );
};

export const useUpdateDefaultUserSpaces = (uuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<undefined, ApiError, UpdateDefaultUserSpaces>(
        (data) => updateDefaultUserSpaces(lightdashApi, uuid, data),
        {
            mutationKey: ['project_default_user_spaces_update', uuid],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['project', uuid]);
                showToastSuccess({
                    title: 'Default user spaces updated',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to update default user spaces',
                    apiError: error,
                });
            },
        },
    );
};
