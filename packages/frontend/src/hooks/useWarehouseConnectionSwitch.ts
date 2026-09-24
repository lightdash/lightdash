import {
    type ApiError,
    type ApiExecuteWarehouseConnectionSwitchRequest,
    type ApiWarehouseConnectionSwitchRequest,
    type WarehouseConnectionSwitchAvailability,
    type WarehouseConnectionSwitchPlan,
    type WarehouseConnectionSwitchResult,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';

const switchUrl = (projectUuid: string) =>
    `/projects/${projectUuid}/warehouse-connection-mode`;

export const useWarehouseConnectionSwitchAvailability = (
    projectUuid: string,
    enabled: boolean,
) =>
    useQuery<WarehouseConnectionSwitchAvailability, ApiError>({
        queryKey: ['projects', projectUuid, 'warehouse-connection-mode'],
        queryFn: () =>
            lightdashApi<WarehouseConnectionSwitchAvailability>({
                url: switchUrl(projectUuid),
                method: 'GET',
                body: undefined,
            }),
        enabled,
        retry: false,
    });

export const usePreviewWarehouseConnectionSwitch = (projectUuid: string) =>
    useMutation<
        WarehouseConnectionSwitchPlan,
        ApiError,
        ApiWarehouseConnectionSwitchRequest
    >(
        (request) =>
            lightdashApi<WarehouseConnectionSwitchPlan>({
                url: `${switchUrl(projectUuid)}/preview`,
                method: 'POST',
                body: JSON.stringify(request),
            }),
        {
            mutationKey: ['preview_warehouse_connection_switch', projectUuid],
        },
    );

export const useSwitchToMultipleConnections = (
    projectUuid: string,
    options: { onSuccess: () => void },
) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        WarehouseConnectionSwitchResult,
        ApiError,
        ApiExecuteWarehouseConnectionSwitchRequest
    >(
        (request) =>
            lightdashApi<WarehouseConnectionSwitchResult>({
                url: `${switchUrl(projectUuid)}/switch`,
                method: 'POST',
                body: JSON.stringify(request),
            }),
        {
            mutationKey: ['switch_to_multiple_connections', projectUuid],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['projects', projectUuid]);
                await queryClient.invalidateQueries(['project', projectUuid]);
                showToastSuccess({
                    title: 'Multiple connections enabled',
                });
                options.onSuccess();
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to enable multiple connections',
                    apiError: error,
                });
            },
        },
    );
};
