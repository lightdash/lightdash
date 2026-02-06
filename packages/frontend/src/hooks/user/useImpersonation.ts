import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useApp from '../../providers/App/useApp';

const startImpersonation = async (targetUserUuid: string) =>
    lightdashApi<null>({
        url: `/impersonation/start`,
        method: 'POST',
        body: JSON.stringify({ targetUserUuid }),
    });

const stopImpersonation = async () =>
    lightdashApi<null>({
        url: `/impersonation/stop`,
        method: 'POST',
        body: undefined,
    });

export const useImpersonation = () => {
    const { user } = useApp();
    const impersonation = user.data?.impersonation ?? null;

    return {
        isImpersonating: impersonation !== null,
        impersonation,
    };
};

export const useStartImpersonation = () => {
    const queryClient = useQueryClient();

    return useMutation<null, ApiError, string>(startImpersonation, {
        mutationKey: ['impersonation_start'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['user']);
            window.location.reload();
        },
    });
};

export const useStopImpersonation = () => {
    const queryClient = useQueryClient();

    return useMutation<null, ApiError>(stopImpersonation, {
        mutationKey: ['impersonation_stop'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['user']);
            window.location.reload();
        },
    });
};
