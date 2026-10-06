import {
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
