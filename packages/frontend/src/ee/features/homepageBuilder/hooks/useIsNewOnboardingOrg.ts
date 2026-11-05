import { FeatureFlags } from '@lightdash/common';
import { useOrganization } from '../../../../hooks/organization/useOrganization';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';

const NEW_ORG_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

// Orgs created within the window under the new onboarding flag get the day-0 setup experience
export const useIsNewOnboardingOrg = () => {
    const flag = useServerFeatureFlag(FeatureFlags.NewOnboarding);
    const isFlagEnabled = flag.data?.enabled === true;
    const organization = useOrganization({ enabled: isFlagEnabled });
    const createdAt = organization.data?.createdAt;
    return {
        isNewOrg:
            isFlagEnabled &&
            !!createdAt &&
            Date.now() - new Date(createdAt).getTime() < NEW_ORG_WINDOW_MS,
        isLoading:
            flag.isInitialLoading ||
            (isFlagEnabled && organization.isInitialLoading),
    };
};
