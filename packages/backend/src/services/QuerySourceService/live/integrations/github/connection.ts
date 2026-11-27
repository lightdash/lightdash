import {
    ApiConnectorType,
    getGithubContributorsPath,
    GITHUB_ORIGIN,
    GITHUB_SEARCH_PATH,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
} from '@lightdash/common';
import { z } from 'zod';
import {
    formatTestCount,
    readRule,
    type LiveConnection,
    type LiveTestSummary,
} from '../../sdk';

// The setup test searches the repository's pull requests
const testResponseSchema = z.object({ total_count: z.number() });

export const summarizeGithubTest = (
    body: unknown,
    { owner, repo }: { owner: string; repo: string },
): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    return {
        summary: `Connected to ${owner}/${repo}`,
        facts: [
            {
                label: 'Pull requests',
                value: formatTestCount(parsed.data.total_count),
            },
        ],
    };
};

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.GITHUB];
// GitHub's own rules for user, organization and repository names
const GITHUB_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const GITHUB_REPO = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/;

export const githubConnection: LiveConnection<ApiConnectorType.GITHUB> = {
    settings: CATALOG.settings,
    origins: [GITHUB_ORIGIN],
    // Search reads any repository the token can, but every request names
    // this one; see toGithubSearchQuery.
    access: ({ owner, repo }) => ({
        rules: [
            readRule('GET', GITHUB_SEARCH_PATH),
            readRule('GET', getGithubContributorsPath(owner, repo)),
        ],
        headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'Lightdash',
        },
    }),
    checkAuth: ({ type }) => {
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'GitHub connections authenticate with a personal access token',
            );
        }
    },
    validate: ({ owner, repo }) => {
        if (!GITHUB_OWNER.test(owner)) {
            throw new ParameterError(
                'The GitHub owner must be a user or organization name, like lightdash',
            );
        }
        if (!GITHUB_REPO.test(repo)) {
            throw new ParameterError(
                'The GitHub repository must be its name without the owner, like lightdash',
            );
        }
    },
    describeTarget: ({ settings: { owner, repo } }) =>
        `GitHub repository ${owner}/${repo}`,
    summarizeTest: summarizeGithubTest,
};
