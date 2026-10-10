import { FeatureFlags, ForbiddenError } from '@lightdash/common';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { PersonalCredentialPersistencePolicy } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';

export const resolvePersonalCredentialPolicy = async (
    featureFlagModel: Pick<FeatureFlagModel, 'get'>,
    user: { organizationUuid: string; userUuid: string },
): Promise<PersonalCredentialPersistencePolicy> => {
    if (!user.organizationUuid)
        throw new ForbiddenError(
            'Personal warehouse credentials require an organization.',
        );
    const { enabled } = await featureFlagModel.get({
        user,
        featureFlagId: FeatureFlags.AgentIdentity,
    });
    return { strictPersonalOverlay: enabled };
};
