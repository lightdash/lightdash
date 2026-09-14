export const shouldRenderAiAgentsLauncher = ({
    isHidden,
    isMobile,
    isModalHosted,
}: {
    isHidden: boolean;
    isMobile: boolean;
    isModalHosted: boolean;
}) => !isHidden && (!isMobile || isModalHosted);
