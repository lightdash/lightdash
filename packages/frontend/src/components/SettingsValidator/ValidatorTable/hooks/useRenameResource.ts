import {
    type ApiError,
    type ApiJobScheduledResponse,
    type ApiRenameChartBody,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

const getFieldsForChart = async ({
    projectUuid,
    chartUuid,
}: {
    projectUuid: string;
    chartUuid: string;
}) => {
    return lightdashApi<{ [key: string]: string[] }>({
        url: `/projects/${projectUuid}/rename/chart/${chartUuid}/fields`,
        method: 'GET',
        body: undefined,
    });
};

export const useFieldsForChart = (projectUuid?: string, chartUuid?: string) => {
    return useQuery<{ [key: string]: string[] }, ApiError>({
        queryKey: ['fields-for-chart', projectUuid, chartUuid],
        queryFn: () =>
            getFieldsForChart({
                projectUuid: projectUuid!,
                chartUuid: chartUuid!,
            }),
        enabled: !!projectUuid && !!chartUuid,
    });
};

const renameChart = async ({
    projectUuid,
    chartUuid,
    from,
    to,
    fixAll,
    type,
}: ApiRenameChartBody & { projectUuid: string; chartUuid: string }) => {
    return lightdashApi<ApiJobScheduledResponse['results']>({
        url: `/projects/${projectUuid}/rename/chart/${chartUuid}`,
        method: 'POST',
        body: JSON.stringify({
            from,
            to,
            chartUuid,
            fixAll,
            type,
        }),
    });
};

export const useRenameChart = () => {
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<
        ApiJobScheduledResponse['results'],
        ApiError,
        ApiRenameChartBody & {
            chartUuid: string;
            resourceUrl?: string;
            projectUuid: string;
        }
    >({
        mutationKey: ['rename-chart'],
        mutationFn: (data) => {
            return renameChart(data);
        },

        onSuccess: async (job, { from, resourceUrl }) => {
            showToastSuccess({
                key: 'dashboard_export_toast',
                title: `Success! chart ${from} was renamed.`,
                action: {
                    children: 'Open',
                    icon: IconArrowRight,
                    onClick: () => {
                        window.open(resourceUrl, '_blank');
                    },
                },
            });
        },
        onError: (error) => {
            console.error(error);
            showToastError({
                key: 'dashboard_export_toast',
                title: `Unable to rename chart`,
                subtitle: error.error.message,
            });
        },
    });
};
