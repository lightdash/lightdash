import { FeatureFlags, MOBILE_ORG_DISABLED_CODE } from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { type FeatureFlagModel } from '../models/FeatureFlagModel/FeatureFlagModel';

export const isMobileAppAccessEnabled = async (
    featureFlagModel: Pick<FeatureFlagModel, 'get'>,
    organizationUuid: string,
): Promise<boolean> => {
    const flag = await featureFlagModel.get({
        user: { organizationUuid },
        featureFlagId: FeatureFlags.MobileAppAccess,
    });
    return flag.enabled;
};

export type MobileOrgDisabledOAuthErrorName = 'invalid_grant' | 'access_denied';

type MobileOrgDisabledOAuthPayload = {
    error: MobileOrgDisabledOAuthErrorName;
    error_description: typeof MOBILE_ORG_DISABLED_CODE;
    organization_uuid: string;
};

export class MobileOrgDisabledOAuthError extends OAuth2Server.OAuthError {
    readonly organizationUuid: string;

    readonly errorName: MobileOrgDisabledOAuthErrorName;

    constructor(
        organizationUuid: string,
        errorName: MobileOrgDisabledOAuthErrorName = 'access_denied',
    ) {
        super(MOBILE_ORG_DISABLED_CODE, {
            code: errorName === 'invalid_grant' ? 400 : 403,
            name: errorName,
        });
        this.organizationUuid = organizationUuid;
        this.errorName = errorName;
    }

    toJSON(): MobileOrgDisabledOAuthPayload {
        return {
            error: this.errorName,
            error_description: MOBILE_ORG_DISABLED_CODE,
            organization_uuid: this.organizationUuid,
        };
    }
}
