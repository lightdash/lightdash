import {
    generateHashesToolDefinition,
    hashStringToBase36,
    type ToolGenerateHashesStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

const toolDefinition = generateHashesToolDefinition.for('agent');

export const getGenerateHashes = () =>
    tool({
        ...toolDefinition,
        execute: async ({
            inputs,
        }): Promise<
            | ExecuteStructuredToolResult<ToolGenerateHashesStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                const structuredContent = {
                    hashes: inputs.map(hashStringToBase36),
                };
                return {
                    result: JSON.stringify(structuredContent),
                    metadata: { status: 'success' },
                    structuredContent,
                };
            } catch (error) {
                return toolErrorOutput(error, 'Error generating hashes.');
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
