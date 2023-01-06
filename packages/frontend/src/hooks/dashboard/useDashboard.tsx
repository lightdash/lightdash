import {
    ApiError,
    CreateDashboard,
    Dashboard,
    DashboardTile,
    FilterableField,
    isDashboardChartTileType,
    UpdateDashboard,
    UpdateDashboardDetails,
} from '@lightdash/common';
import { useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from 'react-query';
import { UseQueryOptions, UseQueryResult } from 'react-query/types/react/types';
import { useHistory, useParams } from 'react-router-dom';
import { useDeepCompareEffect } from 'react-use';
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

export const getChartAvailableFilters = async (savedChartUuid: string) =>
    lightdashApi<FilterableField[]>({
        url: `/saved/${savedChartUuid}/availableFilters`,
        method: 'GET',
        body: undefined,
    });

export const getQueryConfig = (
    savedChartUuid: string,
    queryOptions?: Omit<UseQueryOptions, 'queryKey' | 'queryFn'>,
): UseQueryOptions => {
    return {
        queryKey: ['available_filters', savedChartUuid],
        queryFn: () => getChartAvailableFilters(savedChartUuid),
        ...queryOptions,
    };
};

export const useDashboardAvailableTileFilters = (tiles: DashboardTile[]) => {
    const savedChartTiles = useMemo(() => {
        return tiles
            .filter(isDashboardChartTileType)
            .filter((tile) => !!tile.properties.savedChartUuid);
    }, [tiles]);

    const queries = useQueries(
        savedChartTiles.map((tile) =>
            getQueryConfig(tile.properties.savedChartUuid!, { retry: false }),
        ),
    ) as UseQueryResult<FilterableField[], ApiError>[]; // useQueries doesn't allow us to specify TError

    const results = queries.map((query) =>
        query.isSuccess ? query.data : undefined,
    );

    const isFetched = queries.every((query) => query.isFetched);

    const [data, setData] =
        useState<Record<string, FilterableField[] | undefined>>();

    useDeepCompareEffect(() => {
        if (!isFetched) return;

        const newData = results.reduce<
            Record<string, FilterableField[] | undefined>
        >(
            (acc, result, index) => ({
                ...acc,
                [savedChartTiles[index].uuid]: result,
            }),
            {},
        );

        setData(newData);
    }, [results]);

    return useMemo(
        () => ({
            isLoading: !isFetched,
            data,
        }),
        [isFetched, data],
    );
};

export const useAvailableDashboardFilterTargets = (tiles: DashboardTile[]) => {
    const { isLoading, data } = useDashboardAvailableTileFilters(tiles);

    const availableFilters = useMemo(() => {
        if (isLoading || !data) return;

        const allFilters = Object.values(data)
            .flat()
            .filter((f): f is FilterableField => !!f);
        if (allFilters.length === 0) return;

        return allFilters.filter(
            (field, index, allFields) =>
                index ===
                allFields.findIndex(
                    (f) => f.table === field.table && f.name === field.name,
                ),
        );
    }, [isLoading, data]);

    return useMemo(
        () => ({
            isLoading,
            data: availableFilters,
        }),
        [isLoading, availableFilters],
    );
};

export const useDashboardQuery = (id?: string) => {
    const setErrorResponse = useQueryError();
    return useQuery<Dashboard, ApiError>({
        queryKey: ['saved_dashboard_query', id],
        queryFn: () => getDashboard(id || ''),
        enabled: id !== undefined,
        retry: false,
        onError: (result) => setErrorResponse(result),
    });
};

export const useUpdateDashboard = (
    id: string,
    showRedirectButton: boolean = false,
) => {
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<Dashboard, ApiError, UpdateDashboard>(
        (data) => updateDashboard(id, data),
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

export const useMoveDashboard = (uuid: string | undefined) => {
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<
        Dashboard,
        ApiError,
        Pick<Dashboard, 'name' | 'spaceUuid'>
    >(
        (data) => {
            if (uuid) {
                return updateDashboard(uuid, data);
            }
            throw new Error('Dashboard ID is undefined');
        },
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

export const useDuplicateDashboardMutation = (
    dashboardUuid: string,
    showRedirectButton: boolean = false,
) => {
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<Dashboard, ApiError, string>(
        () => duplicateDashboard(projectUuid, dashboardUuid),
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
                    action: showRedirectButton
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

export const useDeleteMutation = () => {
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
