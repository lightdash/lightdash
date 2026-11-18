type AppViewCaptureInput = {
    flagEnabled: boolean;
    /** The user may use the project's AI agents. */
    canUseAgents: boolean;
    /** The project has an agent to send the questions to. */
    hasAgent: boolean;
    /** A running app is on screen to draw on. */
    hasPreview: boolean;
};

/** Whether the published app page offers a capture to the current user. */
export const canCaptureOnAppView = ({
    flagEnabled,
    canUseAgents,
    hasAgent,
    hasPreview,
}: AppViewCaptureInput): boolean =>
    flagEnabled && canUseAgents && hasAgent && hasPreview;

/**
 * The agent prompt for a capture made on a published app. Without the
 * screenshots only the mark and speech lines are kept, since every other
 * line of the summary refers to the images.
 */
export const buildAppCapturePrompt = ({
    appName,
    summary,
    hasImages,
}: {
    appName: string;
    summary: string;
    hasImages: boolean;
}): string => {
    const body = hasImages
        ? summary
        : summary
              .split('\n')
              .filter((line) => line.startsWith('- '))
              .join('\n');
    return `These questions are about the data app "${appName}".\n\n${body}`;
};
