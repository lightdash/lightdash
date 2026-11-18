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

export type MobileGrant = { userId: number; clientId: string };

export class MobileOrgDisabledOAuthError extends OAuth2Server.OAuthError {
    readonly organizationUuid: string;

    readonly errorName: MobileOrgDisabledOAuthErrorName;

    readonly grant: MobileGrant | null;

    constructor(
        organizationUuid: string,
        errorName: MobileOrgDisabledOAuthErrorName,
        grant: MobileGrant | null,
    ) {
        super(MOBILE_ORG_DISABLED_CODE, {
            code: errorName === 'invalid_grant' ? 400 : 403,
            name: errorName,
        });
        this.organizationUuid = organizationUuid;
        this.errorName = errorName;
        this.grant = grant;
    }

    toJSON(): MobileOrgDisabledOAuthPayload {
        return {
            error: this.errorName,
            error_description: MOBILE_ORG_DISABLED_CODE,
            organization_uuid: this.organizationUuid,
        };
    }
}
