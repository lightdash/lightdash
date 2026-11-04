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
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useProject } from '../../../hooks/useProject';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const writeBackCustomDimensions = async (
    lightdashApi: LightdashApi,
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
    lightdashApi: LightdashApi,
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
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiCustomDimensionWriteBackPreview['results'], ApiError>({
        queryKey: [
            'custom_dimension_write_back_preview',
            projectUuid,
            customDimensions,
        ],
        queryFn: () =>
            getCustomDimensionsWriteBackPreview(
                lightdashApi,
                projectUuid,
                customDimensions,
            ),
        enabled: customDimensions.length > 0,
        retry: false,
    });
};

export const useWriteBackCustomDimensions = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<PullRequestCreated, ApiError, CustomDimension[]>(
        (data) => writeBackCustomDimensions(lightdashApi, projectUuid, data),
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
    lightdashApi: LightdashApi,
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
    const lightdashApi = useLightdashApi();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<PullRequestCreated, ApiError, AdditionalMetric[]>(
        (data) => writeBackCustomMetrics(lightdashApi, projectUuid, data),
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

export const useSupportsCustomFieldWriteBack = (projectUuid: string) => {
    const { data: project } = useProject(projectUuid);
    const connection = project?.dbtConnection;
    if (!connection) {
        return false;
    }
    if (connection.type === DbtProjectType.BITBUCKET) {
        const host = connection.host_domain
            ?.trim()
            .toLowerCase()
            .replace(/\.$/, '');
        return !host || host === 'bitbucket.org';
    }
    return (
        connection.type === DbtProjectType.GITHUB ||
        connection.type === DbtProjectType.GITLAB
    );
};

export const useIsNativeGitProject = (projectUuid: string) => {
    const { data: project } = useProject(projectUuid);
    return (
        project?.dbtConnection.type === DbtProjectType.GITHUB &&
        project.dbtConnection.semanticLayer === 'lightdash'
    );
};
