import {
    type ApiError,
    type ExternalConnection,
    type UpdateExternalConnection,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { invalidateSavedConnection } from './invalidateSavedConnection';

type UpdateParams = {
    projectUuid: string;
    connectionUuid: string;
    data: UpdateExternalConnection;
};

const updateExternalConnection = async (
    lightdashApi: LightdashApi,
    { projectUuid, connectionUuid, data }: UpdateParams,
) =>
    lightdashApi<ExternalConnection>({
        url: `/ee/projects/${projectUuid}/external-connections/${connectionUuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

type UpdateMessages = { updated: string; failed: string };

const CONNECTION_MESSAGES: UpdateMessages = {
    updated: 'Connection updated',
    failed: 'Failed to update connection',
};

export const LIVE_SOURCE_UPDATE_MESSAGES: UpdateMessages = {
    updated: 'Live data source updated',
    failed: 'Failed to update live data source',
};

export const useUpdateExternalConnection = (
    messages: UpdateMessages = CONNECTION_MESSAGES,
) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<ExternalConnection, ApiError, UpdateParams>({
        mutationFn: (args: UpdateParams) =>
            updateExternalConnection(lightdashApi, args),
        onSuccess: async (connection, variables) => {
            await invalidateSavedConnection(
                queryClient,
                variables.projectUuid,
                connection,
            );
            showToastSuccess({ title: messages.updated });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: messages.failed,
                apiError: error,
            });
        },
    });
};
