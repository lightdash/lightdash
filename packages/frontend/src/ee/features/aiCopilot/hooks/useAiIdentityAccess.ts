import {
    AiIdentityState,
    type AiAccessForUser,
    type ApiError,
} from '@lightdash/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import { useSnowflakeLoginPopup } from '../../../../hooks/useSnowflake';

export const aiIdentityPersonQueryKey = ['ai-identity-person'];

export const isAiIdentityBlocked = (access: AiAccessForUser | undefined) =>
    access?.aiIdentityRequired === true &&
    access.state !== AiIdentityState.READY;

export const useAiIdentityAccess = (projectUuid: string | undefined) =>
    useQuery<AiAccessForUser, ApiError>({
        queryKey: [...aiIdentityPersonQueryKey, 'access', projectUuid],
        queryFn: () =>
            lightdashApi<AiAccessForUser>({
                version: 'v2',
                url: `/user/me/ai-access?projectUuid=${projectUuid}`,
                method: 'GET',
                body: undefined,
            }),
        enabled: !!projectUuid,
        refetchInterval: 30_000,
    });

export const useAiIdentitySignIn = () => {
    const queryClient = useQueryClient();
    return useSnowflakeLoginPopup({
        onLogin: async () => {
            await queryClient.invalidateQueries(aiIdentityPersonQueryKey);
        },
    });
};
