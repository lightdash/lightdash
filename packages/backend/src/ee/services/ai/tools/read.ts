import {
    readToolDefinition,
    type ToolReadStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { CodeModeLibraries } from '../../SemanticStudioService/codeMode/codeMode';
import type { ReadFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';

const MAX_OUTPUT_CHARS = 30_000;

type Dependencies = {
    read: ReadFn;
    libraries: CodeModeLibraries;
};

const toolDefinition = readToolDefinition.for('agent');

export const getRead = ({ read, libraries }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({
            script,
        }): Promise<
            | ExecuteStructuredToolResult<ToolReadStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                const { branch, onPullRequest, logs, error } = await read(
                    script,
                    libraries,
                );
                const source = onPullRequest
                    ? `Read the pull request branch ${branch}.`
                    : `Read what is published, on ${branch}; this conversation has no pull request yet.`;
                const printed = logs.join('\n');
                const output =
                    printed.length > MAX_OUTPUT_CHARS
                        ? `${printed.slice(0, MAX_OUTPUT_CHARS)}\n[truncated: print less]`
                        : printed;
                return {
                    result: [
                        source,
                        output || '(the script printed nothing)',
                        ...(error ? [`The script failed: ${error}`] : []),
                    ].join('\n'),
                    metadata: { status: 'success' },
                    structuredContent: { branch, onPullRequest },
                };
            } catch (error) {
                return toolErrorOutput(error, 'Error reading project files.');
            }
        },
    });
