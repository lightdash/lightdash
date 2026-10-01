export const getNoProjectLandingPath = ({
    isNewOnboardingEnabled,
    isHomepageBuilderEnabled,
}: {
    isNewOnboardingEnabled: boolean;
    isHomepageBuilderEnabled: boolean;
}): '/onboarding/data-source' | '/get-started' | '/createProject' => {
    if (isNewOnboardingEnabled && isHomepageBuilderEnabled) {
        return '/get-started';
    }
    return isNewOnboardingEnabled
        ? '/onboarding/data-source'
        : '/createProject';
};
