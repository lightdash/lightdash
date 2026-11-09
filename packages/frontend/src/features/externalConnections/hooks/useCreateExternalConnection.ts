import {
    type ApiError,
    type CreateExternalConnection,
    type ExternalConnection,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { invalidateSavedConnection } from './invalidateSavedConnection';

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

type CreateMessages = { created: string; failed: string };

const CONNECTION_MESSAGES: CreateMessages = {
    created: 'Connection created',
    failed: 'Failed to create connection',
};

export const LIVE_SOURCE_CREATE_MESSAGES: CreateMessages = {
    created: 'Live data source added',
    failed: 'Failed to add live data source',
};

export const useCreateExternalConnection = (
    messages: CreateMessages = CONNECTION_MESSAGES,
) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<ExternalConnection, ApiError, CreateParams>({
        mutationFn: (args: CreateParams) =>
            createExternalConnection(lightdashApi, args),
        onSuccess: async (connection, variables) => {
            await invalidateSavedConnection(
                queryClient,
                variables.projectUuid,
                connection,
            );
            showToastSuccess({ title: messages.created });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: messages.failed,
                apiError: error,
            });
        },
    });
};
