import { CommercialFeatureFlags } from '@lightdash/common';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';

// The one question every pre-aggregate entry point asks. Resolves the
// instance infra gate and the organization's Console override together.
export const isPreAggregatesEnabled = async (
    featureFlagModel: Pick<FeatureFlagModel, 'get'>,
    organizationUuid: string,
): Promise<boolean> => {
    const { enabled } = await featureFlagModel.get({
        user: { organizationUuid },
        featureFlagId: CommercialFeatureFlags.PreAggregates,
    });
    return enabled;
};
