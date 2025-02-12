import {
    type AdditionalMetric,
    type ApiError,
    type PreviewPullRequest,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

const previewWriteBackCustomMetrics = async (
    projectUuid: string,
    payload: AdditionalMetric[],
): Promise<PreviewPullRequest> => {
    return lightdashApi<PreviewPullRequest>({
        url: `/projects/${projectUuid}/git-integration/preview/custom-metrics`,
        method: 'POST',
        body: JSON.stringify({
            customMetrics: payload,
        }),
    });
};

export const usePreviewWriteBackCustomMetrics = (projectUuid: string) => {
    const { showToastApiError } = useToaster();
    return useMutation<PreviewPullRequest, ApiError, AdditionalMetric[]>(
        (data) => previewWriteBackCustomMetrics(projectUuid, data),
        {
            mutationKey: ['preview_custom_metric_write_back', projectUuid],

            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to get preview from write back custom metric`,
                    apiError: error,
                });
            },
        },
    );
};
