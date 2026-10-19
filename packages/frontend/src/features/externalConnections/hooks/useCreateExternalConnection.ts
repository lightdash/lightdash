import {
    type ApiError,
    type CreateExternalConnection,
    type ExternalConnection,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type CreateParams = {
    projectUuid: string;
    data: CreateExternalConnection;
};

const createExternalConnection = async (
    lightdashApi: LightdashApi,
    { projectUuid, data }: CreateParams,
) =>
    lightdashApi<ExternalConnection>({
        url: `/ee/projects/${projectUuid}/external-connections`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useCreateExternalConnection = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<ExternalConnection, ApiError, CreateParams>({
        mutationFn: (args: CreateParams) =>
            createExternalConnection(lightdashApi, args),
        onSuccess: async (_data, variables) => {
            await queryClient.invalidateQueries({
                queryKey: ['external-connections', variables.projectUuid],
            });
            showToastSuccess({ title: 'Connection created' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to create connection',
                apiError: error,
            });
        },
    });
};
