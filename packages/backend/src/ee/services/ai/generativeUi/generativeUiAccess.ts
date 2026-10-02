import { ForbiddenError } from '@lightdash/common';

/**
 * Generative UI needs AI Copilot and the ai-agent-generative-ui flag; every
 * entry point checks both before doing anything else.
 */
export const assertGenerativeUiAvailable = async ({
    isCopilotEnabled,
    isGenerativeUiEnabled,
}: {
    isCopilotEnabled: () => Promise<boolean>;
    isGenerativeUiEnabled: () => Promise<boolean>;
}): Promise<void> => {
    if (!(await isCopilotEnabled())) {
        throw new ForbiddenError('Copilot is not enabled');
    }
    if (!(await isGenerativeUiEnabled())) {
        throw new ForbiddenError('Generative UI is not enabled');
    }
};
