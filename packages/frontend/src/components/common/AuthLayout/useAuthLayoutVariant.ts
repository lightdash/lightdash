import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';

export const useAuthLayoutVariant = () => {
    const { data, isInitialLoading } = useServerFeatureFlag(
        FeatureFlags.NewOnboarding,
        { retry: 3 },
    );

    return {
        isNewLayout: data?.enabled ?? false,
        isInitialLoading,
    };
};
