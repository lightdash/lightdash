import {
    AGENT_CONNECTION_GRANT_CONTRACT_VERSION,
    FeatureFlags,
    type AgentConnectionGrant,
    type LightdashUser,
} from '@lightdash/common';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';

export const agentConnectionGrantEnabled = async (
    featureFlags: Pick<FeatureFlagModel, 'get'>,
    user: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>,
): Promise<boolean> => {
    const subject = await featureFlags.get({
        featureFlagId: FeatureFlags.AgentIdentity,
        user,
    });
    const organization = await featureFlags.get({
        featureFlagId: FeatureFlags.AgentIdentity,
        user: { organizationUuid: user.organizationUuid },
    });
    return subject.enabled && organization.enabled;
};

export const matchesOAuthGrantBinding = (
    grant: AgentConnectionGrant,
    binding: {
        subjectUserUuid: string;
        organizationUuid: string;
        clientId: string;
        resource: string | null;
        familyUuid: string | null;
    },
): boolean =>
    grant.grantContractVersion === AGENT_CONNECTION_GRANT_CONTRACT_VERSION &&
    grant.resourceConstraints.version === 1 &&
    grant.subjectUserUuid === binding.subjectUserUuid &&
    grant.organizationUuid === binding.organizationUuid &&
    grant.clientId === binding.clientId &&
    grant.resource === binding.resource &&
    grant.refreshFamilyUuid === binding.familyUuid;
