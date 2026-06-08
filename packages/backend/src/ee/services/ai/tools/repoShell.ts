import { repoShellToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
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
                return {
                    result: toolErrorHandler(
                        error,
                        'Error reading the repository.',
                    ),
                    metadata: { status: 'error' as const },
                };
            }
        },
    });
