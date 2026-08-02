import { editDbtProjectToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type { EditDbtProjectFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    editDbtProject: EditDbtProjectFn;
};

const toolDefinition = editDbtProjectToolDefinition.for('agent');

export const getEditDbtProject = ({ editDbtProject }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (
            { prompt, prUrl: pastedPrUrl, startNewPullRequest },
            { toolCallId },
        ) => {
            try {
                const { aiWritebackRunUuid } = await editDbtProject({
                    prompt,
                    prUrl: pastedPrUrl,
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
