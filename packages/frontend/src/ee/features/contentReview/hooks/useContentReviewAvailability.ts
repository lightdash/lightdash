import { CommercialFeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../providers/App/useApp';

// Mirrors the backend gate: direct access and a valid license
export const useContentReviewAvailability = () => {
    const { health } = useApp();
    const directAccessFlag = useServerFeatureFlag(
        CommercialFeatureFlags.DirectAccess,
    );
    const licenseValid = health.data?.license?.valid ?? false;
    return {
        isAvailable: (directAccessFlag.data?.enabled ?? false) && licenseValid,
        isLoading: directAccessFlag.isInitialLoading || health.isInitialLoading,
    };
};
