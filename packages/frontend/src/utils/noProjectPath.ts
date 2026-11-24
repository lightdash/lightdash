/** Where an organization without projects lands, for users who can create one */
export const getNoProjectPath = ({
    isHomepageBuilderEnabled,
}: {
    isHomepageBuilderEnabled: boolean;
}) => {
    return isHomepageBuilderEnabled
        ? '/get-started'
        : '/onboarding/data-source';
};
