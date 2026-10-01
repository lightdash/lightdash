import { subject } from '@casl/ability';
import { FeatureFlags, ProjectType } from '@lightdash/common';
import { useHomepageBuilderFlag } from '../ee/features/homepageBuilder/hooks/useProjectHomepage';
import useApp from '../providers/App/useApp';
import { getNoProjectLandingPath } from '../utils/noProjectLanding';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

export const useNoProjectLanding = () => {
    const { user } = useApp();
    const homepageBuilderFlag = useHomepageBuilderFlag();
    const newOnboardingFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);

    const isLoading =
        homepageBuilderFlag.isLoading ||
        newOnboardingFlag.isLoading ||
        user.isInitialLoading;

    const canCreateProject =
        user.data?.ability.can(
            'create',
            subject('Project', {
                organizationUuid: user.data.organizationUuid,
                type: ProjectType.DEFAULT,
            }),
        ) ?? false;

    return {
        isLoading,
        pathname: canCreateProject
            ? getNoProjectLandingPath({
                  isNewOnboardingEnabled:
                      newOnboardingFlag.data?.enabled ?? false,
                  isHomepageBuilderEnabled: homepageBuilderFlag.isEnabled,
              })
            : null,
    };
};
