import {
    JobStatusType,
    JobStepStatusType,
    sleep,
    type Job,
    type ApiCreatePreviewResults,
    type ApiError,
    type DbtProjectEnvironmentVariable,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../api';
import i18n from '../i18n/i18n';
import useActiveJob from '../providers/ActiveJob/useActiveJob';
import useToaster from './toaster/useToaster';

const createPreviewProject = async ({
    projectUuid,
    name,
    asyncCopyContent,
    dbtConnectionOverrides,
    warehouseConnectionOverrides,
}: {
    projectUuid: string;
    name: string;
    asyncCopyContent: boolean;
    dbtConnectionOverrides?: {
        branch?: string;
        environment?: DbtProjectEnvironmentVariable[];
        manifest?: string;
    };
    warehouseConnectionOverrides?: { schema?: string };
}) => {
    const preview = await lightdashApi<ApiCreatePreviewResults>({
        url: `/projects/${projectUuid}/createPreview`,
        method: 'POST',
        body: JSON.stringify({
            name,
            copyContent: true, // TODO add this option to the UI
            asyncCopyContent,
            dbtConnectionOverrides,
            warehouseConnectionOverrides,
        }),
    });
    if (preview.contentCopyJobUuid) {
        while (true) {
            const job = await lightdashApi<Job>({
                url: `/jobs/${preview.contentCopyJobUuid}`,
                method: 'GET',
                body: undefined,
            });
            if (job.jobStatus === JobStatusType.DONE) break;
            if (job.jobStatus === JobStatusType.ERROR) {
                const error: ApiError = {
                    status: 'error',
                    error: {
                        name: 'PreviewContentCopyError',
                        data: {},
                        statusCode: 500,
                        message:
                            job.steps.find(
                                (step) =>
                                    step.stepStatus === JobStepStatusType.ERROR,
                            )?.stepError ??
                            i18n.t('useProjectPreview.copyFailed', {
                                ns: 'app',
                            }),
                    },
                };
                throw error;
            }
            await sleep(1000);
        }
    }
    return preview;
};

export const useCreatePreviewMutation = () => {
    const queryClient = useQueryClient();
    const { setActiveJobId } = useActiveJob();
    const { t } = useTranslation('app');
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        ApiCreatePreviewResults,
        ApiError,
        {
            projectUuid: string;
            name: string;
            asyncCopyContent: boolean;
            dbtConnectionOverrides?: {
                branch?: string;
                environment?: DbtProjectEnvironmentVariable[];
                manifest?: string;
            };
            warehouseConnectionOverrides?: { schema?: string };
        }
    >((data) => createPreviewProject(data), {
        mutationKey: ['preview_project_create'],
        onSuccess: async ({ projectUuid, compileJobUuid }) => {
            await queryClient.invalidateQueries(['projects']);
            setActiveJobId(compileJobUuid);
            showToastSuccess({
                title: t('useProjectPreview.previewProjectCreated'),
                action: {
                    children: t('useProjectPreview.openPreviewProject'),
                    icon: IconArrowRight,
                    onClick: () => {
                        const url = `${window.origin}/projects/${projectUuid}/home`;
                        window.open(url, '_blank');
                    },
                },
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('useProjectPreview.failedToCreatePreviewProject'),
                apiError: error,
            });
        },
    });
};
