import {
    editDbtProjectToolDefinition,
    type ToolEditDbtProjectOutput,
    type ToolEditDbtProjectStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { EditDbtProjectFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    editDbtProject: EditDbtProjectFn;
};

type EditDbtProjectMetadata = ToolEditDbtProjectOutput['metadata'];

type PendingResult = ExecuteStructuredToolResult<
    ToolEditDbtProjectStructuredContent,
    Extract<EditDbtProjectMetadata, { status: 'pending' }>
>;

type ErrorResult = ExecuteToolErrorResult<
    Extract<EditDbtProjectMetadata, { status: 'error' }>
>;

const toolDefinition = editDbtProjectToolDefinition.for('agent');

export const getEditDbtProject = ({ editDbtProject }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (
            { prompt, prUrl: pastedPrUrl, startNewPullRequest },
            { toolCallId },
        ): Promise<PendingResult | ErrorResult> => {
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
                        status: 'pending',
                        aiWritebackRunUuid,
                    },
                    structuredContent: { status: 'pending' },
                };
            } catch (error) {
                const errorOutput = toolErrorOutput(
                    error,
                    'Error starting AI writeback. No pull request was opened.',
                );
                return {
                    ...errorOutput,
                    metadata: { ...errorOutput.metadata, errorCode: 'unknown' },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
