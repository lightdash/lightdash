import { subject } from '@casl/ability';
import {
    type ApiContentAsCodeProposeResponse,
    type ApiContentAsCodeWriteBackStatusResponse,
    type ApiError,
    type ContentAsCodeSnapshotType,
    type ContentAsCodeWriteBackStatus,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import useApp from '../../../providers/App/useApp';

const getWriteBackStatus = async (
    projectUuid: string,
    contentType: ContentAsCodeSnapshotType,
    slug: string,
) =>
    lightdashApi<ApiContentAsCodeWriteBackStatusResponse['results']>({
        method: 'GET',
        url: `/projects/${projectUuid}/code/write-back-status?${new URLSearchParams(
            { contentType, slug },
        ).toString()}`,
        body: undefined,
    });

const proposeContentAsCode = async (
    projectUuid: string,
    contentType: ContentAsCodeSnapshotType,
    slug: string,
) =>
    lightdashApi<ApiContentAsCodeProposeResponse['results']>({
        method: 'POST',
        url: `/projects/${projectUuid}/code/propose`,
        body: JSON.stringify({ contentType, slug }),
    });

export const useCanProposeContentAsCode = (project?: {
    organizationUuid: string;
    projectUuid: string;
}) => {
    const { user } = useApp();
    return (
        !!project &&
        !!user.data?.ability.can(
            'create',
            subject('ContentAsCode', {
                organizationUuid: project.organizationUuid,
                projectUuid: project.projectUuid,
            }),
        )
    );
};

export const useContentAsCodeWriteBackStatus = (
    projectUuid: string | undefined,
    contentType: ContentAsCodeSnapshotType,
    slug: string | undefined,
    enabled: boolean,
) => {
    return useQuery<ContentAsCodeWriteBackStatus, ApiError>({
        queryKey: [
            'content-as-code-write-back-status',
            projectUuid,
            contentType,
            slug,
        ],
        queryFn: () => getWriteBackStatus(projectUuid!, contentType, slug!),
        enabled: enabled && !!projectUuid && !!slug,
    });
};

export const useProposeContentAsCode = (
    projectUuid: string | undefined,
    contentType: ContentAsCodeSnapshotType,
    slug: string | undefined,
) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<
        ApiContentAsCodeProposeResponse['results'],
        ApiError,
        void
    >(() => proposeContentAsCode(projectUuid!, contentType, slug!), {
        onSuccess: (result) => {
            void queryClient.invalidateQueries({
                queryKey: [
                    'content-as-code-write-back-status',
                    projectUuid,
                    contentType,
                    slug,
                ],
            });
            showToastSuccess({
                title:
                    result.notedChartSlugs.length > 0
                        ? 'Opened a pull request'
                        : 'Proposed changes to git',
                action: {
                    children: 'View pull request',
                    onClick: () =>
                        window.open(
                            result.prUrl,
                            '_blank',
                            'noopener,noreferrer',
                        ),
                },
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to propose to git',
                apiError: error,
            });
        },
    });
};
