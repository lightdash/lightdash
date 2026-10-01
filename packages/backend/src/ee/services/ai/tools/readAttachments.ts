import {
    readAttachmentsToolDefinition,
    type ToolReadAttachmentsStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import { ShellError } from '../repoFs/bashShell';
import type { ReadAttachmentsFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    readAttachments: ReadAttachmentsFn;
};

const toolDefinition = readAttachmentsToolDefinition.for('agent');

export const getReadAttachments = ({ readAttachments }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({
            command,
        }): Promise<
            | ExecuteStructuredToolResult<ToolReadAttachmentsStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                const output = await readAttachments({ command });
                return {
                    result: output,
                    metadata: { status: 'success' },
                    structuredContent: { output },
                };
            } catch (error) {
                return toolErrorOutput(
                    error,
                    'Error reading the attached documents.',
                    { captureToSentry: !(error instanceof ShellError) },
                );
            }
        },
    });
