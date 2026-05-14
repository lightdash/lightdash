import {
    type ApiError,
    type ChartHistory,
    type ChartVersion,
    type CreateSavedChart,
    type CreateSavedChartVersion,
    type SavedChart,
    type UpdateSavedChart,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationOptions,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { lightdashApi } from '../api';
import useApp from '../providers/App/useApp';
import { convertDateFilters } from '../utils/dateFilter';
import useToaster from './toaster/useToaster';
import { invalidateContent } from './useContent';
import useSearchParams from './useSearchParams';

const isCustomSqlDimensionForbiddenError = (
    error: ApiError['error'],
): boolean =>
    error.statusCode === 403 &&
    typeof error.message === 'string' &&
    error.message.toLowerCase().includes('custom sql dimensions');

const createSavedQuery = async (
    projectUuid: string,
    payload: CreateSavedChart,
): Promise<SavedChart> => {
    const timezoneFixPayload: CreateSavedChart = {
        ...payload,
        metricQuery: {
            ...payload.metricQuery,
            filters: convertDateFilters(payload.metricQuery.filters),
        },
        parameters: payload.parameters,
    };
    return lightdashApi<SavedChart>({
        url: `/projects/${projectUuid}/saved`,
        method: 'POST',
        body: JSON.stringify(timezoneFixPayload),
    });
};

const duplicateSavedQuery = async (
    projectUuid: string,
    chartUuid: string,
    data: { chartName: string; chartDesc: string },
): Promise<SavedChart> =>
    lightdashApi<SavedChart>({
        url: `/projects/${projectUuid}/saved?duplicateFrom=${chartUuid}`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const deleteSavedQuery = async (id: string, projectUuid: string) =>
    lightdashApi<null>({
        url: `/projects/${projectUuid}/saved/${id}`,
        version: 'v2',
        method: 'DELETE',
        body: undefined,
    });

const updateSavedQuery = async (
    id: string,
    data: UpdateSavedChart,
): Promise<SavedChart> => {
    return lightdashApi<SavedChart>({
        url: `/saved/${id}`,
        method: 'PATCH',
        body: JSON.stringify({
            name: data.name,
            description: data.description,
            spaceUuid: data.spaceUuid,
            colorPaletteUuid: data.colorPaletteUuid,
        }),
    });
};

const getSavedQuery = async (
    id: string,
    projectUuid: string,
): Promise<SavedChart> =>
    lightdashApi<SavedChart>({
        url: `/projects/${projectUuid}/saved/${id}`,
        version: 'v2',
        method: 'GET',
        body: undefined,
    });

const addVersionSavedQuery = async ({
    uuid,
    payload,
}: {
    uuid: string;
    payload: CreateSavedChartVersion;
}): Promise<SavedChart> => {
    const timezoneFixPayload: CreateSavedChartVersion = {
        ...payload,
        metricQuery: {
            ...payload.metricQuery,
            filters: convertDateFilters(payload.metricQuery.filters),
            timezone: payload.metricQuery.timezone ?? undefined,
        },
    };
    return lightdashApi<SavedChart>({
        url: `/saved/${uuid}/version`,
        method: 'POST',
        body: JSON.stringify(timezoneFixPayload),
    });
};

interface Args {
    uuidOrSlug?: string;
    projectUuid?: string;
    useQueryOptions?: UseQueryOptions<SavedChart, ApiError>;
}

export const useSavedQuery = ({
    uuidOrSlug,
    projectUuid,
    useQueryOptions,
}: Args) =>
    useQuery<SavedChart, ApiError>({
        queryKey: ['saved_query', uuidOrSlug, projectUuid],
        queryFn: async () => {
            if (!projectUuid) throw new Error('projectUuid is required');
            return getSavedQuery(uuidOrSlug || '', projectUuid);
        },
        enabled: uuidOrSlug !== undefined && !!projectUuid,
        retry: false,
        ...useQueryOptions,
    });

const getChartHistoryQuery = async (chartUuid: string): Promise<ChartHistory> =>
    lightdashApi<ChartHistory>({
        url: `/saved/${chartUuid}/history`,
        method: 'GET',
        body: undefined,
    });

export const useChartHistory = (chartUuid: string | undefined) =>
    useQuery<ChartHistory, ApiError>({
        queryKey: ['chart_history', chartUuid],
        queryFn: () => getChartHistoryQuery(chartUuid!),
        enabled: chartUuid !== undefined,
        retry: false,
    });
const getChartVersionQuery = async (
    chartUuid: string,
    versionUuid: string,
): Promise<ChartVersion> =>
    lightdashApi<ChartVersion>({
        url: `/saved/${chartUuid}/version/${versionUuid}`,
        method: 'GET',
        body: undefined,
    });

export const useChartVersion = (
    chartUuid: string | undefined,
    versionUuid?: string,
) =>
    useQuery<ChartVersion, ApiError>({
        queryKey: ['chart_version', chartUuid, versionUuid],
        queryFn: () => getChartVersionQuery(chartUuid!, versionUuid!),
        enabled: versionUuid !== undefined && chartUuid !== undefined,
        retry: false,
    });

const rollbackChartQuery = async (
    chartUuid: string,
    versionUuid: string,
): Promise<null> =>
    lightdashApi<null>({
        url: `/saved/${chartUuid}/rollback/${versionUuid}`,
        method: 'POST',
        body: undefined,
    });
export const useChartVersionRollbackMutation = (
    chartUuid: string | undefined,
    useMutationOptions?: Omit<
        UseMutationOptions<null, ApiError, string, unknown>,
        'mutationFn'
    >,
) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, string>(
        (versionUuid: string) =>
            chartUuid && versionUuid
                ? rollbackChartQuery(chartUuid, versionUuid)
                : Promise.reject(),
        {
            mutationKey: ['saved_query_rollback'],
            ...useMutationOptions,
            onSuccess: async (...args) => {
                await queryClient.invalidateQueries(['saved_query']);
                await queryClient.invalidateQueries([
                    'chart_history',
                    chartUuid,
                ]);
                await queryClient.resetQueries({
                    predicate: (query) =>
                        query.queryKey[0] === 'dashboard_chart_ready_query' &&
                        query.queryKey[2] === chartUuid,
                });
                showToastSuccess({
                    title: `Success! Chart was reverted.`,
                });
                useMutationOptions?.onSuccess?.(...args);
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to revert chart`,
                    apiError: error,
                });
            },
        },
    );
};

export const useSavedQueryDeleteMutation = (projectUuid?: string) => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { health } = useApp();
    const isSoftDeleteEnabled = health.data?.softDelete.enabled ?? false;
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, string>(
        async (data) => {
            if (!projectUuid) {
                throw new Error('Project UUID is undefined');
            }
            queryClient.removeQueries(['savedChartResults', data]);
            return deleteSavedQuery(data, projectUuid);
        },
        {
            mutationKey: ['saved_query_create'],
            onSuccess: async () => {
                if (!projectUuid) return;
                await invalidateContent(queryClient, projectUuid);
                await queryClient.invalidateQueries(['deletedContent']);

                showToastSuccess({
                    title: `Success! Chart was deleted.`,
                    action: isSoftDeleteEnabled
                        ? {
                              children: 'Go to recently deleted',
                              icon: IconArrowRight,
                              onClick: () =>
                                  navigate(
                                      `/generalSettings/projectManagement/${projectUuid}/recentlyDeleted`,
                                  ),
                          }
                        : undefined,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to delete chart`,
                    apiError: error,
                });
            },
        },
    );
};

