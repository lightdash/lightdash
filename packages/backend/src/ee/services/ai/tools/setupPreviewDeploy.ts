import { setupPreviewDeployToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type { SetupPreviewDeployFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    setupPreviewDeploy: SetupPreviewDeployFn;
};

const toolDefinition = setupPreviewDeployToolDefinition.for('agent');

export const getSetupPreviewDeploy = ({ setupPreviewDeploy }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async () => {
            try {
                const { prUrl, output, projectName, repository } =
                    await setupPreviewDeploy();

                const target = `Lightdash project "${projectName}" (repository ${repository})`;
                const result = prUrl
                    ? `Opened a pull request against ${target} that adds the Lightdash preview-deploy GitHub Actions workflow. A "View pull request" button is shown to the user, so do NOT include the pull request URL or number in your reply. IMPORTANT: relay to the user which GitHub Actions secrets they must add for the workflow to run — they are listed in the agent summary below.\n\nAgent summary:\n${output}`
                    : `The preview-deploy setup ran against ${target} but produced no workflow changes, so no pull request was opened.\n\nAgent summary:\n${output}`;

                return {
                    result,
                    metadata: {
                        status: 'success' as const,
                        prUrl: prUrl ?? null,
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        'Error setting up preview deploys. No pull request was opened.',
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
