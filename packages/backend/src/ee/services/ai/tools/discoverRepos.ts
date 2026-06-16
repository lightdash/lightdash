import { discoverReposToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type { DiscoverReposFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    discoverRepos: DiscoverReposFn;
};

const toolDefinition = discoverReposToolDefinition.for('agent');

export const getDiscoverRepos = ({ discoverRepos }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async () => {
            try {
                const repos = await discoverRepos();

                if (repos.length === 0) {
                    return {
                        result: "No repositories are accessible to this organization's GitHub App installation.",
                        metadata: { status: 'success' as const },
                    };
                }

                const lines = [
                    `${repos.length} repositor${
                        repos.length === 1 ? 'y is' : 'ies are'
                    } accessible. Pass "owner/repo" as the exploreRepo \`target\` to read one:`,
                    ...repos.map(
                        (r) =>
                            `• ${r.owner}/${r.repo} (default branch: ${
                                r.defaultBranch
                            }${r.private ? ', private' : ''})`,
                    ),
                ];

                return {
                    result: lines.join('\n'),
                    metadata: { status: 'success' as const },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        'Error discovering repositories.',
                    ),
                    metadata: { status: 'error' as const },
                };
            }
        },
    });
