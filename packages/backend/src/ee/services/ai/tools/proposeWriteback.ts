import { proposeWritebackToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type { ProposeWritebackFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    proposeWriteback: ProposeWritebackFn;
};

const toolDefinition = proposeWritebackToolDefinition.for('agent');

export const getProposeWriteback = ({ proposeWriteback }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({ prompt, prUrl: pastedPrUrl }) => {
            try {
                const {
                    prUrl,
                    output,
                    projectName,
                    repository,
                    previewDeployConfigured,
                } = await proposeWriteback({ prompt, prUrl: pastedPrUrl });

                // Surface which Lightdash project + repo were used so the
                // assistant can report it back and the user can catch a wrong
                // target. The PR URL is intentionally omitted here and exposed
                // only via the "View pull request" button (built from the
                // metadata below) — see the instruction in the success branch.
                const target = `Lightdash project "${projectName}" (repository ${repository})`;
                const base = prUrl
                    ? `Opened a pull request against ${target}. A "View pull request" button is shown to the user, so do NOT include the pull request URL or number in your reply — just summarise the change and which project/repository it targeted.\n\nAgent summary:\n${output}`
                    : `The writeback agent ran against ${target} but made no file changes, so no pull request was opened.\n\nAgent summary:\n${output}`;

                // Deterministic offer: when the repo has no Lightdash
                // preview-deploy GitHub Actions, instruct the assistant to
                // offer setting it up. This must be relayed reliably rather
                // than left to the agent to infer from the sandbox output.
                const result =
                    previewDeployConfigured === false
                        ? `${base}\n\nIMPORTANT — also tell the user: this project does NOT have Lightdash preview deploys set up via GitHub Actions. Offer to set it up by opening a pull request that adds the preview workflow (a preview Lightdash project per PR, torn down on close). If they agree, call the \`setupPreviewDeploy\` tool. Do not call it unless they say yes.`
                        : base;

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
                        'Error running AI writeback. No pull request was opened.',
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
