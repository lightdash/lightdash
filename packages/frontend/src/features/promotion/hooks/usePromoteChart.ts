import {
    type ApiError,
    type PromotionChanges,
    type SavedChart,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const promoteChart = async (
    lightdashApi: LightdashApi,
    chartUuid: string,
): Promise<SavedChart> => {
    return lightdashApi<SavedChart>({
        url: `/saved/${chartUuid}/promote`,
        method: 'POST',
        body: undefined,
    });
};

export const usePromoteMutation = () => {
    const lightdashApi = useLightdashApi();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<SavedChart, ApiError, string>(
        (data) => promoteChart(lightdashApi, data),
        {
            mutationKey: ['promote_chart'],
            onSuccess: (data) => {
                showToastSuccess({
                    title: `Success! Chart was promoted.`,
                    action: {
                        children: 'Open chart',
                        icon: IconArrowRight,
                        onClick: () => {
                            window.open(
                                `/projects/${data.projectUuid}/saved/${data.slug}`,
                                '_blank',
                            );
                        },
                    },
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to promote chart`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

const getPromoteChartDiff = async (
    lightdashApi: LightdashApi,
    chartUuid: string,
): Promise<PromotionChanges> => {
    return lightdashApi<PromotionChanges>({
        url: `/saved/${chartUuid}/promoteDiff`,
        method: 'GET',
        body: undefined,
    });
};

export const usePromoteChartDiffMutation = () => {
    const lightdashApi = useLightdashApi();
    const { showToastError } = useToaster();
    return useMutation<PromotionChanges, ApiError, string>(
        (data) => getPromoteChartDiff(lightdashApi, data),
        {
            mutationKey: ['promote_chart_diff'],
            onSuccess: (data) => {
                return data;
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to get diff from chart`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};