export const useUpdateMutation = (
    dashboardUuid?: string,
    savedQueryUuid?: string,
) => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const params = useParams();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<
        SavedChart,
        ApiError,
        Pick<UpdateSavedChart, 'name' | 'description' | 'colorPaletteUuid'>
    >(
        (data) => {
            if (savedQueryUuid) {
                return updateSavedQuery(savedQueryUuid, data);
            }
            throw new Error('Saved chart ID is undefined');
        },
        {
            mutationKey: ['saved_query_create'],
            onSuccess: async (data) => {
                await queryClient.invalidateQueries([
                    'space',
                    data.projectUuid,
                ]);

                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                await queryClient.invalidateQueries(['content']);

                await queryClient.invalidateQueries(['spaces']);

                await queryClient.invalidateQueries([
                    'project',
                    data.projectUuid,
                    'color-palette',
                ]);

                queryClient.setQueryData(
                    ['saved_query', data.uuid, data.projectUuid],
                    data,
                );
                queryClient.setQueryData(
                    ['saved_query', params.savedQueryUuid, data.projectUuid],
                    data,
                );

                // Always invalidate dashboard chart queries for this chart,
                // regardless of whether we came from a dashboard
                await queryClient.resetQueries({
                    predicate: (query) =>
                        query.queryKey[0] === 'dashboard_chart_ready_query' &&
                        query.queryKey[2] === data.uuid,
                });

                showToastSuccess({
                    title: `Success! Chart was saved.`,
                    action: dashboardUuid
                        ? {
                              children: 'Open dashboard',
                              icon: IconArrowRight,
                              onClick: () =>
                                  navigate(
                                      `/projects/${data.projectUuid}/dashboards/${dashboardUuid}`,
                                  ),
                          }
                        : undefined,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to save chart`,
                    apiError: error,
                });
            },
        },
    );
};

export const useCreateMutation = ({
    redirectOnSuccess = true,
    showToastOnSuccess = true,
}: { redirectOnSuccess?: boolean; showToastOnSuccess?: boolean } = {}) => {
    const navigate = useNavigate();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError, showToastApiError } =
        useToaster();
    return useMutation<SavedChart, ApiError, CreateSavedChart>(
        (data) =>
            projectUuid
                ? createSavedQuery(projectUuid, data)
                : Promise.reject(),
        {
            mutationKey: ['saved_query_create', projectUuid],
            onSuccess: (data) => {
                const navigateUrl = `/projects/${projectUuid}/saved/${data.uuid}/view`;
                queryClient.setQueryData(
                    ['saved_query', data.uuid, data.projectUuid],
                    data,
                );
                if (showToastOnSuccess) {
                    showToastSuccess({
                        title: `Success! Chart was saved.`,
                        action: redirectOnSuccess
                            ? undefined
                            : {
                                  children: 'View chart',
                                  icon: IconArrowRight,
                                  onClick: () => navigate(navigateUrl),
                              },
                    });
                }
                if (redirectOnSuccess) {
                    void navigate(navigateUrl, {
                        replace: true,
                    });
                }
            },
            onError: ({ error }) => {
                if (isCustomSqlDimensionForbiddenError(error)) {
                    showToastError({
                        title: "Can't save chart",
                        subtitle:
                            "You don't have permission to author custom SQL dimensions. Remove them from your chart to save.",
                    });
                    return;
                }
                showToastApiError({
                    title: `Failed to save chart`,
                    apiError: error,
                });
            },
        },
    );
};

type DuplicateChartMutationOptions = {
    showRedirectButton?: boolean;
    successMessage?: string;
    autoRedirect?: boolean;
};

export const useDuplicateChartMutation = (
    options?: DuplicateChartMutationOptions,
) => {
    const navigate = useNavigate();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        SavedChart,
        ApiError,
        Pick<SavedChart, 'uuid' | 'name' | 'description'>
    >(
        ({ uuid, name, description }) =>
            projectUuid
                ? duplicateSavedQuery(projectUuid, uuid, {
                      chartName: name,
                      chartDesc: description ?? '',
                  })
                : Promise.reject(),
        {
            mutationKey: ['saved_query_create', projectUuid],
            onSuccess: async (data) => {
                await queryClient.invalidateQueries(['spaces']);
                await queryClient.invalidateQueries(['space', projectUuid]);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                await queryClient.invalidateQueries(['content']);

                if (
                    !options?.showRedirectButton &&
                    options?.autoRedirect !== false
                ) {
                    void navigate(
                        `/projects/${projectUuid}/saved/${data.uuid}`,
                    );
                }

                showToastSuccess({
                    title:
                        options?.successMessage ||
                        `Chart successfully duplicated!`,
                    action: options?.showRedirectButton
                        ? {
                              children: 'Open chart',
                              icon: IconArrowRight,
                              onClick: () => {
                                  void navigate(
                                      `/projects/${projectUuid}/saved/${data.uuid}`,
                                  );
                              },
                          }
                        : undefined,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to duplicate chart`,
                    apiError: error,
                });
            },
        },
    );
};

