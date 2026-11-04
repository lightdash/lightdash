import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type DeleteParams = {
    projectUuid: string;
    connectionUuid: string;
};

const deleteExternalConnection = async (
    lightdashApi: LightdashApi,
    { projectUuid, connectionUuid }: DeleteParams,
) =>
    lightdashApi<undefined>({
        url: `/ee/projects/${projectUuid}/external-connections/${connectionUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteExternalConnection = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<undefined, ApiError, DeleteParams>({
        mutationFn: (args: DeleteParams) =>
            deleteExternalConnection(lightdashApi, args),
        onSuccess: async (_data, variables) => {
            await queryClient.invalidateQueries({
                queryKey: ['external-connections', variables.projectUuid],
            });
            showToastSuccess({ title: 'Connection deleted' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to delete connection',
                apiError: error,
            });
        },
    });
};
