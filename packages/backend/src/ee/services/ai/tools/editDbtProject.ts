import { editDbtProjectToolDefinition } from '@lightdash/common';
import type { EditDbtProjectFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    editDbtProject: EditDbtProjectFn;
};

const toolDefinition = editDbtProjectToolDefinition.for('ai-sdk');

export const getEditDbtProject = ({ editDbtProject }: Dependencies) =>
    toolDefinition.build({
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
                    status: 'success' as const,
                    type: 'string' as const,
                    result: 'Started the change. Give a brief one-line acknowledgement.',
                    metadata: {
                        status: 'pending' as const,
                        aiWritebackRunUuid,
                    },
                };
            } catch (error) {
                return {
                    status: 'error' as const,
                    error: toolErrorHandler(
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
    });
