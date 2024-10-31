import { type ApiError } from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';

const createPreviewProject = async ({
    projectUuid,
    name,
}: {
    projectUuid: string;
    name: string;
}) =>
    lightdashApi<string>({
        url: `/projects/${projectUuid}/createPreview`,
        method: 'POST',
        body: JSON.stringify({
            name,
            copyContent: true, // TODO add this option to the UI
        }),
    });

export const useCreatePreviewMutation = () => {
    const queryClient = useQueryClient();

    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<string, ApiError, { projectUuid: string; name: string }>(
        (data) => createPreviewProject(data),
        {
            mutationKey: ['preview_project_create'],
            onSuccess: async (projectUuid) => {
                await queryClient.invalidateQueries(['projects']);

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
        },
    );
};
