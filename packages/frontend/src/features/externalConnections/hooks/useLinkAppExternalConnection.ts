import { type ApiError } from '@lightdash/common'; // pragma: allowlist secret
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api'; // pragma: allowlist secret
import useToaster from '../../../hooks/toaster/useToaster';
import { invalidateAppConnectionQueries } from './invalidateAppConnectionQueries';

type LinkParams = {
    projectUuid: string;
    appUuid: string;
    externalConnectionUuid: string;
    alias: string;
};

const linkAppExternalConnection = async ({
    projectUuid,
    appUuid,
    externalConnectionUuid,
    alias,
}: LinkParams) =>
    // oxfmt-ignore
    lightdashApi<undefined>({ url: `/ee/projects/${projectUuid}/apps/${appUuid}/external-connections`, method: 'POST', body: JSON.stringify({ externalConnectionUuid, alias }) }); // pragma: allowlist secret

export const useLinkAppExternalConnection = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<undefined, ApiError, LinkParams>({
        mutationFn: linkAppExternalConnection,
        onSuccess: async (_data, variables) => {
            await invalidateAppConnectionQueries(
                queryClient,
                variables.projectUuid,
                variables.appUuid,
            );
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
