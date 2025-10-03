import { type ApiError, type ApiRevertChangeResponse } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const revertAllChanges = async (projectUuid: string) =>
    lightdashApi<ApiRevertChangeResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/changesets/revert-all`,
        method: 'POST',
        body: undefined,
    });

export const useRevertAllChanges = (projectUuid: string) => {
    const queryClient = useQueryClient();

    return useMutation<ApiRevertChangeResponse['results'], ApiError>({
        mutationFn: () => revertAllChanges(projectUuid),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ['activeChangesets', projectUuid],
            });
        },
    });
};
