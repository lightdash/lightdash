import {
    ApiConnectorType,
    getGithubContributorsPath,
    GITHUB_ORIGIN,
    GITHUB_SEARCH_PATH,
} from '@lightdash/common';
import { type TokenLiveSourceForm } from './tokenLiveSource';

// owner/repo, as GitHub names them
const REPOSITORY =
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/;

const splitRepository = (repository: string) => {
    const [owner, repo] = repository.split('/');
    return { owner, repo };
};

export const GITHUB_TOKEN_FORM = {
    label: 'GitHub',
    defaultName: 'GitHub',
    description:
        'AI agents read pull requests, issues and contributors of one repository live. Use a fine-grained personal access token with read access to Metadata, Issues and Pull requests for that repository.',
    origin: GITHUB_ORIGIN,
    account: {
        label: 'Repository',
        description: 'The owner and name, as in github.com/owner/name',
        placeholder: 'lightdash/lightdash',
        invalidMessage: 'Enter the repository as owner/name',
        // Accept a pasted repository URL
        normalize: (value) =>
            value
                .trim()
                .replace(/^https?:\/\/github\.com\//i, '')
                .replace(/\.git$/i, '')
                .replace(/\/+$/, ''),
        isValid: (value) => REPOSITORY.test(value),
    },
    tokenLabel: 'Personal access token',
    toApiSource: (repository) => ({
        connector: ApiConnectorType.GITHUB,
        ...splitRepository(repository),
    }),
    getAccountId: ({ apiSource }) =>
        apiSource?.connector === ApiConnectorType.GITHUB
            ? `${apiSource.owner}/${apiSource.repo}`
            : '',
    getAccess: (repository) => {
        const { owner, repo } = splitRepository(repository);
        return {
            allowedMethods: ['GET'],
            allowedPathPrefixes: [
                GITHUB_SEARCH_PATH,
                getGithubContributorsPath(owner, repo),
            ],
            allowedContentTypes: ['application/json'],
        };
    },
    getTestRequest: (repository) => ({
        method: 'GET',
        path: GITHUB_SEARCH_PATH,
        query: { q: `repo:${repository} is:pr`, per_page: '1' },
    }),
} satisfies TokenLiveSourceForm;
