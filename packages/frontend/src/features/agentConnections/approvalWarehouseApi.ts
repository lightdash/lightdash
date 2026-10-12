import {
    type AiAccessForUser,
    type ApiError,
    type WarehouseConnectionForUserCredentials,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import { type RequestQueue } from './requestQueue';

export const useApprovalWarehouseConnections = (
    projectUuid: string,
    queue: RequestQueue,
) =>
    useQuery<WarehouseConnectionForUserCredentials[], ApiError>({
        queryKey: [
            'projects',
            projectUuid,
            'warehouse-connection-user-credentials',
        ],
        queryFn: ({ signal }) =>
            queue(
                () =>
                    lightdashApi<WarehouseConnectionForUserCredentials[]>({
                        url: `/projects/${encodeURIComponent(projectUuid)}/warehouse-connection-user-credentials`,
                        method: 'GET',
                        body: undefined,
                        signal,
                    }),
                signal,
            ),
        retry: false,
    });

export const useApprovalWarehouseReadiness = (
    projectUuid: string,
    connectionUuid: string | null,
    queue: RequestQueue,
) =>
    useQuery<AiAccessForUser, ApiError>({
        queryKey: ['ai-access', projectUuid, connectionUuid, 'me'],
        queryFn: ({ signal }) =>
            queue(
                () =>
                    lightdashApi<AiAccessForUser>({
                        version: 'v2',
                        url: `/projects/${encodeURIComponent(projectUuid)}/ai-access/me${connectionUuid === null ? '' : `?${new URLSearchParams({ connection: connectionUuid })}`}`,
                        method: 'GET',
                        body: undefined,
                        signal,
                    }),
                signal,
            ),
        refetchOnWindowFocus: true,
    });
