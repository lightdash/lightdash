import {
    FeatureFlags,
    type ApiError,
    type WarehouseCredentialSummary,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

export const useIsSharedSignInOwnershipEnabled = () => {
    const flag = useServerFeatureFlag(FeatureFlags.SharedSignInOwnership);
    return flag.data?.enabled === true;
};

export const useWarehouseCredentialSummary = (
    projectUuid: string | undefined,
) => {
    const isEnabled = useIsSharedSignInOwnershipEnabled();
    return useQuery<WarehouseCredentialSummary, ApiError>(
        ['warehouse_credential_summary', projectUuid],
        () =>
            lightdashApi<WarehouseCredentialSummary>({
                url: `/projects/${projectUuid}/warehouse-credentials/summary`,
                method: 'GET',
                body: undefined,
            }),
        { enabled: isEnabled && !!projectUuid },
    );
};
