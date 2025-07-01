import {
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
    };
    warehouseConnectionOverrides?: { schema?: string };
}) =>
    lightdashApi<ApiCreatePreviewResults>({
        url: `/projects/${projectUuid}/createPreview`,
        method: 'POST',
        body: JSON.stringify({
            name,
            copyContent: true, // TODO add this option to the UI
            dbtConnectionOverrides,
            warehouseConnectionOverrides,
        }),
    });

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
