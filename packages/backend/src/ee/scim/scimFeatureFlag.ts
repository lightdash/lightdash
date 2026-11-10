import { CommercialFeatureFlags, ForbiddenError } from '@lightdash/common';
import { type FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';

export const SCIM_NOT_ENABLED_MESSAGE =
    'SCIM is not enabled for this organization';

// SCIM is a billing flag, so it resolves per organization only: a user
// override cannot turn it on for one admin.
export const isScimEnabled = async (
    featureFlagService: Pick<FeatureFlagService, 'get'>,
    organizationUuid: string,
): Promise<boolean> => {
    const { enabled } = await featureFlagService.get({
        user: { organizationUuid },
        featureFlagId: CommercialFeatureFlags.Scim,
    });
    return enabled;
};

export const assertScimEnabled = async (
    featureFlagService: Pick<FeatureFlagService, 'get'>,
    organizationUuid: string | undefined,
): Promise<void> => {
    if (
        !organizationUuid ||
        !(await isScimEnabled(featureFlagService, organizationUuid))
    ) {
        throw new ForbiddenError(SCIM_NOT_ENABLED_MESSAGE);
    }
};
