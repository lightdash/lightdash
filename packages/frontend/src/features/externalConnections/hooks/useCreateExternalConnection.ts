import {
    type ApiError,
    type CreateExternalConnection,
    type ExternalConnection,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

type CreateParams = {
    projectUuid: string;
    data: CreateExternalConnection;
};

const createExternalConnection = async ({ projectUuid, data }: CreateParams) =>
    lightdashApi<ExternalConnection>({
        url: `/ee/projects/${projectUuid}/external-connections`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useCreateExternalConnection = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation('sync');
    return useMutation<ExternalConnection, ApiError, CreateParams>({
        mutationFn: createExternalConnection,
        onSuccess: async (_data, variables) => {
            await queryClient.invalidateQueries({
                queryKey: ['external-connections', variables.projectUuid],
            });
            showToastSuccess({
                title: t('externalConnections.toasts.created'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('externalConnections.toasts.createFailed'),
                apiError: error,
            });
        },
    });
};
