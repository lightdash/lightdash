import {
    FeatureFlags,
    type ApiError,
    type SharedCredentialOwner,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

export const useIsSharedSignInOwnershipEnabled = () => {
    const flag = useServerFeatureFlag(FeatureFlags.SharedSignInOwnership);
    return flag.data?.enabled === true;
};

export const useSharedCredentialOwner = (projectUuid: string | undefined) => {
    const isEnabled = useIsSharedSignInOwnershipEnabled();
    return useQuery<SharedCredentialOwner | null, ApiError>({
        queryKey: ['shared_credential_owner', projectUuid],
        queryFn: () =>
            lightdashApi<SharedCredentialOwner | null>({
                url: `/projects/${projectUuid}/warehouse-credentials/owner`,
                method: 'GET',
                body: undefined,
            }),
        enabled: isEnabled && !!projectUuid,
    });
};
