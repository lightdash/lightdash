import {
    type ApiError,
    type CreateDashboard,
    type Dashboard,
    type DashboardAvailableFilters,
    type DashboardFilters,
    type DashboardTile,
    type DateGranularity,
    type SavedChartsInfoForDashboardAvailableFilters,
    type UpdateDashboard,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useHistory, useParams } from 'react-router-dom';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';
import useQueryError from '../useQueryError';

const getDashboard = async (id: string) =>
    lightdashApi<Dashboard>({
        url: `/dashboards/${id}`,
        method: 'GET',
        body: undefined,
    });

const createDashboard = async (projectUuid: string, data: CreateDashboard) =>
    lightdashApi<Dashboard>({
        url: `/projects/${projectUuid}/dashboards`,
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

const updateDashboard = async (id: string, data: UpdateDashboard) =>
    lightdashApi<Dashboard>({
        url: `/dashboards/${id}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const deleteDashboard = async (id: string) =>
    lightdashApi<null>({
        url: `/dashboards/${id}`,
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

const exportDashboard = async (
    id: string,
    gridWidth: number | undefined,
    queryFilters: string,
) =>
    lightdashApi<string>({
        url: `/dashboards/${id}/export`,
        method: 'POST',
        body: JSON.stringify({ queryFilters, gridWidth }),
    });

export const useDashboardsAvailableFilters = (
    savedChartUuidsAndTileUuids: SavedChartsInfoForDashboardAvailableFilters,
) =>
    useQuery<DashboardAvailableFilters, ApiError>(
        ['dashboards', 'availableFilters', ...savedChartUuidsAndTileUuids],
        () => postDashboardsAvailableFilters(savedChartUuidsAndTileUuids),
        { enabled: savedChartUuidsAndTileUuids.length > 0 },
    );

export const useDashboardQuery = (
    id?: string,
    useQueryOptions?: UseQueryOptions<Dashboard, ApiError>,
) => {
    const setErrorResponse = useQueryError();
    return useQuery<Dashboard, ApiError>({
        queryKey: ['saved_dashboard_query', id],
        queryFn: () => getDashboard(id || ''),
        enabled: !!id,
        retry: false,
        onError: (result) => setErrorResponse(result),
        ...useQueryOptions,
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
        }
    >(
        (data) =>
            exportDashboard(
                data.dashboard.uuid,
                data.gridWidth,
                data.queryFilters,
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

const exportCsvDashboard = async (
    id: string,
    filters: DashboardFilters,
    dateZoomGranularity: DateGranularity | undefined,
) =>
    lightdashApi<string>({
        url: `/dashboards/${id}/exportCsv`,
        method: 'POST',
        body: JSON.stringify({ filters, dateZoomGranularity }),
    });

export const useExportCsvDashboard = () => {
    const { showToastSuccess, showToastApiError, showToastInfo } = useToaster();
    return useMutation<
        string,
        ApiError,
        {
            dashboard: Dashboard;
            filters: DashboardFilters;
            dateZoomGranularity: DateGranularity | undefined;
        }
    >(
        (data) =>
            exportCsvDashboard(
                data.dashboard.uuid,
                data.filters,
                data.dateZoomGranularity,
            ),
        {
            mutationKey: ['export_csv_dashboard'],
            onMutate: (data) => {
                showToastInfo({
                    key: 'dashboard_export_toast',
                    title: `${data.dashboard.name} is being exported. This might take a few seconds.`,
                    autoClose: false,
                    loading: true,
                });
            },
            onSuccess: async (url, data) => {
                if (url) {
                    window.open(url, '_blank');
                    showToastSuccess({
                        key: 'dashboard_export_toast',
                        title: `Success! ${data.dashboard.name} was exported.`,
                    });
                }
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
    id?: string,
    showRedirectButton: boolean = false,
) => {
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<Dashboard, ApiError, UpdateDashboard>(
        (data) => {
            if (id === undefined) {
                throw new Error('Dashboard id is undefined');
            }

            return updateDashboard(id, data);
        },
        {
            mutationKey: ['dashboard_update'],
            onSuccess: async (_, variables) => {
                await queryClient.invalidateQueries(['space', projectUuid]);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);

                await queryClient.invalidateQueries(['dashboards']);
                await queryClient.invalidateQueries([
                    'dashboards-containing-chart',
                ]);
                await queryClient.resetQueries(['saved_dashboard_query', id]);
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
                                  history.push(
                                      `/projects/${projectUuid}/dashboards/${id}`,
                                  ),
                          }
                        : undefined,
                });
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

export const useMoveDashboardMutation = () => {
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        Dashboard,
        ApiError,
        Pick<Dashboard, 'uuid' | 'name' | 'spaceUuid'>
    >(
        ({ uuid, name, spaceUuid }) =>
            updateDashboard(uuid, { name, spaceUuid }),
        {
            mutationKey: ['dashboard_move'],
            onSuccess: async (data) => {
                await queryClient.invalidateQueries(['space']);
                await queryClient.invalidateQueries(['dashboards']);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                queryClient.setQueryData(
                    ['saved_dashboard_query', data.uuid],
                    data,
                );
                showToastSuccess({
                    title: `Dashboard has been moved to ${data.spaceName}`,
                    action: {
                        children: 'Go to space',
                        icon: IconArrowRight,
                        onClick: () =>
                            history.push(
                                `/projects/${projectUuid}/spaces/${data.spaceUuid}`,
                            ),
                    },
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to move dashboard`,
                    apiError: error,
                });
            },
        },
    );
};

export const useCreateMutation = (
    projectUuid: string,
    showRedirectButton: boolean = false,
) => {
    const history = useHistory();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<Dashboard, ApiError, CreateDashboard>(
        (data) => createDashboard(projectUuid, data),
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
                showToastSuccess({
                    title: `Success! Dashboard was created.`,
                    action: showRedirectButton
                        ? {
                              children: 'Open dashboard',
                              icon: IconArrowRight,
                              onClick: () =>
                                  history.push(
                                      `/projects/${projectUuid}/dashboards/${result.uuid}`,
                                  ),
                          }
                        : undefined,
                });
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

type DuplicateDashboardMutationOptions = {
    showRedirectButton: boolean;
};

export const useDuplicateDashboardMutation = (
    options?: DuplicateDashboardMutationOptions,
) => {
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        Dashboard,
        ApiError,
        Pick<Dashboard, 'uuid' | 'name' | 'description'>
    >(
        ({ uuid, name, description }) =>
            duplicateDashboard(projectUuid, uuid, {
                dashboardName: name,
                dashboardDesc: description ?? '',
            }),
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
                showToastSuccess({
                    title: `Dashboard successfully duplicated!`,
                    action: options?.showRedirectButton
                        ? {
                              children: 'Open dashboard',
                              icon: IconArrowRight,
                              onClick: () =>
                                  history.push(
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

export const useDashboardDeleteMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, string>(deleteDashboard, {
        onSuccess: async () => {
            await queryClient.invalidateQueries(['dashboards']);
            await queryClient.invalidateQueries(['space']);

            await queryClient.invalidateQueries([
                'dashboards-containing-chart',
            ]);
            await queryClient.invalidateQueries(['pinned_items']);
            await queryClient.invalidateQueries([
                'most-popular-and-recently-updated',
            ]);
            showToastSuccess({
                title: `Deleted! Dashboard was deleted.`,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to delete dashboard`,
                apiError: error,
            });
        },
    });
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
