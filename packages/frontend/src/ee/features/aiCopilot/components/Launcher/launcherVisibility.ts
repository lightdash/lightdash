export const shouldRenderAiAgentsLauncher = ({
    isHidden,
    isMobile,
    isModalHosted,
}: {
    isHidden: boolean;
    isMobile: boolean;
    isModalHosted: boolean;
}) => !isHidden && (!isMobile || isModalHosted);

export const shouldRenderAiAgentsLauncherContent = ({
    dockItemCount,
    hasSelectedAgent,
    isAllowed,
    isContentPage,
    isModalHosted,
    isPanelOpen,
}: {
    dockItemCount: number;
    hasSelectedAgent: boolean;
    isAllowed: boolean;
    isContentPage: boolean;
    isModalHosted: boolean;
    isPanelOpen: boolean;
}) =>
    isAllowed &&
    (isPanelOpen ||
        dockItemCount > 0 ||
        (!isModalHosted && isContentPage && hasSelectedAgent));
