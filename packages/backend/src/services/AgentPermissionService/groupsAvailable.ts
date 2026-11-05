import { FeatureFlags } from '@lightdash/common';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';

export const areOrganizationGroupsAvailable = async ({
    organizationUuid,
    isLicensed,
    featureFlagModel,
}: {
    organizationUuid: string;
    isLicensed: () => boolean;
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
}): Promise<boolean> =>
    isLicensed() &&
    (
        await featureFlagModel.get({
            user: { organizationUuid },
            featureFlagId: FeatureFlags.UserGroupsEnabled,
        })
    ).enabled;
