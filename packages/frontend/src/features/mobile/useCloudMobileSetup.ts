import { FeatureFlags, LightdashMode } from '@lightdash/common';
import useHealth from '../../hooks/health/useHealth';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';

export const useCloudMobileSetup = () => {
    const { data: health } = useHealth();
    const { data: qrSignInFlag, isError } = useServerFeatureFlag(
        FeatureFlags.MobileQrSignIn,
    );

    if (!health) return null;
    if (isError) return false;
    if (health.mode === LightdashMode.CLOUD_BETA && !qrSignInFlag) return null;

    return (
        health.mode === LightdashMode.CLOUD_BETA &&
        qrSignInFlag?.enabled === true
    );
};
