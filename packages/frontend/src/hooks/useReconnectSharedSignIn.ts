import {
    isApiError,
    type ApiError,
    type ApiSuccessEmpty,
    type SharedSignInStatus,
    type PersonalSignInExpiry,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { type LightdashApi } from '../api';
import {
    isWarehouseSignInTargetCurrent,
    type WarehouseSignInBinding,
    type WarehouseSignInTarget,
} from '../components/NavBar/warehouseSignInPreflight';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import {
    type captureSharedSignInQueryScope,
    isCurrentSharedSignInQueryScope,
    completeSharedSignInRestoration,
    rememberSharedSignInFailure,
} from './sharedSignInQueryRecovery';
import { isAcceptedSharedSignInRestoration } from './sharedSignInQueryRecovery';
import useToaster from './toaster/useToaster';

export const SHARED_SIGN_IN_RECONNECTED = 'shared-sign-in-reconnected';
export const SHARED_SIGN_IN_QUERY_FAILED = 'shared-sign-in-query-failed';

export const reportSharedSignInQueryFailure = (
    projectUuid: string,
    error: unknown,
    execution: ReturnType<typeof captureSharedSignInQueryScope> = null,
) => {
    if (isApiError(error)) rememberSharedSignInFailure(error.error, execution);
    if (execution && !isCurrentSharedSignInQueryScope(execution)) return;
    window.dispatchEvent(
        new CustomEvent(SHARED_SIGN_IN_QUERY_FAILED, {
            detail: { projectUuid, error, execution },
        }),
    );
};

export const getSharedSignInStatus = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    binding: WarehouseSignInBinding = null,
) =>
    lightdashApi<SharedSignInStatus | null>({
        url: `/projects/${projectUuid}/warehouse-credentials/shared-sign-in?includePersonal=true${binding === null ? '' : `&warehouseConnectionUuid=${encodeURIComponent(binding)}`}`,
        method: 'GET',
        body: undefined,
    });

export const useReconnectSharedSignIn = (
    projectUuid: string,
    personal?: PersonalSignInExpiry,
    target?: WarehouseSignInTarget,
) => {
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const lightdashApi = useLightdashApi();
    const { showToastSuccess } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<ApiSuccessEmpty, ApiError>({
        mutationFn: async () => {
            if (target && !isWarehouseSignInTargetCurrent(target))
                throw new Error('Connection selection changed.');
            if (personal) {
                const status = await getSharedSignInStatus(
                    lightdashApi,
                    projectUuid,
                    target?.binding ?? null,
                );
                const restored = status?.personalSignIn;
                if (
                    (target && !isWarehouseSignInTargetCurrent(target)) ||
                    !restored ||
                    status.personalSelection?.warehouseConnectionUuid !==
                        (target?.binding ?? null) ||
                    restored.provider !== personal.provider ||
                    restored.projectUuid !== projectUuid ||
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
        onSuccess: async () => {
            if (
                !mounted.current ||
                !target ||
                !isWarehouseSignInTargetCurrent(target)
            )
                return;
            const receipt = await completeSharedSignInRestoration(
                queryClient,
                target,
                () => mounted.current,
            );
            if (receipt && isAcceptedSharedSignInRestoration(receipt)) {
                window.dispatchEvent(
                    new CustomEvent(SHARED_SIGN_IN_RECONNECTED, {
                        detail: receipt,
                    }),
                );
                if (isAcceptedSharedSignInRestoration(receipt))
                    showToastSuccess({ title: 'Connection restored' });
            }
        },
    });
};
