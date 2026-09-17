import { type ApiError, type ApiGetAppResponse } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { invalidateAppAfterRestore } from './useRestoreAppVersion';

type ClearAgentContextResult = ApiGetAppResponse['results'];

const clearAgentContext = (projectUuid: string, appUuid: string) =>
    lightdashApi<ClearAgentContextResult>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/threads`,
        body: undefined,
    });

/** Starts a fresh thread: the next prompt runs with no agent memory. */
export const useClearAgentContext = (projectUuid: string, appUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<ClearAgentContextResult, ApiError, void>({
        mutationFn: () => clearAgentContext(projectUuid, appUuid),
        onSuccess: () => {
            void invalidateAppAfterRestore(queryClient, projectUuid, appUuid);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to clear agent context',
                apiError: error,
            });
        },
    });
};
