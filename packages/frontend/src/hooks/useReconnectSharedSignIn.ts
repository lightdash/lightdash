import {
    type ApiError,
    type ApiSuccessEmpty,
    type SharedSignInStatus,
    type PersonalSignInExpiry,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import {
    captureSharedSignInQueryScope,
    isCurrentSharedSignInQueryScope,
} from './sharedSignInQueryRecovery';

export const SHARED_SIGN_IN_RECONNECTED = 'shared-sign-in-reconnected';
export const SHARED_SIGN_IN_QUERY_FAILED = 'shared-sign-in-query-failed';

export const reportSharedSignInQueryFailure = (
    projectUuid: string,
    error: unknown,
    scope = captureSharedSignInQueryScope(projectUuid),
) => {
    if (
        scope !== captureSharedSignInQueryScope(projectUuid) ||
        (scope && !isCurrentSharedSignInQueryScope(scope))
    )
        return;
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
        url: `/projects/${projectUuid}/warehouse-credentials/shared-sign-in?includePersonal=true`,
        method: 'GET',
        body: undefined,
    });

export const useReconnectSharedSignIn = (
    projectUuid: string,
    personal?: PersonalSignInExpiry,
) => {
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<ApiSuccessEmpty, ApiError>({
        mutationFn: async () => {
            if (personal) {
                const status = await getSharedSignInStatus(
                    lightdashApi,
                    projectUuid,
                );
                const restored = status?.personalSignIn;
                if (
                    !restored ||
                    restored.userWarehouseCredentialsUuid !==
                        personal.userWarehouseCredentialsUuid ||
                    restored.expired ||
                    status.statusUnknown
                ) {
                    const error: ApiError = {
                        status: 'error',
                        error: {
                            name: 'ParameterError',
                            data: {},
                            statusCode: 400,
                            message:
                                'Sign in with Google did not finish. Try again.',
                        },
                    };
                    throw error;
                }
                return { status: 'ok', results: undefined } as ApiSuccessEmpty;
            }
            return lightdashApi<ApiSuccessEmpty>({
                url: `/projects/${projectUuid}/warehouse-credentials/shared-sign-in`,
                method: 'POST',
                body: undefined,
            });
        },
        onSuccess: () => {
            if (!mounted.current) return;
            queryClient.removeQueries({
                queryKey: ['shared-sign-in-status', projectUuid],
            });
            window.dispatchEvent(
                new CustomEvent(SHARED_SIGN_IN_RECONNECTED, {
                    detail: projectUuid,
                }),
            );
        },
    });
};
