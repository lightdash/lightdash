import {
    type ApiContentVerificationResponse,
    type ApiError,
    type ContentVerificationInfo,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('app');
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
                    title: t('useContentVerification.chartVerified'),
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('useContentVerification.failedToVerifyChart'),
                    apiError: error,
                });
            },
        },
    );
};

export const useUnverifyChartMutation = () => {
    const { t } = useTranslation('app');
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
                    title: t('useContentVerification.chartVerificationRemoved'),
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t(
                        'useContentVerification.failedToRemoveChartVerification',
                    ),
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
    const { t } = useTranslation('app');
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
                    title: t('useContentVerification.dashboardVerified'),
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('useContentVerification.failedToVerifyDashboard'),
                    apiError: error,
                });
            },
        },
    );
};

const verifyDataApp = async ({
    projectUuid,
    appUuid,
}: {
    projectUuid: string;
    appUuid: string;
}): Promise<ContentVerificationInfo> =>
    lightdashApi<ApiContentVerificationResponse['results']>({
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/verification`,
        method: 'POST',
        body: undefined,
    });

const unverifyDataApp = async ({
    projectUuid,
    appUuid,
}: {
    projectUuid: string;
    appUuid: string;
}): Promise<void> => {
    await lightdashApi<null>({
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/verification`,
        method: 'DELETE',
        body: undefined,
    });
};

export const useVerifyDataAppMutation = () => {
    const { t } = useTranslation('app');
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<
        ContentVerificationInfo,
        ApiError,
        { projectUuid: string; appUuid: string }
    >(({ projectUuid, appUuid }) => verifyDataApp({ projectUuid, appUuid }), {
        mutationKey: ['data_app_verify'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['spaces']);
            await queryClient.invalidateQueries(['content']);
            await queryClient.invalidateQueries(['app']);
            await queryClient.invalidateQueries(['verified-content-homepage']);
            await queryClient.invalidateQueries(['verified-content']);
            showToastSuccess({
                title: t('useContentVerification.dataAppVerified'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('useContentVerification.failedToVerifyDataApp'),
                apiError: error,
            });
        },
    });
};

export const useUnverifyDataAppMutation = () => {
    const { t } = useTranslation('app');
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<
        void,
        ApiError,
        { projectUuid: string; appUuid: string }
    >(({ projectUuid, appUuid }) => unverifyDataApp({ projectUuid, appUuid }), {
        mutationKey: ['data_app_unverify'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['spaces']);
            await queryClient.invalidateQueries(['content']);
            await queryClient.invalidateQueries(['app']);
            await queryClient.invalidateQueries(['verified-content-homepage']);
            await queryClient.invalidateQueries(['verified-content']);
            showToastSuccess({
                title: t('useContentVerification.dataAppVerificationRemoved'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t(
                    'useContentVerification.failedToRemoveDataAppVerification',
                ),
                apiError: error,
            });
        },
    });
};

export const useUnverifyDashboardMutation = () => {
    const { t } = useTranslation('app');
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
                    title: t(
                        'useContentVerification.dashboardVerificationRemoved',
                    ),
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t(
                        'useContentVerification.failedToRemoveDashboardVerification',
                    ),
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
    const { t } = useTranslation('app');
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
                showToastSuccess({
                    title: t('useContentVerification.documentVerified'),
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('useContentVerification.failedToVerifyDocument'),
                    apiError: error,
                });
            },
        },
    );
};

export const useUnverifyDocumentMutation = () => {
    const { t } = useTranslation('app');
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
                showToastSuccess({
                    title: t(
                        'useContentVerification.documentVerificationRemoved',
                    ),
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t(
                        'useContentVerification.failedToRemoveDocumentVerification',
                    ),
                    apiError: error,
                });
            },
        },
    );
};