export const useAddVersionMutation = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const dashboardUuid = useSearchParams('fromDashboard');

    const { showToastSuccess, showToastError, showToastApiError } =
        useToaster();
    return useMutation<
        SavedChart,
        ApiError,
        { uuid: string; payload: CreateSavedChartVersion }
    >(addVersionSavedQuery, {
        mutationKey: ['saved_query_version'],
        onSuccess: async (data) => {
            await queryClient.invalidateQueries(['spaces']);
            await queryClient.invalidateQueries([
                'most-popular-and-recently-updated',
            ]);

            await queryClient.invalidateQueries([
                'project',
                data.projectUuid,
                'color-palette',
            ]);

            queryClient.setQueryData(
                ['saved_query', data.uuid, data.projectUuid],
                data,
            );
            await queryClient.resetQueries(['savedChartResults', data.uuid]);
            await queryClient.invalidateQueries(['chart_history', data.uuid]);

            // Always invalidate dashboard chart queries for this chart,
            // regardless of whether we came from a dashboard
            await queryClient.resetQueries({
                predicate: (query) =>
                    query.queryKey[0] === 'dashboard_chart_ready_query' &&
                    query.queryKey[2] === data.uuid,
            });

            if (dashboardUuid) {
                // Reset create-query cache to sync with Redux state reset
                // This ensures auto-fetch triggers when returning to view mode
                await queryClient.resetQueries(['create-query']);
            }

            if (dashboardUuid)
                showToastSuccess({
                    title: `Success! Chart was updated.`,
                    action: {
                        children: 'Open dashboard',
                        icon: IconArrowRight,
                        onClick: () =>
                            navigate(
                                `/projects/${data.projectUuid}/dashboards/${dashboardUuid}`,
                            ),
                    },
                });
            else {
                showToastSuccess({
                    title: `Success! Chart was updated.`,
                });
                void navigate(
                    `/projects/${data.projectUuid}/saved/${data.uuid}/view`,
                );
            }
        },
        onError: ({ error }) => {
            if (isCustomSqlDimensionForbiddenError(error)) {
                showToastError({
                    title: "Can't update chart",
                    subtitle:
                        "You don't have permission to author custom SQL dimensions. Remove them from your chart to save.",
                });
                return;
            }
            showToastApiError({
                title: `Failed to update chart`,
                apiError: error,
            });
        },
    });
};
