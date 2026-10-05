export const shouldShowSnowflakeAiBoundaryGuide = (
    guideEnabled: boolean,
    signInEnabled: boolean,
    canUpdateProject: boolean,
    aiIdentitiesEnabled = false,
): boolean =>
    guideEnabled && (signInEnabled || aiIdentitiesEnabled) && canUpdateProject;
