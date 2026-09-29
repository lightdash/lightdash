import {
    generateUuidsToolDefinition,
    type ToolGenerateUuidsStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

const toolDefinition = generateUuidsToolDefinition.for('agent');

export const getGenerateUuids = () =>
    tool({
        ...toolDefinition,
        execute: async ({
            count,
        }): Promise<
            | ExecuteStructuredToolResult<ToolGenerateUuidsStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                const structuredContent: ToolGenerateUuidsStructuredContent = {
                    uuids: Array.from({ length: count }, () =>
                        crypto.randomUUID(),
                    ),
                };
                return {
                    result: JSON.stringify(structuredContent),
                    metadata: { status: 'success' },
                    structuredContent,
                };
            } catch (error) {
                return toolErrorOutput(error, 'Error generating UUIDs.');
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
