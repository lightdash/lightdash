import { discoverReposToolDefinition } from '@lightdash/common';
import type { DiscoverReposFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    discoverRepos: DiscoverReposFn;
};

const toolDefinition = discoverReposToolDefinition.for('ai-sdk');

export const getDiscoverRepos = ({ discoverRepos }: Dependencies) =>
    toolDefinition.build({
        execute: async () => {
            try {
                const repos = await discoverRepos();

                if (repos.length === 0) {
                    return {
                        status: 'success' as const,
                        type: 'string' as const,
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
                    status: 'success' as const,
                    type: 'string' as const,
                    result: lines.join('\n'),
                    metadata: { status: 'success' as const },
                };
            } catch (error) {
                return {
                    status: 'error' as const,
                    error: toolErrorHandler(
                        error,
                        'Error discovering repositories.',
                    ),
                    metadata: { status: 'error' as const },
                };
            }
        },
    });
