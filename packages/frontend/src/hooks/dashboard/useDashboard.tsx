import { Intent } from '@blueprintjs/core';
import {
    ApiError,
    CreateDashboard,
    Dashboard,
    DashboardAvailableFilters,
    DashboardTile,
    SavedChartsInfoForDashboardAvailableFilters,
    UpdateDashboard,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { UseQueryOptions } from 'react-query/types/react/types';
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
): Promise<Dashboard> =>
    lightdashApi<Dashboard>({
        url: `/projects/${projectUuid}/dashboards?duplicateFrom=${dashboardUuid}`,
        method: 'POST',
        body: undefined,
    });

const updateDashboard = async (id: string, data: UpdateDashboard) =>
    lightdashApi<Dashboard>({
        url: `/dashboards/${id}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const deleteDashboard = async (id: string) =>
    lightdashApi<undefined>({
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

const exportDashboard = async (id: string, queryFilters: string) =>
    lightdashApi<string>({
        url: `/dashboards/${id}/export`,
        method: 'POST',
        body: JSON.stringify({ queryFilters }),
    });

export const useDashboardsAvailableFilters = (
    savedChartUuidsAndTileUuids: SavedChartsInfoForDashboardAvailableFilters,
) => {
    console.log('useDashboardsAvailableFilters', savedChartUuidsAndTileUuids);

    return useQuery<DashboardAvailableFilters, ApiError>(
        ['dashboards', 'availableFilters', ...savedChartUuidsAndTileUuids],
        () => postDashboardsAvailableFilters(savedChartUuidsAndTileUuids),
        { enabled: savedChartUuidsAndTileUuids.length > 0 },
    );
};

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
    const { showToastSuccess, showToastError, showToast } = useToaster();
    return useMutation<
        string,
        ApiError,
        { dashboard: Dashboard; queryFilters: string }
    >((data) => exportDashboard(data.dashboard.uuid, data.queryFilters), {
        mutationKey: ['export_dashboard'],
        onMutate: (data) => {
            showToast({
                key: 'dashboard_export_toast',
                intent: Intent.PRIMARY,
                title: `${data.dashboard.name} is being exported. This might take a few seconds.`,
                timeout: 0,
            });
        },
        onSuccess: async (url, data) => {
            if (url) window.open(url, '_blank');
            showToastSuccess({
                key: 'dashboard_export_toast',
                title: `Success! ${data.dashboard.name} was exported.`,
            });
        },
        onError: (error, data) => {
            showToastError({
                key: 'dashboard_export_toast',
                title: `Failed to export ${data.dashboard.name}`,
                subtitle: error.error.message,
            });
        },
    });
};

export const useUpdateDashboard = (
    id?: string,
    showRedirectButton: boolean = false,
) => {
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
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
                await queryClient.invalidateQueries(
                    'most-popular-and-recently-updated',
                );

                await queryClient.invalidateQueries('dashboards');
                await queryClient.invalidateQueries(
                    'dashboards-containing-chart',
                );
                await queryClient.invalidateQueries([
                    'saved_dashboard_query',
                    id,
                ]);
                const onlyUpdatedName: boolean =
                    Object.keys(variables).length === 1 &&
                    Object.keys(variables).includes('name');
                showToastSuccess({
                    title: `Success! Dashboard ${
                        onlyUpdatedName ? 'name ' : ''
                    }was updated.`,
                    action: showRedirectButton
                        ? {
                              text: 'Open dashboard',
                              icon: 'arrow-right',
                              onClick: () =>
                                  history.push(
                                      `/projects/${projectUuid}/dashboards/${id}`,
                                  ),
                          }
                        : undefined,
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to update dashboard`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

export const useMoveDashboardMutation = () => {
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
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
                await queryClient.invalidateQueries(
                    'most-popular-and-recently-updated',
                );
                queryClient.setQueryData(
                    ['saved_dashboard_query', data.uuid],
                    data,
                );
                showToastSuccess({
                    title: `Dashboard has been moved to ${data.spaceName}`,
                    action: {
                        text: 'Go to space',
                        icon: 'arrow-right',
                        onClick: () =>
                            history.push(
                                `/projects/${projectUuid}/spaces/${data.spaceUuid}`,
                            ),
                    },
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to move dashboard`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

export const useCreateMutation = (
    projectUuid: string,
    showRedirectButton: boolean = false,
    useQueryOptions?: UseQueryOptions<Dashboard, ApiError>,
) => {
    const history = useHistory();
    const { showToastSuccess, showToastError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<Dashboard, ApiError, CreateDashboard>(
        (data) => createDashboard(projectUuid, data),
        {
            mutationKey: ['dashboard_create', projectUuid],
            ...useQueryOptions,
            onSuccess: async (result) => {
                await queryClient.invalidateQueries('dashboards');
                await queryClient.invalidateQueries(
                    'dashboards-containing-chart',
                );
                await queryClient.invalidateQueries(
                    'most-popular-and-recently-updated',
                );
                showToastSuccess({
                    title: `Success! Dashboard was created.`,
                    action: showRedirectButton
                        ? {
                              text: 'Open dashboard',
                              icon: 'arrow-right',
                              onClick: () =>
                                  history.push(
                                      `/projects/${projectUuid}/dashboards/${result.uuid}`,
                                  ),
                          }
                        : undefined,
                });

                useQueryOptions?.onSuccess?.(result);
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to create dashboard`,
                    subtitle: error.error.message,
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
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<Dashboard, ApiError, Dashboard['uuid']>(
        (dashboardUuid) => duplicateDashboard(projectUuid, dashboardUuid),
        {
            mutationKey: ['dashboard_create', projectUuid],
            onSuccess: async (data) => {
                await queryClient.invalidateQueries('dashboards');
                await queryClient.invalidateQueries(['space', projectUuid]);
                await queryClient.invalidateQueries(
                    'dashboards-containing-chart',
                );
                await queryClient.invalidateQueries(
                    'most-popular-and-recently-updated',
                );
                showToastSuccess({
                    title: `Dashboard successfully duplicated!`,
                    action: options?.showRedirectButton
                        ? {
                              text: 'Open dashboard',
                              icon: 'arrow-right',
                              onClick: () =>
                                  history.push(
                                      `/projects/${projectUuid}/dashboards/${data.uuid}`,
                                  ),
                          }
                        : undefined,
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to duplicate dashboard`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

export const useDashboardDeleteMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<undefined, ApiError, string>(deleteDashboard, {
        onSuccess: async () => {
            await queryClient.invalidateQueries('dashboards');
            await queryClient.invalidateQueries('space');

            await queryClient.invalidateQueries('dashboards-containing-chart');
            await queryClient.invalidateQueries('pinned_items');
            await queryClient.invalidateQueries(
                'most-popular-and-recently-updated',
            );
            showToastSuccess({
                title: `Deleted! Dashboard was deleted.`,
            });
        },
        onError: (error) => {
            showToastError({
                title: `Failed to delete dashboard`,
                subtitle: error.error.message,
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
