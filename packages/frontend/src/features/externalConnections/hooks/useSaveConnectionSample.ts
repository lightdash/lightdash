import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

type SaveSampleParams = {
    projectUuid: string;
    connectionUuid: string;
    sample: unknown;
};

const saveSample = async ({
    projectUuid,
    connectionUuid,
    sample,
}: SaveSampleParams): Promise<undefined> =>
    lightdashApi<undefined>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/external-connections/${connectionUuid}/sample`,
        body: JSON.stringify({ sample }),
    });

export const useSaveConnectionSample = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<undefined, ApiError, SaveSampleParams>({
        mutationFn: saveSample,
        onSuccess: async (_data, variables) => {
            await queryClient.invalidateQueries({
                queryKey: ['external-connections', variables.projectUuid],
            });
            showToastSuccess({ title: 'Sample saved' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to save sample',
                apiError: error,
            });
        },
    });
};
