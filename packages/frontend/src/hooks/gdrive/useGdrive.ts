import {
    type ApiError,
    type ApiGdriveAccessTokenResponse,
    type ApiScheduledDownloadCsv,
    type UploadMetricGsheet,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { lightdashApi } from '../../api';
import { convertDateFilters } from '../../utils/dateFilter';
import useHealth from '../health/useHealth';
import useToaster from '../toaster/useToaster';

const getGdriveAccessToken = async () =>
    lightdashApi<ApiGdriveAccessTokenResponse['results']>({
        url: `/gdrive/get-access-token`,
        method: 'GET',
        body: undefined,
    });

const triggerGdriveLogin = async (
    loginPath: 'gdrive' | 'bigquery',
    siteUrl: string,
) => {
    return new Promise<void>((resolve, reject) => {
        const channel = new BroadcastChannel('lightdash-oauth-popup');
        const loginUrl = `${siteUrl}/api/v1/login/${loginPath}?isPopup=true`;
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

        // Handle popup being closed manually
        // TODO this doesn't work now on this mutation
        /*const checkClosed = setInterval(() => {
            if (popupWindow.closed) {
                clearInterval(checkClosed);
                channel.removeEventListener('message', handleMessage);
                channel.close();
                reject(new Error('Popup was closed'));
            }
        }, 1000);*/
    });
};

export const useGoogleLoginPopup = (
    loginPath: 'gdrive' | 'bigquery',
    onLogin?: () => void,
) => {
    const { showToastError } = useToaster();
    const health = useHealth();

    return useMutation({
        mutationFn: () =>
            triggerGdriveLogin(loginPath, health.data?.siteUrl || ''),
        onSuccess: () => {
            onLogin?.();
        },
        onError: (error: Error) => {
            showToastError({
                title: 'Authentication failed',
                subtitle: error.message || 'Please try again',
            });
        },
    });
};

export const useGdriveAccessToken = () => {
    const { showToastError } = useToaster();
    const isAuthConcludedWithSuccess = useRef(false);
    const health = useHealth();

    const { error, data, mutate } = useMutation<
        ApiGdriveAccessTokenResponse['results'],
        ApiError
    >({
        mutationFn: getGdriveAccessToken,
    });
    const { mutate: openLoginPopup } = useGoogleLoginPopup('gdrive', () => {
        isAuthConcludedWithSuccess.current = true;

        mutate();
    });

    useEffect(() => {
        if (error) {
            // show error if they concluded the auth flow without the necessary scopes
            if (isAuthConcludedWithSuccess.current && error) {
                showToastError({
                    title: 'Authentication failed',
                    subtitle: error?.error?.message || 'Please try again',
                });
                isAuthConcludedWithSuccess.current = false;
            } else {
                // Auto-trigger login on error (existing behavior)
                if (health.data?.siteUrl) {
                    openLoginPopup();
                }
            }
        }
    }, [error, health.data?.siteUrl, openLoginPopup, showToastError]);

    return {
        mutate,
        token: data,
    };
};

export const uploadGsheet = async (gsheetMetric: UploadMetricGsheet) => {
    const timezoneFixQuery = {
        ...gsheetMetric.metricQuery,
        filters: convertDateFilters(gsheetMetric.metricQuery.filters),
    };
    return lightdashApi<ApiScheduledDownloadCsv>({
        url: `/gdrive/upload-gsheet`,
        method: 'POST',
        body: JSON.stringify({
            ...gsheetMetric,
            metricQuery: timezoneFixQuery,
        }),
    });
};
