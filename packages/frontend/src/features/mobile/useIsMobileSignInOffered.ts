import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useMobilePitchDismissed } from './mobilePitchDismissed';

export const useIsMobileSignInOffered = (): boolean => {
    const { dismissed } = useMobilePitchDismissed();
    const { data: mobileAppAccessFlag } = useServerFeatureFlag(
        FeatureFlags.MobileAppAccess,
    );
    return mobileAppAccessFlag?.enabled === true && !dismissed;
};
