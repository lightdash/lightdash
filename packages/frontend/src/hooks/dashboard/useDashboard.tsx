import { Intent } from '@blueprintjs/core';
import {
    ApiError,
    CreateDashboard,
    Dashboard,
    DashboardAvailableFilters,
    DashboardTile,
    NotificationPayloadBase,
    UpdateDashboard,
    UpdateDashboardDetails,
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

export const postDashboardsAvailableFilters = async (
    savedQueryUuids: string[],
) =>
    lightdashApi<DashboardAvailableFilters>({
        url: `/dashboards/availableFilters`,
        method: 'POST',
        body: JSON.stringify(savedQueryUuids),
    });

export const exportDashboard = async (id: string) =>
    lightdashApi<string>({
        url: `/dashboards/${id}/export`,
        method: 'POST',
        body: undefined,
    });

export const useDashboardsAvailableFilters = (savedQueryUuids: string[]) =>
    useQuery<DashboardAvailableFilters, ApiError>(
        ['dashboards', 'availableFilters', ...savedQueryUuids],
        () => postDashboardsAvailableFilters(savedQueryUuids),
        { enabled: savedQueryUuids.length > 0 },
    );

export const useDashboardQuery = (
    id?: string,
    useQueryOptions?: UseQueryOptions<Dashboard, ApiError>,
) => {
    const setErrorResponse = useQueryError();
    return useQuery<Dashboard, ApiError>({
        queryKey: ['saved_dashboard_query', id],
        queryFn: () => getDashboard(id || ''),
        enabled: id !== undefined,
        retry: false,
        onError: (result) => setErrorResponse(result),
        ...useQueryOptions,
    });
};

export const useExportDashboard = () => {
    const { showToastSuccess, showToastError, showToast } = useToaster();
    return useMutation<string, ApiError, Dashboard>(
        (data) => exportDashboard(data.uuid),
        {
            mutationKey: ['export_dashboard'],
            onMutate: (data) => {
                showToast({
                    key: 'dashboard_export_toast',
                    intent: Intent.PRIMARY,
                    title: `${data.name} is being exported. This might take a few seconds.`,
                    timeout: 0,
                });
            },
            onSuccess: async (url, data) => {
                if (url) window.open(url, '_blank');
                showToastSuccess({
                    key: 'dashboard_export_toast',
                    title: `Success! ${data.name} was exported.`,
                });
            },
            onError: (error, data) => {
                showToastError({
                    key: 'dashboard_export_toast',
                    title: `Failed to export ${data.name}`,
                    subtitle: error.error.message,
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

export const useUpdateDashboardName = (
    id: string,
    showRedirectButton: boolean = false,
) => {
    const hook = useUpdateDashboard(id, showRedirectButton);
    return {
        ...hook,
        mutate: ({ name, description }: UpdateDashboardDetails) =>
            hook.mutate({ name, description }),
    };
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

export const appendNewTilesToBottom = (
    existingTiles: DashboardTile[] | [],
    newTiles: DashboardTile[],
): DashboardTile[] => {
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

    return [...existingTiles, ...reorderedTiles];
};
