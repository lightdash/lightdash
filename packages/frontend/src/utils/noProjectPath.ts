/** Where an organization without projects lands, for users who can create one */
export const getNoProjectPath = ({
    isNewOnboardingEnabled,
    isHomepageBuilderEnabled,
}: {
    isNewOnboardingEnabled: boolean;
    isHomepageBuilderEnabled: boolean;
}) => {
    if (!isNewOnboardingEnabled) return '/createProject';
    return isHomepageBuilderEnabled
        ? '/get-started'
        : '/onboarding/data-source';
};
