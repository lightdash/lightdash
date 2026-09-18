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
import { lightdashApi } from '../api';
import useActiveJob from '../providers/ActiveJob/useActiveJob';
import useToaster from './toaster/useToaster';

const createPreviewProject = async ({
    projectUuid,
    name,
    dbtConnectionOverrides,
    warehouseConnectionOverrides,
}: {
    projectUuid: string;
    name: string;
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
            asyncCopyContent: true,
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
                            )?.stepError ?? 'Failed to copy preview project',
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
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        ApiCreatePreviewResults,
        ApiError,
        {
            projectUuid: string;
            name: string;
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
                title: `Preview project created`,
                action: {
                    children: 'Open preview project',
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
                title: `Failed to create preview project`,
                apiError: error,
            });
        },
    });
};
