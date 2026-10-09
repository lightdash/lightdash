import { type ApiError, type ApiGetAppResponse } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { invalidateAppQueries } from './useRestoreAppVersion';

type ClearAgentContextResult = ApiGetAppResponse['results'];

const clearAgentContext = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    appUuid: string,
) =>
    lightdashApi<ClearAgentContextResult>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/threads`,
        body: undefined,
    });

/** Starts a fresh thread: the next prompt runs with no agent memory. */
export const useClearAgentContext = (projectUuid: string, appUuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<ClearAgentContextResult, ApiError, void>({
        mutationFn: () => clearAgentContext(lightdashApi, projectUuid, appUuid),
        onSuccess: () => {
            void invalidateAppQueries(queryClient, projectUuid, appUuid);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to clear agent context',
                apiError: error,
            });
        },
    });
};
