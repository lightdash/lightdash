import { exploreRepoToolDefinition } from '@lightdash/common';
import { ShellError } from '../repoFs/bashShell';
import type { ExploreRepoFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    exploreRepo: ExploreRepoFn;
};

const toolDefinition = exploreRepoToolDefinition.for('ai-sdk');

export const getExploreRepo = ({ exploreRepo }: Dependencies) =>
    toolDefinition.build({
        execute: async ({ command, target }) => {
            try {
                const result = await exploreRepo({ command, target });
                return {
                    status: 'success' as const,
                    type: 'string' as const,
                    result,
                    metadata: { status: 'success' as const },
                };
            } catch (error) {
                // A ShellError is an expected, agent-recoverable mistake (bad
                // flag, missing file, unsupported command, malformed target) —
                // surface it to the model and log it, but don't page Sentry.
                // Anything else (e.g. a GitHub access failure) is a real fault
                // worth capturing.
                return {
                    status: 'error' as const,
                    error: toolErrorHandler(
                        error,
                        'Error reading the repository.',
                        { captureToSentry: !(error instanceof ShellError) },
                    ),
                    metadata: { status: 'error' as const },
                };
            }
        },
    });
