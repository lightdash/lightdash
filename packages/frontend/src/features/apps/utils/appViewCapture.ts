import { buildAgentPrompt } from '../../../ee/features/capture/buildAgentPrompt';
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

/** The agent prompt for a capture made on a published app. */
export const buildAppCapturePrompt = ({
    appName,
    summary,
    hasImages,
}: {
    appName: string;
    summary: string;
    hasImages: boolean;
}): string =>
    buildAgentPrompt({
        heading: `These questions are about the data app "${appName}".`,
        summary,
        hasImages,
    });
