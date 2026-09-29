import {
    discoverReposToolDefinition,
    type ToolDiscoverReposStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { DiscoverReposFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    discoverRepos: DiscoverReposFn;
};

const toolDefinition = discoverReposToolDefinition.for('agent');

const renderRepos = (
    repos: ToolDiscoverReposStructuredContent['repos'],
): string => {
    if (repos.length === 0) {
        return "No repositories are accessible to this organization's GitHub App installation.";
    }

    return [
        `${repos.length} repositor${
            repos.length === 1 ? 'y is' : 'ies are'
        } accessible. Pass "owner/repo" as the exploreRepo \`target\` to read one:`,
        ...repos.map(
            (r) =>
                `• ${r.owner}/${r.repo} (default branch: ${r.defaultBranch}${
                    r.private ? ', private' : ''
                })`,
        ),
    ].join('\n');
};

export const getDiscoverRepos = ({ discoverRepos }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (): Promise<
            | ExecuteStructuredToolResult<ToolDiscoverReposStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                const repos = (await discoverRepos()).map(
                    ({ owner, repo, defaultBranch, private: isPrivate }) => ({
                        owner,
                        repo,
                        defaultBranch,
                        private: isPrivate,
                    }),
                );

                return {
                    result: renderRepos(repos),
                    metadata: { status: 'success' },
                    structuredContent: { repos },
                };
            } catch (error) {
                return toolErrorOutput(
                    error,
                    'Error discovering repositories.',
                );
            }
        },
    });
