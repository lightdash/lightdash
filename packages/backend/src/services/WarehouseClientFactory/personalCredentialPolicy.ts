import { FeatureFlags } from '@lightdash/common';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { PersonalCredentialPersistencePolicy } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';

export const resolvePersonalCredentialPolicy = async (
    featureFlagModel: Pick<FeatureFlagModel, 'get'>,
    user: { organizationUuid: string | null; userUuid: string },
): Promise<PersonalCredentialPersistencePolicy> => {
    if (user.organizationUuid === null) return { strictPersonalOverlay: false };
    const { enabled } = await featureFlagModel.get({
        user: { ...user, organizationUuid: user.organizationUuid },
        featureFlagId: FeatureFlags.AgentIdentity,
    });
    return { strictPersonalOverlay: enabled };
};
