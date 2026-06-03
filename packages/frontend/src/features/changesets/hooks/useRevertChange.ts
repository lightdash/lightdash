import { type ApiRevertChangeResponse } from '@lightdash/ai';
import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const revertChange = async (projectUuid: string, changeUuid: string) =>
    lightdashApi<ApiRevertChangeResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/changesets/changes/${changeUuid}/revert`,
        method: 'POST',
        body: undefined,
    });

export const useRevertChange = (projectUuid: string) => {
    const queryClient = useQueryClient();

    return useMutation<
        ApiRevertChangeResponse['results'],
        ApiError,
        { changeUuid: string }
    >({
        mutationFn: ({ changeUuid }) => revertChange(projectUuid, changeUuid),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ['activeChangesets', projectUuid],
            });
        },
    });
};
