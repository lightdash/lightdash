import {
    type ApiError,
    type AppExternalConnectionLink,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

type LinkParams = {
    projectUuid: string;
    appUuid: string;
    externalConnectionUuid: string;
    alias: string;
};

const linkExternalConnection = async ({
    projectUuid,
    appUuid,
    externalConnectionUuid,
    alias,
}: LinkParams) =>
    lightdashApi<AppExternalConnectionLink>({
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/external-connections`,
        method: 'POST',
        body: JSON.stringify({ externalConnectionUuid, alias }),
    });

export const useLinkExternalConnection = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<AppExternalConnectionLink, ApiError, LinkParams>({
        mutationFn: linkExternalConnection,
        onSuccess: async (_data, variables) => {
            await queryClient.invalidateQueries({
                queryKey: [
                    'app-external-connections',
                    variables.projectUuid,
                    variables.appUuid,
                ],
            });
            showToastSuccess({ title: 'Connection linked' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to link connection',
                apiError: error,
            });
        },
    });
};
