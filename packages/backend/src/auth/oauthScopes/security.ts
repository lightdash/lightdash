import { FeatureFlags, type LightdashUser } from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';

export const resolveOAuthSecurityStrict = async (
    featureFlagModel: Pick<FeatureFlagModel, 'get'>,
    user: Pick<LightdashUser, 'userUuid' | 'organizationUuid'> | null,
): Promise<boolean> => {
    const flag = await featureFlagModel.get({
        featureFlagId: FeatureFlags.AgentIdentity,
        user: user ?? undefined,
    });
    return flag.enabled;
};

export class OAuthBearerRefusalError extends OAuth2Server.InvalidTokenError {
    constructor() {
        super('Bearer tokens must use the Authorization header');
    }
}
