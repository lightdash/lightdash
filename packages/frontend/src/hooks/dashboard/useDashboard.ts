import {
    formatDate,
    type ApiError,
    type ApiJobScheduledResponse,
    type CreateDashboard,
    type CreateDashboardWithCharts,
    type Dashboard,
    type DashboardAvailableFilters,
    type DashboardFilters,
    type DashboardHistory,
    type DashboardTile,
    type DashboardVersion,
    type DateGranularity,
    type ExportContentFormat,
    type SavedChartsInfoForDashboardAvailableFilters,
    type SchedulerCsvOptions,
    type SchedulerImageOptions,
    type UpdateDashboard,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { lightdashApi } from '../../api';
import { pollJobStatus } from '../../features/scheduler/hooks/useScheduler';
import useApp from '../../providers/App/useApp';
import useToaster from '../toaster/useToaster';
import { invalidateContent } from '../useContent';
import useQueryError from '../useQueryError';
import useDashboardStorage from './useDashboardStorage';

export const getDashboard = async (id: string, projectUuid: string) =>
    lightdashApi<Dashboard>({
        url: `/projects/${projectUuid}/dashboards/${id}`,
        version: 'v2',
        method: 'GET',
        body: undefined,
    });

const createDashboard = async (projectUuid: string, data: CreateDashboard) =>
    lightdashApi<Dashboard>({
        url: `/projects/${projectUuid}/dashboards`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const createDashboardWithCharts = async (
    projectUuid: string,
    data: CreateDashboardWithCharts,
) =>
    lightdashApi<Dashboard>({
        url: `/projects/${projectUuid}/dashboards/with-charts`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const duplicateDashboard = async (
    projectUuid: string,
    dashboardUuid: string,
    data: { dashboardName: string; dashboardDesc: string },
): Promise<Dashboard> =>
    lightdashApi<Dashboard>({
        url: `/projects/${projectUuid}/dashboards?duplicateFrom=${dashboardUuid}`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateDashboard = async (
    id: string,
    data: UpdateDashboard,
    projectUuid: string,
) =>
    lightdashApi<Dashboard>({
        url: `/projects/${projectUuid}/dashboards/${id}`,
        version: 'v2',
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const updateDashboardApi = updateDashboard;

const deleteDashboard = async (id: string, projectUuid: string) =>
    lightdashApi<null>({
        url: `/projects/${projectUuid}/dashboards/${id}`,
        version: 'v2',
        method: 'DELETE',
        body: undefined,
    });

const postDashboardsAvailableFilters = async (
    savedChartUuidsAndTileUuids: SavedChartsInfoForDashboardAvailableFilters,
) =>
    lightdashApi<DashboardAvailableFilters>({
        url: `/dashboards/availableFilters`,
        method: 'POST',
        body: JSON.stringify(savedChartUuidsAndTileUuids),
    });

const postEmbedDashboardsAvailableFilters = async (
    projectUuid: string,
    savedChartUuidsAndTileUuids: SavedChartsInfoForDashboardAvailableFilters,
) =>
    lightdashApi<DashboardAvailableFilters>({
        url: `/embed/${projectUuid}/dashboard/availableFilters`,
        method: 'POST',
        body: JSON.stringify(savedChartUuidsAndTileUuids),
    });

const exportDashboard = async (
    id: string,
    gridWidth: number | undefined,
    queryFilters: string,
    selectedTabs: string[] | null,
) =>
    lightdashApi<string>({
        url: `/dashboards/${id}/export`,
        method: 'POST',
        body: JSON.stringify({ queryFilters, gridWidth, selectedTabs }),
    });

export const useDashboardsAvailableFilters = (
    savedChartUuidsAndTileUuids: SavedChartsInfoForDashboardAvailableFilters,
    projectUuid?: string,
    embedToken?: string,
) =>
    useQuery<DashboardAvailableFilters, ApiError>(
        ['dashboards', 'availableFilters', ...savedChartUuidsAndTileUuids],
        () =>
            embedToken && projectUuid
                ? postEmbedDashboardsAvailableFilters(
                      projectUuid,
                      savedChartUuidsAndTileUuids,
                  )
                : postDashboardsAvailableFilters(savedChartUuidsAndTileUuids),
        {
            enabled: savedChartUuidsAndTileUuids.length > 0,
        },
    );

export const useDashboardQuery = ({
    uuidOrSlug,
    projectUuid,
    useQueryOptions,
}: {
    uuidOrSlug?: string;
    projectUuid?: string;
    useQueryOptions?: UseQueryOptions<Dashboard, ApiError>;
} = {}) => {
    const setErrorResponse = useQueryError();
    return useQuery<Dashboard, ApiError>({
        queryKey: ['saved_dashboard_query', uuidOrSlug, projectUuid],
        queryFn: async () => {
            if (!projectUuid) throw new Error('projectUuid is required');
            return getDashboard(uuidOrSlug || '', projectUuid);
        },
        enabled: !!uuidOrSlug && !!projectUuid,
        retry: false,
        onError: (result) => setErrorResponse(result),
        ...useQueryOptions,
    });
};

/**
 * Checks if the dashboard version is up to date and returns the latest dashboard if it is not
 * Helpful for refreshing the dashboard when the user wants to make changes to the dashboard
 * This is to avoid one user or multiple users overwriting each other's changes
 * @param dashboardUuid The dashboard uuid
 * @returns The latest dashboard or null if the dashboard is up to date
 */
export const useDashboardVersionRefresh = (
    dashboardUuid: string,
    projectUuid?: string,
) => {
    const queryClient = useQueryClient();

    return useMutation<Dashboard | null, ApiError, Dashboard | undefined>({
        mutationKey: ['dashboard_version_refresh', dashboardUuid],
        mutationFn: async (currentDashboard) => {
            try {
                if (!currentDashboard) {
                    throw new Error('Current dashboard is undefined');
                }
                if (!projectUuid) {
                    throw new Error('Project UUID is undefined');
                }

                const latestDashboard = await getDashboard(
                    dashboardUuid,
                    projectUuid,
                );

                const currentTime = new Date(
                    currentDashboard.updatedAt,
                ).getTime();
                const latestTime = new Date(
                    latestDashboard.updatedAt,
                ).getTime();

                const isUpToDate = latestTime <= currentTime;

                if (isUpToDate) {
                    return null;
                }

                queryClient.setQueryData(
                    ['saved_dashboard_query', dashboardUuid, projectUuid],
                    latestDashboard,
                );

                return latestDashboard;
            } catch (error) {
                console.warn('Failed to check dashboard timestamp:', error);
                return null;
            }
        },
    });
};

export const useExportDashboard = () => {
    const { showToastSuccess, showToastApiError, showToastInfo } = useToaster();
    return useMutation<
        string,
        ApiError,
        {
            dashboard: Dashboard;
            gridWidth: number | undefined;
            queryFilters: string;
            isPreview?: boolean;
            selectedTabs: string[] | null;
        }
    >(
        (data) =>
            exportDashboard(
                data.dashboard.uuid,
                data.gridWidth,
                data.queryFilters,
                data.selectedTabs,
            ),
        {
            mutationKey: ['export_dashboard'],
            onMutate: (data) => {
                showToastInfo({
                    key: 'dashboard_export_toast',
                    title: data.isPreview
                        ? `Generating preview for ${data.dashboard.name}`
                        : `${data.dashboard.name} is being exported. This might take a few seconds.`,
                    autoClose: false,
                    loading: true,
                });
            },
            onSuccess: async (url, data) => {
                if (url) {
                    if (!data.isPreview) window.open(url, '_blank');
                    showToastSuccess({
                        key: 'dashboard_export_toast',
                        title: data.isPreview
                            ? 'Success!'
                            : `Success! ${data.dashboard.name} was exported.`,
                    });
                }
            },
            onError: ({ error }, data) => {
                showToastApiError({
                    key: 'dashboard_export_toast',
                    title: data.isPreview
                        ? `Failed to generate preview for ${data.dashboard.name}`
                        : `Failed to export ${data.dashboard.name}`,
                    apiError: error,
                });
            },
        },
    );
};

const exportDashboardContent = async (
    id: string,
    data: {
        format: ExportContentFormat;
        options?: SchedulerCsvOptions | SchedulerImageOptions;
        dashboardFilters?: DashboardFilters;
        dateZoomGranularity?: DateGranularity | string;
        customViewportWidth?: number;
        selectedTabs?: string[] | null;
    },
) =>
    lightdashApi<ApiJobScheduledResponse['results']>({
        url: `/dashboards/${id}/exports`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify(data),
    });

type DashboardContentExportDetails = {
    url?: string;
    fileType?: string;
    numFailures?: number;
};

export const useExportDashboardContent = () => {
    const {
        showToastSuccess,
        showToastError,
        showToastApiError,
        showToastInfo,
        showToastWarning,
    } = useToaster();

    return useMutation<
        ApiJobScheduledResponse['results'],
        ApiError,
        {
            dashboard: Dashboard;
            format: ExportContentFormat;
            options?: SchedulerCsvOptions | SchedulerImageOptions;
            dashboardFilters?: DashboardFilters;
            dateZoomGranularity?: DateGranularity | string;
            customViewportWidth?: number;
            selectedTabs?: string[] | null;
        }
    >(
        (data) =>
            exportDashboardContent(data.dashboard.uuid, {
                format: data.format,
                options: data.options,
                dashboardFilters: data.dashboardFilters,
                dateZoomGranularity: data.dateZoomGranularity,
                customViewportWidth: data.customViewportWidth,
                selectedTabs: data.selectedTabs,
            }),
        {
            mutationKey: ['export_dashboard_content'],
            onMutate: (data) => {
                showToastInfo({
                    key: 'dashboard_export_toast',
                    title: `${data.dashboard.name} is being exported. This might take a few seconds.`,
                    autoClose: false,
                    loading: true,
                });
            },
            onSuccess: async (job, data) => {
                pollJobStatus(job.jobId)
                    .then((rawDetails) => {
                        const details =
                            rawDetails as DashboardContentExportDetails | null;

                        if (details?.url) {
                            const link = document.createElement('a');
                            link.href = details.url;
                            link.setAttribute(
                                'download',
                                `${data.dashboard.name}-${formatDate(
                                    Date.now(),
                                )}.${details.fileType ?? data.format}`,
                            );
                            document.body.appendChild(link);
                            link.click();
                            link.remove();

                            const numFailures = Number(
                                details.numFailures ?? 0,
                            );
                            if (numFailures > 0) {
                                showToastWarning({
                                    key: 'dashboard_export_toast',
                                    title: `${data.dashboard.name} was exported with ${numFailures} failed chart(s).`,
                                    subtitle:
                                        'Some charts could not be exported. The download contains only the successful ones.',
                                });
                            } else {
                                showToastSuccess({
                                    key: 'dashboard_export_toast',
                                    title: `Success! ${data.dashboard.name} was exported.`,
                                });
                            }
                        } else {
                            showToastError({
                                key: 'dashboard_export_toast',
                                title: `Missing file url for ${data.dashboard.name}`,
                                subtitle: 'Something went wrong',
                            });
                        }
                    })
                    .catch((error: Error) => {
                        showToastError({
                            key: 'dashboard_export_toast',
                            title: `Failed to export ${data.dashboard.name}`,
                            subtitle: error.message,
                        });
                    });
            },
            onError: ({ error }, data) => {
                showToastApiError({
                    key: 'dashboard_export_toast',
                    title: `Failed to export ${data.dashboard.name}`,
                    apiError: error,
                });
            },
        },
    );
};

export const useUpdateDashboard = (
    id: string | undefined,
    projectUuid: string | undefined,
    showRedirectButton: boolean = false,
    onSuccessCallback?: (dashboard: Dashboard) => void,
) => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { clearDashboardStorage } = useDashboardStorage();
    return useMutation<Dashboard, ApiError, UpdateDashboard>(
        (data) => {
            if (!id) {
                throw new Error('Dashboard id is undefined');
            }
            if (!projectUuid) {
                throw new Error('Project UUID is undefined');
            }

            return updateDashboard(id, data, projectUuid);
        },
        {
            mutationKey: ['dashboard_update'],
            onSuccess: async (updatedDashboard, variables) => {
                clearDashboardStorage();
                await queryClient.invalidateQueries(['space', projectUuid]);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);

                await queryClient.invalidateQueries(['dashboards']);
                await queryClient.invalidateQueries([
                    'dashboards-containing-chart',
                ]);
                await queryClient.resetQueries(['saved_dashboard_query', id]);
                // Remove stale chart results so navigating back doesn't
                // show old cache timestamps after a save
                queryClient.removeQueries({
                    predicate: (query) => {
                        const firstKey =
                            typeof query.queryKey === 'string'
                                ? query.queryKey
                                : query.queryKey?.[0];
                        return (
                            firstKey === 'dashboard_chart_ready_query' ||
                            firstKey === 'savedSqlChartResults'
                        );
                    },
                });
                await queryClient.invalidateQueries(['content']);
                const onlyUpdatedName: boolean =
                    Object.keys(variables).length === 1 &&
                    Object.keys(variables).includes('name');
                showToastSuccess({
                    title: `Success! Dashboard ${
                        onlyUpdatedName ? 'name ' : ''
                    }was updated.`,
                    action: showRedirectButton
                        ? {
                              children: 'Open dashboard',
                              icon: IconArrowRight,
                              onClick: () =>
                                  navigate(
                                      `/projects/${projectUuid}/dashboards/${id}`,
                                  ),
                          }
                        : undefined,
                    autoClose: 10000,
                });

                // Call the optional callback with the updated dashboard
                // This allows callers to update local state with server response
                // (e.g., to sync duplicated chart UUIDs after tab duplication)
                onSuccessCallback?.(updatedDashboard);
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to update dashboard`,
                    apiError: error,
                });
            },
        },
    );
};

export const useCreateMutation = (
    projectUuid: string | undefined,
    showRedirectButton: boolean = false,
    { showToastOnSuccess = true }: { showToastOnSuccess?: boolean } = {},
) => {
    const navigate = useNavigate();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<Dashboard, ApiError, CreateDashboard>(
        (data) =>
            projectUuid ? createDashboard(projectUuid, data) : Promise.reject(),
        {
            mutationKey: ['dashboard_create', projectUuid],
            onSuccess: async (result) => {
                await queryClient.invalidateQueries(['dashboards']);
                await queryClient.invalidateQueries([
                    'dashboards-containing-chart',
                ]);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                await queryClient.invalidateQueries(['content']);

                if (showToastOnSuccess) {
                    showToastSuccess({
                        title: `Success! Dashboard was created.`,
                        action: showRedirectButton
                            ? {
                                  children: 'Open dashboard',
                                  icon: IconArrowRight,
                                  onClick: () =>
                                      navigate(
                                          `/projects/${projectUuid}/dashboards/${result.uuid}`,
                                      ),
                              }
                            : undefined,
                    });
                }
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to create dashboard`,
                    apiError: error,
                });
            },
        },
    );
};

export const useCreateDashboardWithChartsMutation = (
    projectUuid: string | undefined,
    { showToastOnSuccess = true }: { showToastOnSuccess?: boolean } = {},
) => {
    const navigate = useNavigate();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<Dashboard, ApiError, CreateDashboardWithCharts>(
        (data) =>
            projectUuid
                ? createDashboardWithCharts(projectUuid, data)
                : Promise.reject(),
        {
            mutationKey: ['dashboard_create_with_charts', projectUuid],
            onSuccess: async (result) => {
                await queryClient.invalidateQueries(['dashboards']);
                await queryClient.invalidateQueries([
                    'dashboards-containing-chart',
                ]);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                await queryClient.invalidateQueries(['content']);

                if (showToastOnSuccess) {
                    showToastSuccess({
                        title: 'Dashboard created successfully!',
                        action: {
                            children: 'Open dashboard',
                            onClick: () =>
                                navigate(
                                    `/projects/${projectUuid}/dashboards/${result.uuid}`,
                                ),
                        },
                    });
                }
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to create dashboard',
                    apiError: error,
                });
            },
        },
    );
};

type DuplicateDashboardMutationOptions = {
    showRedirectButton: boolean;
};

export const useDuplicateDashboardMutation = (
    options?: DuplicateDashboardMutationOptions,
) => {
    const navigate = useNavigate();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        Dashboard,
        ApiError,
        Pick<Dashboard, 'uuid' | 'name' | 'description'>
    >(
        ({ uuid, name, description }) =>
            projectUuid
                ? duplicateDashboard(projectUuid, uuid, {
                      dashboardName: name,
                      dashboardDesc: description ?? '',
                  })
                : Promise.reject(),
        {
            mutationKey: ['dashboard_create', projectUuid],
            onSuccess: async (data) => {
                await queryClient.invalidateQueries(['dashboards']);
                await queryClient.invalidateQueries(['space', projectUuid]);
                await queryClient.invalidateQueries([
                    'dashboards-containing-chart',
                ]);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                await queryClient.invalidateQueries(['content']);
                showToastSuccess({
                    title: `Dashboard successfully duplicated!`,
                    action: options?.showRedirectButton
                        ? {
                              children: 'Open dashboard',
                              icon: IconArrowRight,
                              onClick: () =>
                                  navigate(
                                      `/projects/${projectUuid}/dashboards/${data.uuid}`,
                                  ),
                          }
                        : undefined,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to duplicate dashboard`,
                    apiError: error,
                });
            },
        },
    );
};

export const useDashboardDeleteMutation = (projectUuid?: string) => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { health } = useApp();
    const isSoftDeleteEnabled = health.data?.softDelete.enabled ?? false;
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, string>(
        (id) => {
            if (!projectUuid) {
                throw new Error('Project UUID is undefined');
            }
            return deleteDashboard(id, projectUuid);
        },
        {
            onSuccess: async () => {
                if (!projectUuid) return;
                await invalidateContent(queryClient, projectUuid);
                await queryClient.invalidateQueries([
                    'dashboards-containing-chart',
                ]);
                await queryClient.invalidateQueries(['deletedContent']);
                showToastSuccess({
                    title: `Deleted! Dashboard was deleted.`,
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
                    title: `Failed to delete dashboard`,
                    apiError: error,
                });
            },
        },
    );
};

const getDashboardHistory = async (
    dashboardUuid: string,
): Promise<DashboardHistory> =>
    lightdashApi<DashboardHistory>({
        url: `/dashboards/${dashboardUuid}/history`,
        method: 'GET',
        body: undefined,
    });

export const useDashboardHistory = (dashboardUuid: string | undefined) =>
    useQuery<DashboardHistory, ApiError>({
        queryKey: ['dashboard_history', dashboardUuid],
        queryFn: () => getDashboardHistory(dashboardUuid!),
        enabled: dashboardUuid !== undefined,
        retry: false,
    });

const getDashboardVersion = async (
    dashboardUuid: string,
    versionUuid: string,
): Promise<DashboardVersion> => {
    return lightdashApi<DashboardVersion>({
        url: `/dashboards/${dashboardUuid}/version/${versionUuid}`,
        method: 'GET',
        body: undefined,
    });
};

export const useDashboardVersion = (
    dashboardUuid: string | undefined,
    versionUuid: string | undefined,
) =>
    useQuery<DashboardVersion, ApiError>({
        queryKey: ['dashboard_version', dashboardUuid, versionUuid],
        queryFn: () => getDashboardVersion(dashboardUuid!, versionUuid!),
        enabled: dashboardUuid !== undefined && versionUuid !== undefined,
        retry: false,
    });

const rollbackDashboard = async (
    dashboardUuid: string,
    versionUuid: string,
): Promise<null> =>
    lightdashApi<null>({
        url: `/dashboards/${dashboardUuid}/rollback/${versionUuid}`,
        method: 'POST',
        body: undefined,
    });

export const useDashboardVersionRollbackMutation = (
    dashboardUuid: string | undefined,
) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, string>(
        (versionUuid: string) =>
            dashboardUuid && versionUuid
                ? rollbackDashboard(dashboardUuid, versionUuid)
                : Promise.reject(),
        {
            mutationKey: ['dashboard_version_rollback'],
            onSuccess: async () => {
                // Invalidate dashboard query to refresh dashboard data
                await queryClient.invalidateQueries([
                    'saved_dashboard_query',
                    dashboardUuid,
                ]);

                // Invalidate dashboard history to reflect new version
                await queryClient.invalidateQueries([
                    'dashboard_history',
                    dashboardUuid,
                ]);

                // Invalidate dashboard version queries
                await queryClient.invalidateQueries([
                    'dashboard_version',
                    dashboardUuid,
                ]);

                // Invalidate all saved chart queries to refresh chart data
                // This will force reload of any charts that were rolled back
                await queryClient.invalidateQueries(['saved_query']);

                // Invalidate chart history queries for any affected charts
                await queryClient.invalidateQueries(['chart_history']);

                // Invalidate chart version queries
                await queryClient.invalidateQueries(['chart_version']);

                // Invalidate the project charts list in case chart metadata changed
                await queryClient.invalidateQueries(['project']);

                // Invalidate SQL charts that might be in dashboard tiles
                await queryClient.invalidateQueries([
                    'sqlRunner',
                    'savedSqlChart',
                ]);

                showToastSuccess({
                    title: `Success! Dashboard was reverted.`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to revert dashboard`,
                    apiError: error,
                });
            },
        },
    );
};

export const appendNewTilesToBottom = <T extends Pick<DashboardTile, 'y'>>(
    existingTiles: T[] | undefined,
    newTiles: T[],
): T[] => {
    const tilesY =
        existingTiles &&
        existingTiles.map(function (tile) {
            return tile.y;
        });
    const maxY =
        tilesY && tilesY.length > 0 ? Math.max.apply(Math, tilesY) : -1;
    const reorderedTiles = newTiles.map((tile) => ({
        ...tile,
        y: maxY + 1,
    })); //add to the bottom

    return [...(existingTiles ?? []), ...reorderedTiles];
};
