import {
    type AdditionalMetric,
    type ApiError,
    type PullRequestCreated,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

const writeBackCustomMetrics = async (
    projectUuid: string,
    payload: AdditionalMetric[],
): Promise<PullRequestCreated> => {
    return lightdashApi<PullRequestCreated>({
        url: `/projects/${projectUuid}/git-integration/pull-requests/custom-metrics`,
        method: 'POST',
        body: JSON.stringify({
            customMetrics: payload,
        }),
    });
};

export const useWriteBackCustomMetrics = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<PullRequestCreated, ApiError, AdditionalMetric[]>(
        (data) => writeBackCustomMetrics(projectUuid, data),
        {
            mutationKey: ['custom_metric_write_back', projectUuid],
            onSuccess: (pullRequest) => {
                window.open(pullRequest.prUrl, '_blank'); // always open in new tab by default

                showToastSuccess({
                    title: `Success! Custom metric was written back.`,
                    action: {
                        children: 'Open Pull Request',
                        icon: IconArrowRight,
                        onClick: () => {
                            window.open(pullRequest.prUrl, '_blank');
                        },
                    },
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to write back custom metric`,
                    apiError: error,
                });
            },
        },
    );
};
