import {
    type ApiContentVerificationResponse,
    type ApiError,
    type ContentVerificationInfo,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';

const verifyChart = async (
    chartUuid: string,
): Promise<ContentVerificationInfo> =>
    lightdashApi<ApiContentVerificationResponse['results']>({
        url: `/saved/${chartUuid}/verification`,
        method: 'POST',
        body: undefined,
    });

const unverifyChart = async (chartUuid: string): Promise<void> => {
    await lightdashApi<null>({
        url: `/saved/${chartUuid}/verification`,
        method: 'DELETE',
        body: undefined,
    });
};

export const useVerifyChartMutation = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<ContentVerificationInfo, ApiError, string>(
        (chartUuid) => verifyChart(chartUuid),
        {
            mutationKey: ['chart_verify'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['spaces']);
                await queryClient.invalidateQueries(['content']);
                await queryClient.invalidateQueries(['saved_query']);
                await queryClient.invalidateQueries([
                    'verified-content-homepage',
                ]);
                await queryClient.invalidateQueries(['verified-content']);
                showToastSuccess({
                    title: 'Chart verified',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to verify chart',
                    apiError: error,
                });
            },
        },
    );
};

export const useUnverifyChartMutation = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<void, ApiError, string>(
        (chartUuid) => unverifyChart(chartUuid),
        {
            mutationKey: ['chart_unverify'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['spaces']);
                await queryClient.invalidateQueries(['content']);
                await queryClient.invalidateQueries(['saved_query']);
                await queryClient.invalidateQueries([
                    'verified-content-homepage',
                ]);
                await queryClient.invalidateQueries(['verified-content']);
                showToastSuccess({
                    title: 'Chart verification removed',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to remove chart verification',
                    apiError: error,
                });
            },
        },
    );
};

// Dashboard verification

const verifyDashboard = async (
    dashboardUuid: string,
): Promise<ContentVerificationInfo> =>
    lightdashApi<ApiContentVerificationResponse['results']>({
        url: `/dashboards/${dashboardUuid}/verification`,
        method: 'POST',
        body: undefined,
    });

const unverifyDashboard = async (dashboardUuid: string): Promise<void> => {
    await lightdashApi<null>({
        url: `/dashboards/${dashboardUuid}/verification`,
        method: 'DELETE',
        body: undefined,
    });
};

export const useVerifyDashboardMutation = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<ContentVerificationInfo, ApiError, string>(
        (dashboardUuid) => verifyDashboard(dashboardUuid),
        {
            mutationKey: ['dashboard_verify'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['spaces']);
                await queryClient.invalidateQueries(['content']);
                await queryClient.invalidateQueries(['dashboards']);
                await queryClient.invalidateQueries(['saved_dashboard_query']);
                await queryClient.invalidateQueries([
                    'verified-content-homepage',
                ]);
                await queryClient.invalidateQueries(['verified-content']);
                showToastSuccess({
                    title: 'Dashboard verified',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to verify dashboard',
                    apiError: error,
                });
            },
        },
    );
};

export const useUnverifyDashboardMutation = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<void, ApiError, string>(
        (dashboardUuid) => unverifyDashboard(dashboardUuid),
        {
            mutationKey: ['dashboard_unverify'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['spaces']);
                await queryClient.invalidateQueries(['content']);
                await queryClient.invalidateQueries(['dashboards']);
                await queryClient.invalidateQueries(['saved_dashboard_query']);
                await queryClient.invalidateQueries([
                    'verified-content-homepage',
                ]);
                await queryClient.invalidateQueries(['verified-content']);
                showToastSuccess({
                    title: 'Dashboard verification removed',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to remove dashboard verification',
                    apiError: error,
                });
            },
        },
    );
};
