import {
    type ApiError,
    type ApiSuccessEmpty,
    type SharedSignInStatus,
    type PersonalSignInExpiry,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import {
    isWarehouseSignInTargetCurrent,
    type WarehouseSignInBinding,
    type WarehouseSignInTarget,
} from '../components/NavBar/warehouseSignInPreflight';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';

export const SHARED_SIGN_IN_RECONNECTED = 'shared-sign-in-reconnected';
export const SHARED_SIGN_IN_QUERY_FAILED = 'shared-sign-in-query-failed';

export type PersonalSignInRestoration = Omit<
    WarehouseSignInTarget,
    'status'
> & { personalSignIn: PersonalSignInExpiry };
const restoredEventDetail = (
    projectUuid: string,
    target: WarehouseSignInTarget | undefined,
): string | PersonalSignInRestoration => {
    if (!target?.status.personalSignIn) return projectUuid;
    const { status, ...identity } = target;
    return { ...identity, personalSignIn: status.personalSignIn! };
};

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
    const lightdashApi = useLightdashApi();
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
            if (target && !isWarehouseSignInTargetCurrent(target)) return;
            queryClient.removeQueries({
                queryKey: ['shared-sign-in-status', projectUuid],
            });
            await queryClient.invalidateQueries();
            if (target && !isWarehouseSignInTargetCurrent(target)) return;
            window.dispatchEvent(
                new CustomEvent(SHARED_SIGN_IN_RECONNECTED, {
                    detail: restoredEventDetail(projectUuid, target),
                }),
            );
        },
    });
};
