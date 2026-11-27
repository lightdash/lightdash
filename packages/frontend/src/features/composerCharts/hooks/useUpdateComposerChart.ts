import {
    type ApiError,
    type ComposerChart,
    type UpdateComposerChart,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import useToaster from '../../../hooks/toaster/useToaster';
import { invalidateContent } from '../../../hooks/useContent';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

/** Renames a space-owned composer chart; makes no new version. */
export const useUpdateComposerChart = (
    projectUuid: string,
    composerChartUuid: string,
) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<ComposerChart, ApiError, UpdateComposerChart>({
        mutationFn: (body) =>
            lightdashApi<ComposerChart>({
                url: `/projects/${projectUuid}/composer-charts/${composerChartUuid}`,
                version: 'v2',
                method: 'PATCH',
                body: JSON.stringify(body),
            }),
        onSuccess: async () => {
            await invalidateContent(queryClient, projectUuid);
            showToastSuccess({ title: 'Chart updated' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update chart',
                apiError: error,
            });
        },
    });
};
