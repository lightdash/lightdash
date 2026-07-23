import {
    type ApiError,
    type ApiUpgradeAppResponse,
    type UpgradeAppRequestBody,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

type UpgradeAppParams = {
    projectUuid: string;
    appUuid: string;
    body: UpgradeAppRequestBody;
};

type UpgradeAppResult = ApiUpgradeAppResponse['results'];

const upgradeApp = ({ projectUuid, appUuid, body }: UpgradeAppParams) =>
    lightdashApi<UpgradeAppResult>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/upgrade`,
        body: JSON.stringify(body),
    });

export const useUpgradeApp = () => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<UpgradeAppResult, ApiError, UpgradeAppParams>({
        mutationFn: upgradeApp,
        onSuccess: (_result, { projectUuid, appUuid }) => {
            // The new pending version lands in the app query; the build
            // experience's polling takes over from there.
            void queryClient.invalidateQueries({
                queryKey: ['app', projectUuid, appUuid],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to upgrade app',
                apiError: error,
            });
        },
    });
};
