import {
    type ApiError,
    type ApiSuccessEmpty,
    type SharedSignInStatus,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';

export const SHARED_SIGN_IN_RECONNECTED = 'shared-sign-in-reconnected';
export const SHARED_SIGN_IN_QUERY_FAILED = 'shared-sign-in-query-failed';

export const reportSharedSignInQueryFailure = (
    projectUuid: string,
    error: unknown,
) => {
    window.dispatchEvent(
        new CustomEvent(SHARED_SIGN_IN_QUERY_FAILED, {
            detail: { projectUuid, error },
        }),
    );
};

export const getSharedSignInStatus = (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<SharedSignInStatus | null>({
        url: `/projects/${projectUuid}/warehouse-credentials/shared-sign-in`,
        method: 'GET',
        body: undefined,
    });

export const useReconnectSharedSignIn = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<ApiSuccessEmpty, ApiError>({
        mutationFn: () =>
            lightdashApi<ApiSuccessEmpty>({
                url: `/projects/${projectUuid}/warehouse-credentials/shared-sign-in`,
                method: 'POST',
                body: undefined,
            }),
        onSuccess: async () => {
            queryClient.removeQueries({
                queryKey: ['shared-sign-in-status', projectUuid],
            });
            await queryClient.invalidateQueries();
            window.dispatchEvent(
                new CustomEvent(SHARED_SIGN_IN_RECONNECTED, {
                    detail: projectUuid,
                }),
            );
        },
    });
};
