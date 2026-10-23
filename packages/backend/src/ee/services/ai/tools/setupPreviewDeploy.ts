import {
    setupPreviewDeployToolDefinition,
    type ToolSetupPreviewDeployStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { SetupPreviewDeployFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    setupPreviewDeploy: SetupPreviewDeployFn;
};

type SetupPreviewDeployResult =
    | ExecuteStructuredToolResult<
          ToolSetupPreviewDeployStructuredContent,
          { status: 'success'; prUrl: string }
      >
    | ExecuteToolErrorResult;

const toolDefinition = setupPreviewDeployToolDefinition.for('agent');

export const getSetupPreviewDeploy = ({ setupPreviewDeploy }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (): Promise<SetupPreviewDeployResult> => {
            try {
                const setup = await setupPreviewDeploy();
                const { prUrl, projectName, repository, secrets } = setup;

                // Render concrete secret values server-side. Values we know
                // (LIGHTDASH_URL, LIGHTDASH_PROJECT) are pre-filled; the agent
                // is told to present them verbatim rather than generalise them.
                const secretsList = secrets
                    .map((s) =>
                        s.value !== null
                            ? `- ${s.name} = \`${s.value}\` (pre-filled) — ${s.description}`
                            : `- ${s.name} — ${s.description} (the user must provide this)`,
                    )
                    .join('\n');

                const target = `Lightdash project "${projectName}" (repository ${repository})`;
                const result = `Opened a pull request against ${target} that adds the Lightdash preview-deploy GitHub Actions workflow. The user sees a "View pull request" button, so leave the pull request URL and number out of your reply. Tell the user to add these GitHub Actions secrets to the repository, copying each pre-filled value exactly as given rather than describing it:\n\n${secretsList}`;

                return {
                    result,
                    metadata: {
                        status: 'success',
                        prUrl,
                    },
                    structuredContent: { projectName, repository, secrets },
                };
            } catch (error) {
                return toolErrorOutput(
                    error,
                    'Error setting up preview deploys. No pull request was opened.',
                );
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
