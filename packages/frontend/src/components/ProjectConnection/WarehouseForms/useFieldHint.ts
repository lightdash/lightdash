import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';

// The new onboarding drops boilerplate field descriptions; remove this with the flag
export const useFieldHint = () => {
    const isNewOnboarding =
        useServerFeatureFlag(FeatureFlags.NewOnboarding).data?.enabled === true;
    return (text: string) => (isNewOnboarding ? undefined : text);
};
