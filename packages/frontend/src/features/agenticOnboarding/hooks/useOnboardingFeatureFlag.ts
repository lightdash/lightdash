import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';

export const useOnboardingFeatureFlag = () => {
    const query = useServerFeatureFlag(FeatureFlags.AgenticOnboarding);
    return {
        isEnabled: query.data?.enabled ?? false,
        isLoading: query.isInitialLoading,
    };
};
