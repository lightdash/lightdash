import { repoShellToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import { ShellError } from '../repoFs/bashShell';
import type { RepoShellFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    repoShell: RepoShellFn;
};

const toolDefinition = repoShellToolDefinition.for('agent');

export const getRepoShell = ({ repoShell }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({ command }) => {
            try {
                const result = await repoShell({ command });
                return {
                    result,
                    metadata: { status: 'success' as const },
                };
            } catch (error) {
                // A ShellError is an expected, agent-recoverable mistake (bad
                // flag, missing file, unsupported command) — surface it to the
                // model and log it, but don't page Sentry. Anything else (e.g. a
                // GitHub access failure) is a real fault worth capturing.
                return {
                    result: toolErrorHandler(
                        error,
                        'Error reading the repository.',
                        { captureToSentry: !(error instanceof ShellError) },
                    ),
                    metadata: { status: 'error' as const },
                };
            }
        },
    });
