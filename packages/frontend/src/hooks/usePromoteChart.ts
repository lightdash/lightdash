import { type ApiError, type SavedChart } from '@lightdash/common';
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
                console.debug(data);
                showToastSuccess({
                    title: `Success! Chart was promoted.`,
                    //TODO show link to promoted chart
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
