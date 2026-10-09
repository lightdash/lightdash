import {
    type ApiContentVerificationResponse,
    type ApiError,
    type ContentVerificationInfo,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import useToaster from './toaster/useToaster';

const verifyChart = async (
    lightdashApi: LightdashApi,
    chartUuid: string,
): Promise<ContentVerificationInfo> =>
    lightdashApi<ApiContentVerificationResponse['results']>({
        url: `/saved/${chartUuid}/verification`,
        method: 'POST',
        body: undefined,
    });

const unverifyChart = async (
    lightdashApi: LightdashApi,
    chartUuid: string,
): Promise<void> => {
    await lightdashApi<null>({
        url: `/saved/${chartUuid}/verification`,
        method: 'DELETE',
        body: undefined,
    });
};

export const useVerifyChartMutation = () => {
    const lightdashApi = useLightdashApi();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<ContentVerificationInfo, ApiError, string>(
        (chartUuid) => verifyChart(lightdashApi, chartUuid),
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
    const lightdashApi = useLightdashApi();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<void, ApiError, string>(
        (chartUuid) => unverifyChart(lightdashApi, chartUuid),
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
    lightdashApi: LightdashApi,
    dashboardUuid: string,
): Promise<ContentVerificationInfo> =>
    lightdashApi<ApiContentVerificationResponse['results']>({
        url: `/dashboards/${dashboardUuid}/verification`,
        method: 'POST',
        body: undefined,
    });

const unverifyDashboard = async (
    lightdashApi: LightdashApi,
    dashboardUuid: string,
): Promise<void> => {
    await lightdashApi<null>({
        url: `/dashboards/${dashboardUuid}/verification`,
        method: 'DELETE',
        body: undefined,
    });
};

export const useVerifyDashboardMutation = () => {
    const lightdashApi = useLightdashApi();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<ContentVerificationInfo, ApiError, string>(
        (dashboardUuid) => verifyDashboard(lightdashApi, dashboardUuid),
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

const verifyDataApp = async (
    lightdashApi: LightdashApi,
    {
        projectUuid,
        appUuid,
    }: {
        projectUuid: string;
        appUuid: string;
    },
): Promise<ContentVerificationInfo> =>
    lightdashApi<ApiContentVerificationResponse['results']>({
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/verification`,
        method: 'POST',
        body: undefined,
    });

const unverifyDataApp = async (
    lightdashApi: LightdashApi,
    {
        projectUuid,
        appUuid,
    }: {
        projectUuid: string;
        appUuid: string;
    },
): Promise<void> => {
    await lightdashApi<null>({
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/verification`,
        method: 'DELETE',
        body: undefined,
    });
};

export const useVerifyDataAppMutation = () => {
    const lightdashApi = useLightdashApi();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<
        ContentVerificationInfo,
        ApiError,
        { projectUuid: string; appUuid: string }
    >(
        ({ projectUuid, appUuid }) =>
            verifyDataApp(lightdashApi, { projectUuid, appUuid }),
        {
            mutationKey: ['data_app_verify'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['spaces']);
                await queryClient.invalidateQueries(['content']);
                await queryClient.invalidateQueries(['app']);
                await queryClient.invalidateQueries([
                    'verified-content-homepage',
                ]);
                await queryClient.invalidateQueries(['verified-content']);
                showToastSuccess({
                    title: 'Data app verified',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to verify data app',
                    apiError: error,
                });
            },
        },
    );
};

export const useUnverifyDataAppMutation = () => {
    const lightdashApi = useLightdashApi();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<
        void,
        ApiError,
        { projectUuid: string; appUuid: string }
    >(
        ({ projectUuid, appUuid }) =>
            unverifyDataApp(lightdashApi, { projectUuid, appUuid }),
        {
            mutationKey: ['data_app_unverify'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['spaces']);
                await queryClient.invalidateQueries(['content']);
                await queryClient.invalidateQueries(['app']);
                await queryClient.invalidateQueries([
                    'verified-content-homepage',
                ]);
                await queryClient.invalidateQueries(['verified-content']);
                showToastSuccess({
                    title: 'Data app verification removed',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to remove data app verification',
                    apiError: error,
                });
            },
        },
    );
};

export const useUnverifyDashboardMutation = () => {
    const lightdashApi = useLightdashApi();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<void, ApiError, string>(
        (dashboardUuid) => unverifyDashboard(lightdashApi, dashboardUuid),
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

type DocumentVerificationTarget = {
    projectUuid: string;
    documentUuid: string;
};

const documentVerificationUrl = ({
    projectUuid,
    documentUuid,
}: DocumentVerificationTarget) =>
    `/projects/${projectUuid}/documents/${documentUuid}/verification`;

const invalidateDocumentVerification = async (
    queryClient: ReturnType<typeof useQueryClient>,
) => {
    await queryClient.invalidateQueries(['spaces']);
    await queryClient.invalidateQueries(['content']);
    await queryClient.invalidateQueries(['document']);
    await queryClient.invalidateQueries(['verified-content-homepage']);
    await queryClient.invalidateQueries(['verified-content']);
};

export const useVerifyDocumentMutation = () => {
    const lightdashApi = useLightdashApi();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<
        ContentVerificationInfo,
        ApiError,
        DocumentVerificationTarget
    >(
        (target) =>
            lightdashApi<ApiContentVerificationResponse['results']>({
                url: documentVerificationUrl(target),
                method: 'POST',
                body: undefined,
            }),
        {
            mutationKey: ['document_verify'],
            onSuccess: async () => {
                await invalidateDocumentVerification(queryClient);
                showToastSuccess({ title: 'Document verified' });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to verify Document',
                    apiError: error,
                });
            },
        },
    );
};

export const useUnverifyDocumentMutation = () => {
    const lightdashApi = useLightdashApi();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<void, ApiError, DocumentVerificationTarget>(
        async (target) => {
            await lightdashApi<null>({
                url: documentVerificationUrl(target),
                method: 'DELETE',
                body: undefined,
            });
        },
        {
            mutationKey: ['document_unverify'],
            onSuccess: async () => {
                await invalidateDocumentVerification(queryClient);
                showToastSuccess({ title: 'Document verification removed' });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to remove Document verification',
                    apiError: error,
                });
            },
        },
    );
};
