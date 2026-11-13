import { FeatureFlags } from '@lightdash/common';
import { type Request } from 'express';

const BIGQUERY_OAUTH_SCOPES = [
    'profile',
    'email',
    'https://www.googleapis.com/auth/bigquery',
];

export const GOOGLE_DRIVE_READONLY_SCOPE =
    'https://www.googleapis.com/auth/drive.readonly';

export const getBigqueryOAuthScopes = async (
    req: Pick<Request, 'user' | 'services'>,
): Promise<string[]> => {
    const organizationUuid = req.user?.organizationUuid;
    if (!req.user || !organizationUuid) {
        return BIGQUERY_OAUTH_SCOPES;
    }
    const { enabled } = await req.services.getFeatureFlagService().get({
        user: { organizationUuid, userUuid: req.user.userUuid },
        featureFlagId: FeatureFlags.BigqueryOAuthDriveAccess,
    });
    return enabled
        ? [...BIGQUERY_OAUTH_SCOPES, GOOGLE_DRIVE_READONLY_SCOPE]
        : BIGQUERY_OAUTH_SCOPES;
};
