import { LightdashMode, LightdashUser } from '@lightdash/common';
import { lightdashConfig } from '../config/lightdashConfig';
import { LightdashAnalytics } from './LightdashAnalytics';

export const analytics: LightdashAnalytics = new LightdashAnalytics(
    lightdashConfig.rudder.writeKey || 'notrack',
    lightdashConfig.rudder.dataPlaneUrl
        ? `${lightdashConfig.rudder.dataPlaneUrl}/v1/batch`
        : 'notrack',
    {
        enable:
            lightdashConfig.rudder.writeKey &&
            lightdashConfig.rudder.dataPlaneUrl,
    },
);

export const identifyUser = (
    user: LightdashUser & { isMarketingOptedIn?: boolean },
): void => {
    if (lightdashConfig.mode === LightdashMode.DEMO) {
        return;
    }
    analytics.identify({
        userId: user.userUuid,
        traits: user.isTrackingAnonymized
            ? { is_tracking_anonymized: user.isTrackingAnonymized }
            : {
                  email: user.email,
                  first_name: user.firstName,
                  last_name: user.lastName,
                  is_tracking_anonymized: user.isTrackingAnonymized,
                  is_marketing_opted_in: user.isMarketingOptedIn,
              },
    });
    if (user.organizationUuid) {
        analytics.group({
            userId: user.userUuid,
            groupId: user.organizationUuid,
            traits: {
                name: user.organizationName,
            },
        });
    }
};
