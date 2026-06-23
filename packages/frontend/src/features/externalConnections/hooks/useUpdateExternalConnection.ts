import {
    type ApiError,
    type ExternalConnection,
    type UpdateExternalConnection,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

type UpdateParams = {
    projectUuid: string;
    connectionUuid: string;
    data: UpdateExternalConnection;
};

const updateExternalConnection = async ({
    projectUuid,
    connectionUuid,
    data,
}: UpdateParams) =>
    lightdashApi<ExternalConnection>({
        url: `/ee/projects/${projectUuid}/external-connections/${connectionUuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useUpdateExternalConnection = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<ExternalConnection, ApiError, UpdateParams>({
        mutationFn: updateExternalConnection,
        onSuccess: async (_data, variables) => {
            await queryClient.invalidateQueries({
                queryKey: ['external-connections', variables.projectUuid],
            });
            showToastSuccess({ title: 'Connection updated' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update connection',
                apiError: error,
            });
        },
    });
};
