import { LightdashMode } from '@lightdash/common';
import useHealth from '../../hooks/health/useHealth';

export const useCloudMobileSetup = () => {
    const { data: health } = useHealth();

    if (!health) return null;

    return health.mode === LightdashMode.CLOUD_BETA;
};
