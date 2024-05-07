import { type ApiError, type SavedChart } from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';

const promoteChart = async (chartUuid: string): Promise<SavedChart> => {
    return lightdashApi<SavedChart>({
        url: `/saved/${chartUuid}/promote`,
        method: 'POST',
        body: undefined,
    });
};

export const usePromoteMutation = () => {
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<SavedChart, ApiError, string>(
        (data) => promoteChart(data),
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
                                `/projects/${data.projectUuid}/saved/${data.uuid}`,
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
