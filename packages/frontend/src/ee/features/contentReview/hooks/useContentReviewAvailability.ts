import { CommercialFeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../providers/App/useApp';

// Mirrors the backend gate: the review flag, direct access, and a valid
// license
export const useContentReviewAvailability = () => {
    const { health } = useApp();
    const reviewFlag = useServerFeatureFlag(
        CommercialFeatureFlags.ContentReviewRequests,
    );
    const directAccessFlag = useServerFeatureFlag(
        CommercialFeatureFlags.DirectAccess,
    );
    const licenseValid = health.data?.license?.valid ?? false;
    return {
        isAvailable:
            (reviewFlag.data?.enabled ?? false) &&
            (directAccessFlag.data?.enabled ?? false) &&
            licenseValid,
        isLoading:
            reviewFlag.isInitialLoading ||
            directAccessFlag.isInitialLoading ||
            health.isInitialLoading,
    };
};
