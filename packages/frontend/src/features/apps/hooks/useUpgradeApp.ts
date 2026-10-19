import {
    type ApiError,
    type ApiUpgradeAppResponse,
    type UpgradeAppRequestBody,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type UpgradeAppParams = {
    projectUuid: string;
    appUuid: string;
    body: UpgradeAppRequestBody;
};

type UpgradeAppResult = ApiUpgradeAppResponse['results'];

const upgradeApp = (
    lightdashApi: LightdashApi,
    { projectUuid, appUuid, body }: UpgradeAppParams,
) =>
    lightdashApi<UpgradeAppResult>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/upgrade`,
        body: JSON.stringify(body),
    });

export const useUpgradeApp = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<UpgradeAppResult, ApiError, UpgradeAppParams>({
        mutationFn: (args: UpgradeAppParams) => upgradeApp(lightdashApi, args),
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
