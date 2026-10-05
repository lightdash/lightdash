export const shouldShowAiAccessRestrictions = (
    flagEnabled: boolean,
    canUpdateProject: boolean,
): boolean => flagEnabled && canUpdateProject;
