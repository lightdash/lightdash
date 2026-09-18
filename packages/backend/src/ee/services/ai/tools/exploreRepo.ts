import {
    exploreRepoToolDefinition,
    type ToolExploreRepoStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import { ShellError } from '../repoFs/bashShell';
import type { ExploreRepoFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    exploreRepo: ExploreRepoFn;
};

const toolDefinition = exploreRepoToolDefinition.for('agent');

export const getExploreRepo = ({ exploreRepo }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({
            command,
            target,
        }): Promise<
            | ExecuteStructuredToolResult<ToolExploreRepoStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                const output = await exploreRepo({ command, target });
                return {
                    result: output,
                    metadata: { status: 'success' },
                    structuredContent: { output },
                };
            } catch (error) {
                // A ShellError is an expected, agent-recoverable mistake (bad
                // flag, missing file, unsupported command, malformed target) —
                // surface it to the model and log it, but don't page Sentry.
                // Anything else (e.g. a GitHub access failure) is a real fault
                // worth capturing.
                return toolErrorOutput(error, 'Error reading the repository.', {
                    captureToSentry: !(error instanceof ShellError),
                });
            }
        },
    });
