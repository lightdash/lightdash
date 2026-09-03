import {
    DbtProjectType,
    type AdditionalMetric,
    type ApiCustomDimensionWriteBackPreview,
    type ApiError,
    type CustomDimension,
    type PullRequestCreated,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useProject } from '../../../hooks/useProject';

const writeBackCustomDimensions = async (
    projectUuid: string,
    payload: CustomDimension[],
): Promise<PullRequestCreated> => {
    return lightdashApi<PullRequestCreated>({
        url: `/projects/${projectUuid}/git-integration/pull-requests/custom-dimensions`,
        method: 'POST',
        body: JSON.stringify({
            customDimensions: payload,
        }),
    });
};

const getCustomDimensionsWriteBackPreview = async (
    projectUuid: string,
    customDimensions: CustomDimension[],
): Promise<ApiCustomDimensionWriteBackPreview['results']> =>
    lightdashApi<ApiCustomDimensionWriteBackPreview['results']>({
        url: `/projects/${projectUuid}/git-integration/pull-requests/custom-dimensions/preview`,
        method: 'POST',
        body: JSON.stringify({ customDimensions }),
    });

export const useCustomDimensionsWriteBackPreview = (
    projectUuid: string,
    customDimensions: CustomDimension[],
) =>
    useQuery<ApiCustomDimensionWriteBackPreview['results'], ApiError>({
        queryKey: [
            'custom_dimension_write_back_preview',
            projectUuid,
            customDimensions,
        ],
        queryFn: () =>
            getCustomDimensionsWriteBackPreview(projectUuid, customDimensions),
        enabled: customDimensions.length > 0,
        retry: false,
    });

export const useWriteBackCustomDimensions = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<PullRequestCreated, ApiError, CustomDimension[]>(
        (data) => writeBackCustomDimensions(projectUuid, data),
        {
            mutationKey: ['custom_dimension_write_back', projectUuid],
            onSuccess: (pullRequest) => {
                window.open(pullRequest.prUrl, '_blank', 'noopener,noreferrer'); // always open in new tab by default

                showToastSuccess({
                    title: `Success! Custom dimension was written back.`,
                    action: {
                        children: 'Open Pull Request',
                        icon: IconArrowRight,
                        onClick: () => {
                            window.open(
                                pullRequest.prUrl,
                                '_blank',
                                'noopener,noreferrer',
                            );
                        },
                    },
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to write back custom dimension`,
                    apiError: error,
                });
            },
        },
    );
};

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
                window.open(pullRequest.prUrl, '_blank', 'noopener,noreferrer'); // always open in new tab by default

                showToastSuccess({
                    title: `Success! Custom metric was written back.`,
                    action: {
                        children: 'Open Pull Request',
                        icon: IconArrowRight,
                        onClick: () => {
                            window.open(
                                pullRequest.prUrl,
                                '_blank',
                                'noopener,noreferrer',
                            );
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

export const useIsGitProject = (projectUuid: string) => {
    const { data: project } = useProject(projectUuid);
    return [DbtProjectType.GITHUB, DbtProjectType.GITLAB].includes(
        project?.dbtConnection.type as DbtProjectType,
    );
};
