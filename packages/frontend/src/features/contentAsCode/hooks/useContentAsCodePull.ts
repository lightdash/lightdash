import {
    type ApiContentAsCodePullResponse,
    type ApiError,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

export const useContentAsCodePullMutation = (
    projectUuid: string | undefined,
) => {
    const { showToastSuccess, showToastWarning, showToastError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<ApiContentAsCodePullResponse['results'], ApiError>(
        () =>
            lightdashApi<ApiContentAsCodePullResponse['results']>({
                url: `/projects/${projectUuid}/code/pull`,
                method: 'POST',
                body: undefined,
            }),
        {
            onSuccess: (summary) => {
                void queryClient.invalidateQueries(['space', projectUuid]);
                void queryClient.invalidateQueries(['spaces', projectUuid]);
                void queryClient.invalidateQueries(['content']);
                const applied = `Synced ${summary.charts} chart${
                    summary.charts === 1 ? '' : 's'
                } and ${summary.dashboards} dashboard${
                    summary.dashboards === 1 ? '' : 's'
                } from the repo`;
                if (summary.skips.length > 0) {
                    showToastWarning({
                        title: applied,
                        subtitle: `${summary.skips.length} skipped — the project is ahead of git: ${summary.skips
                            .map((skip) => skip.slug)
                            .join(', ')}`,
                    });
                } else {
                    showToastSuccess({ title: applied });
                }
            },
            onError: (error) => {
                showToastError({
                    title: 'Failed to sync content from the repo',
                    subtitle: error.error.message,
                });
            },
        },
    );
};
