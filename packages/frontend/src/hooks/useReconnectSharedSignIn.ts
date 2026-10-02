import {
    type ApiError,
    type ApiSuccessEmpty,
    type SharedSignInStatus,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';

export const SHARED_SIGN_IN_RECONNECTED = 'shared-sign-in-reconnected';

export const getSharedSignInStatus = (projectUuid: string) =>
    lightdashApi<SharedSignInStatus | null>({
        url: `/projects/${projectUuid}/warehouse-credentials/shared-sign-in`,
        method: 'GET',
        body: undefined,
    });

export const useReconnectSharedSignIn = (projectUuid: string) => {
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
