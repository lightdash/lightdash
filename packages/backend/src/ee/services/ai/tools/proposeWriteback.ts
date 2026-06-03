import { proposeWritebackToolDefinition } from '@lightdash/ai';
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
        execute: async ({ prompt }) => {
            try {
                const { prUrl, output, projectName, repository } =
                    await proposeWriteback({ prompt });

                // Surface which Lightdash project + repo were used so the
                // assistant can report it back and the user can catch a wrong
                // target. The PR URL is intentionally omitted here and exposed
                // only via the "View pull request" button (built from the
                // metadata below) — see the instruction in the success branch.
                const target = `Lightdash project "${projectName}" (repository ${repository})`;
                const result = prUrl
                    ? `Opened a pull request against ${target}. A "View pull request" button is shown to the user, so do NOT include the pull request URL or number in your reply — just summarise the change and which project/repository it targeted.\n\nAgent summary:\n${output}`
                    : `The writeback agent ran against ${target} but made no file changes, so no pull request was opened.\n\nAgent summary:\n${output}`;

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
