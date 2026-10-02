import { type ApiError, type WarehouseSignInStatus } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

export const warehouseSignInStatusQueryKey = (projectUuid: string) => [
    'warehouse-sign-in-status',
    projectUuid,
];

export const warehouseSignInStatusQueryEnabled = (
    projectUuid: string | undefined,
) => Boolean(projectUuid);

export const useWarehouseSignInStatus = (projectUuid: string | undefined) =>
    useQuery<WarehouseSignInStatus, ApiError>({
        queryKey: warehouseSignInStatusQueryKey(projectUuid ?? ''),
        queryFn: () =>
            lightdashApi<WarehouseSignInStatus>({
                url: `/projects/${projectUuid}/user-warehouse-credentials/sign-in-status`,
                method: 'GET',
                body: undefined,
            }),
        enabled: warehouseSignInStatusQueryEnabled(projectUuid),
        staleTime: 5 * 60 * 1000,
        retry: false,
    });
