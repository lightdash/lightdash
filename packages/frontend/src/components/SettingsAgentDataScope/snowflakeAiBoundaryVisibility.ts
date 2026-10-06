export const shouldShowSnowflakeAiBoundaryGuide = (
    guideEnabled: boolean,
    signInEnabled: boolean,
    canUpdateProject: boolean,
): boolean => guideEnabled && signInEnabled && canUpdateProject;
