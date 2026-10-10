import { FeatureFlags, type LightdashUser } from '@lightdash/common';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';

export type OAuthScopeMode = 'log' | 'enforce';

export const OAUTH_SCOPES = ['read', 'write', 'mcp:read', 'mcp:write'] as const;

export const scopesForOAuthRecord = (scopes: readonly string[]): string[] => [
    ...new Set(
        scopes.map((scope) =>
            OAUTH_SCOPES.some((known) => known === scope) ? scope : 'unknown',
        ),
    ),
];

export const resolveOAuthScopeMode = async (
    featureFlagModel: Pick<FeatureFlagModel, 'get'>,
    user: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>,
): Promise<OAuthScopeMode | null> => {
    const { enabled: agentIdentity } = await featureFlagModel.get({
        featureFlagId: FeatureFlags.AgentIdentity,
        user,
    });
    if (!agentIdentity) return null;
    const { enabled: enforcement } = await featureFlagModel.get({
        featureFlagId: FeatureFlags.OAuthScopeEnforcement,
        user,
    });
    return enforcement ? 'enforce' : 'log';
};
