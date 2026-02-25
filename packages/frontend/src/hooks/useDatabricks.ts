import { type ApiError, type ApiSuccessEmpty } from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { lightdashApi } from '../api';
import useHealth from './health/useHealth';
import useToaster from './toaster/useToaster';

const triggerDatabricksLogin = async (
    siteUrl: string,
    options?: {
        projectUuid?: string;
        projectName?: string;
        serverHostName?: string;
        credentialsName?: string;
    },
) => {
    return new Promise<void>((resolve, reject) => {
        const channel = new BroadcastChannel('lightdash-oauth-popup');
        const params = new URLSearchParams({ isPopup: 'true' });
        if (options?.projectUuid) {
            params.set('projectUuid', options.projectUuid);
        } else if (options?.serverHostName) {
            params.set('serverHostName', options.serverHostName);
        }
        if (options?.projectName) {
            params.set('projectName', options.projectName);
        }
        if (options?.credentialsName) {
            params.set('credentialsName', options.credentialsName);
        }
        const loginUrl = `${siteUrl}/api/v1/login/databricks?${params.toString()}`;
        console.info(`Opening popup with url: ${loginUrl}`);

        const popupWindow = window.open(
            loginUrl,
            'login-popup',
            'width=600,height=600',
        );

        if (!popupWindow) {
            reject(new Error('Failed to open popup window'));
            return;
        }

        const handleMessage = (event: MessageEvent) => {
            if (event.origin !== siteUrl) return;

            if (event.data === 'success') {
                resolve();
            } else {
                reject(new Error('Authentication failed'));
            }

            channel.removeEventListener('message', handleMessage);
            channel.close();
            popupWindow.close();
        };

        channel.addEventListener('message', handleMessage);
    });
};

export function useDatabricksLoginPopup({
    onLogin: _onLogin,
    projectUuid,
    projectName,
    serverHostName,
    credentialsName,
}: {
    onLogin: () => Promise<void>;
    projectUuid?: string;
    projectName?: string;
    serverHostName?: string;
    credentialsName?: string;
}) {
    const { showToastError } = useToaster();
    const health = useHealth();
    const queryClient = useQueryClient();
    const ssoMutation = useMutation({
        mutationFn: () =>
            triggerDatabricksLogin(health.data?.siteUrl || '', {
                projectUuid,
                projectName,
                serverHostName,
                credentialsName,
            }),
        onSuccess: async () => {
            // Invalidate user warehouse credentials since the backend creates
            // credentials during the OAuth flow
            await queryClient.invalidateQueries(['user_warehouse_credentials']);
            await _onLogin?.();
        },
        onError: (error: Error) => {
            showToastError({
                title: 'Authentication failed',
                subtitle: error.message || 'Please try again',
            });
        },
    });

    return useMemo(() => {
        return {
            ...ssoMutation,
            isSsoEnabled: health.data?.auth.databricks.enabled,
        };
    }, [ssoMutation, health.data?.auth.databricks.enabled]);
}

const getIsAuthenticatedForProject = async (
    projectUuid?: string,
    serverHostName?: string,
) =>
    lightdashApi<ApiSuccessEmpty['results']>({
        url: `/databricks/sso/is-authenticated${
            projectUuid
                ? `?projectUuid=${encodeURIComponent(projectUuid)}`
                : serverHostName
                  ? `?serverHostName=${encodeURIComponent(serverHostName)}`
                  : ''
        }`,
        method: 'GET',
        body: undefined,
    });

export const useIsDatabricksAuthenticated = ({
    projectUuid,
    serverHostName,
}: {
    projectUuid?: string;
    serverHostName?: string;
}) => {
    return useQuery<ApiSuccessEmpty['results'], ApiError>({
        queryKey: [
            'databricks-sso-is-authenticated',
            projectUuid,
            serverHostName,
        ],
        queryFn: () =>
            getIsAuthenticatedForProject(projectUuid, serverHostName),
        enabled: !!projectUuid || !!serverHostName,
    });
};
