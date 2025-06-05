import { type ApiError, type ApiSuccessEmpty } from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { lightdashApi } from '../api';
import useHealth from './health/useHealth';
import useToaster from './toaster/useToaster';

// TODO: This is a stub for the actual implementation
//       It could maybe be abstracted into a generic oauth login hook
const triggerSnowflakeLogin = async (siteUrl: string) => {
    return new Promise<void>((resolve, reject) => {
        const channel = new BroadcastChannel('lightdash-oauth-popup');
        const loginUrl = `${siteUrl}/api/v1/login/snowflake?isPopup=true`;
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

export function useSnowflakeLoginPopup({
    onLogin: _onLogin,
}: {
    onLogin: () => Promise<void>;
}) {
    const { showToastError } = useToaster();
    const health = useHealth();
    const ssoMutation = useMutation({
        mutationFn: () => triggerSnowflakeLogin(health.data?.siteUrl || ''),
        onSuccess: () => _onLogin?.(),
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
            isSsoEnabled: health.data?.auth.snowflake.enabled,
        };
    }, [ssoMutation, health.data?.auth.snowflake.enabled]);
}

const getIsAuthenticated = async () =>
    lightdashApi<ApiSuccessEmpty['results']>({
        url: `/snowflake/sso/is-authenticated`,
        method: 'GET',
        body: undefined,
    });

export const useIsSnowflakeAuthenticated = () => {
    return useQuery<ApiSuccessEmpty['results'], ApiError>({
        queryKey: [],
        queryFn: getIsAuthenticated,
    });
};

export function useSnowflakeDatasets() {
    return { refetch: () => {} };
}
