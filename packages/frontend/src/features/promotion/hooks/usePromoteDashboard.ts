import {
    type ApiError,
    type Dashboard,
    type PromotionChanges,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const promoteDashboard = async (dashboardUuid: string): Promise<Dashboard> => {
    return lightdashApi<Dashboard>({
        url: `/dashboards/${dashboardUuid}/promote`,
        method: 'POST',
        body: undefined,
    });
};

export const usePromoteDashboardMutation = () => {
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<Dashboard, ApiError, string>(
        (data) => promoteDashboard(data),
        {
            mutationKey: ['promote_dashboard'],
            onSuccess: (data) => {
                showToastSuccess({
                    title: `Success! Dashboard was promoted.`,
                    action: {
                        children: 'Open dashboard',
                        icon: IconArrowRight,
                        onClick: () => {
                            window.open(
                                `/projects/${data.projectUuid}/dashboards/${data.uuid}`,
                                '_blank',
                            );
                        },
                    },
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to promote dashboard`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

const getPromoteDashboardDiff = async (
    chartUuid: string,
): Promise<PromotionChanges> => {
    return lightdashApi<PromotionChanges>({
        url: `/dashboards/${chartUuid}/promoteDiff`,
        method: 'GET',
        body: undefined,
    });
};

export const usePromoteDashboardDiffMutation = () => {
    const { showToastError } = useToaster();
    return useMutation<PromotionChanges, ApiError, string>(
        (data) => getPromoteDashboardDiff(data),
        {
            mutationKey: ['promote_dashboard_diff'],
            onSuccess: (data) => {
                return data;
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to get diff from dashboard`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};
