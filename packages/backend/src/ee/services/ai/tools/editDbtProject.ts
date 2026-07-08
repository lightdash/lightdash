import { editDbtProjectToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type { EditDbtProjectFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    editDbtProject: EditDbtProjectFn;
};

const toolDefinition = editDbtProjectToolDefinition.for('agent');

/**
 * SPK-548: this tool call only enqueues the writeback run and returns
 * immediately (status 'pending') — it does not wait for the sandbox/PR to
 * finish, so the model's turn ends without the connection being held open
 * for however long the run takes. AiAgentService.runEditDbtProjectPipeline
 * does the actual work (including every side effect that used to happen
 * inline here: remediation tracking, the Slack reaction, preview-deploy
 * check, PR preview creation) and rewrites this tool call's stored metadata
 * once it reaches a terminal state — see updateToolResult.
 */
export const getEditDbtProject = ({ editDbtProject }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (
            {
                prompt,
                prUrl: pastedPrUrl,
                fromActiveChangeset,
                startNewPullRequest,
            },
            { toolCallId },
        ) => {
            try {
                const { aiWritebackRunUuid } = await editDbtProject({
                    prompt,
                    prUrl: pastedPrUrl,
                    fromActiveChangeset,
                    startNewPullRequest,
                    progressId: toolCallId,
                });

                return {
                    result: 'Started the change. Give a brief one-line acknowledgement.',
                    metadata: {
                        status: 'pending' as const,
                        aiWritebackRunUuid,
                    },
                };
            } catch (error) {
                // Only enqueue-time failures land here now (e.g. no active
                // changeset, or a missing prompt) — everything that used to
                // fail once the sandbox/PR actually ran (git connection,
                // permissions, closed PR) now surfaces asynchronously, via
                // runEditDbtProjectPipeline's own error classification.
                return {
                    result: toolErrorHandler(
                        error,
                        'Error starting AI writeback. No pull request was opened.',
                    ),
                    metadata: {
                        status: 'error' as const,
                        errorCode: 'unknown' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
