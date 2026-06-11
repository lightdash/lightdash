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
                const { prUrl, projectName, repository, secrets } =
                    await setupPreviewDeploy();

                // Render concrete secret values server-side. Values we know
                // (LIGHTDASH_URL, LIGHTDASH_PROJECT) are pre-filled; the agent
                // is told to present them verbatim rather than generalise them.
                const secretsList = secrets
                    .map((s) =>
                        s.value !== null
                            ? `- ${s.name} = \`${s.value}\` (pre-filled — show this exact value) — ${s.description}`
                            : `- ${s.name} — ${s.description} (the user must provide this)`,
                    )
                    .join('\n');

                const target = `Lightdash project "${projectName}" (repository ${repository})`;
                const result = `Opened a pull request against ${target} that adds the Lightdash preview-deploy GitHub Actions workflow. A "View pull request" button is shown to the user, so do NOT include the pull request URL or number in your reply. IMPORTANT: tell the user which GitHub Actions secrets to add, presenting the pre-filled values EXACTLY as given below (do not replace them with generic descriptions):\n\n${secretsList}`;

                return {
                    result,
                    metadata: {
                        status: 'success' as const,
                        prUrl,
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
