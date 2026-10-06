import {
    getAiIdentitySetupCheckInterval,
    type AiIdentityProvisioningSettings,
    type ApiError,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiIdentityProvisioningApi } from './api';

export const useProvisioning = (uuid: string) =>
    useQuery({
        queryKey: ['ai-identity-provisioning', uuid],
        queryFn: () => aiIdentityProvisioningApi.settings(uuid),
    });

export const useProvisioningChange = (uuid: string) => {
    const client = useQueryClient();
    return useMutation<
        AiIdentityProvisioningSettings,
        ApiError,
        () => Promise<AiIdentityProvisioningSettings>
    >({
        mutationFn: (action) => action(),
        onSuccess: (settings) => {
            void client.invalidateQueries([
                'ai-identity-exclusion-changes',
                uuid,
            ]);
            void client.invalidateQueries(['ai-identity-request-log']);
            client.setQueryData(['ai-identity-provisioning', uuid], settings);
            void client.invalidateQueries([
                'ai-identity-provisioning-plan',
                uuid,
            ]);
        },
    });
};

export const useSetupCheck = (settings: AiIdentityProvisioningSettings) => {
    const client = useQueryClient();
    const state = settings.provisioner?.setupCheck;
    const interval = state?.nextCheckAt
        ? getAiIdentitySetupCheckInterval(state.waitingSince)
        : false;
    return useQuery({
        queryKey: ['ai-identity-setup-check', settings.aiIdentityAccountUuid],
        queryFn: () =>
            aiIdentityProvisioningApi.check(settings.aiIdentityAccountUuid),
        enabled: interval !== false,
        refetchInterval: (data) => {
            const check = data?.provisioner?.setupCheck ?? state;
            return check?.nextCheckAt
                ? getAiIdentitySetupCheckInterval(check.waitingSince)
                : false;
        },
        onSuccess: (data) => {
            client.setQueryData(
                ['ai-identity-provisioning', settings.aiIdentityAccountUuid],
                data,
            );
            if (!data.provisioner?.setupCheck?.nextCheckAt)
                void client.invalidateQueries(['ai-identity-request-log']);
        },
    });
};
