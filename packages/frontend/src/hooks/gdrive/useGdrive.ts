import {
    type ApiError,
    type ApiGdriveAccessTokenResponse,
    type ApiScheduledDownloadCsv,
    type UploadMetricGsheet,
} from '@lightdash/common';
import { useMutation, type UseQueryOptions } from '@tanstack/react-query';
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

export const useGdriveAccessToken = (
    useQueryOptions?: UseQueryOptions<
        ApiGdriveAccessTokenResponse['results'],
        ApiError
    >,
) => {
    const { showToastError } = useToaster();
    const health = useHealth();
    const popupRef = useRef<Window | null>(null);
    const isAuthConcludedWithSuccess = useRef(false);

    const { error, isSuccess, data, mutate } = useMutation<
        ApiGdriveAccessTokenResponse['results'],
        ApiError
    >({
        mutationFn: getGdriveAccessToken,
    });

    useEffect(() => {
        if (isSuccess) {
            useQueryOptions?.onSuccess?.(data);
        }
    }, [isSuccess, data, useQueryOptions]);

    useEffect(() => {
        const channel = new BroadcastChannel('lightdash-oauth-popup');
        if (error) {
            // show error if they concluded the auth flow without the necessary scopes
            if (isAuthConcludedWithSuccess.current) {
                showToastError({
                    title: 'Authentication failed',
                    subtitle: error.error.message,
                });
                isAuthConcludedWithSuccess.current = false;
            }
            const popupWindow = window.open(
                `${health?.data?.siteUrl}/api/v1/login/gdrive?isPopup=true`,
                'login-popup',
                'width=600,height=600',
            );
            if (popupWindow) {
                popupRef.current = popupWindow;
                channel.addEventListener('message', (event) => {
                    if (event.origin !== health.data?.siteUrl) return;
                    if (event.data === 'success') {
                        isAuthConcludedWithSuccess.current = true;
                        mutate();
                    } else {
                        showToastError({
                            title: 'Authentication failed',
                            subtitle: 'Please try again',
                        });
                    }
                    popupRef.current = null;
                });
            }
        }
        return () => {
            channel.close();
        };
    }, [error, popupRef, mutate, health.data, showToastError]);

    return {
        mutate,
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
