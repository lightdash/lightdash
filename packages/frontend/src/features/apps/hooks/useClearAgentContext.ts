import { type ApiError, type ApiGetAppResponse } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    appApiBase,
    type ChartTypeOwner,
} from '../../chartTypes/utils/chartTypeOwner';
import { invalidateAppQueries } from './useRestoreAppVersion';

type ClearAgentContextResult = ApiGetAppResponse['results'];

const clearAgentContext = (
    projectUuid: string,
    appUuid: string,
    owner: ChartTypeOwner,
) =>
    lightdashApi<ClearAgentContextResult>({
        method: 'POST',
        url: `${appApiBase(owner, projectUuid)}/${appUuid}/threads`,
        body: undefined,
    });

/** Starts a fresh thread: the next prompt runs with no agent memory. */
export const useClearAgentContext = (
    projectUuid: string,
    appUuid: string,
    owner: ChartTypeOwner,
) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<ClearAgentContextResult, ApiError, void>({
        mutationFn: () => clearAgentContext(projectUuid, appUuid, owner),
        onSuccess: () => {
            void invalidateAppQueries(queryClient, projectUuid, appUuid, owner);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to clear agent context',
                apiError: error,
            });
        },
    });
};
