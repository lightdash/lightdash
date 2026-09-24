import {
    FeatureFlags,
    supportsMultipleConnections,
    type RegisteredAccount,
    type WarehouseTypes,
} from '@lightdash/common';
import { type FeatureFlagService } from '../FeatureFlag/FeatureFlagService';
import { type LicenseService } from '../LicenseService/LicenseService';

export const WAREHOUSE_TYPE_REASON =
    'Multiple connections are supported for Postgres and Athena projects only.';
export const ENTITLEMENT_REASON =
    'An extra connection needs the Enterprise multi-connection add-on.';
export const ROLLOUT_REASON =
    'Extra connections are not enabled for this organisation yet.';

export const getMultipleConnectionsBlockReason = async (
    {
        licenseService,
        featureFlagService,
    }: {
        licenseService: Pick<LicenseService, 'canHoldMultipleConnections'>;
        featureFlagService: Pick<FeatureFlagService, 'get'>;
    },
    account: RegisteredAccount,
    project: {
        organizationUuid: string;
        originalWarehouseType: WarehouseTypes | null;
    },
): Promise<string | null> => {
    if (!supportsMultipleConnections(project.originalWarehouseType)) {
        return WAREHOUSE_TYPE_REASON;
    }
    if (!licenseService.canHoldMultipleConnections(project.organizationUuid)) {
        return ENTITLEMENT_REASON;
    }
    const { enabled } = await featureFlagService.get({
        user: {
            userUuid: account.user.userUuid,
            organizationUuid: project.organizationUuid,
        },
        featureFlagId: FeatureFlags.MultiConnectionProjects,
    });
    return enabled ? null : ROLLOUT_REASON;
};
