import {
    assertUnreachable,
    GitHost,
    SemanticLayerFormat,
    type GitHostCredentials,
    type GitHostRepository,
} from '@lightdash/common';

export type GitHostDraft = {
    githubMethod: 'installation' | 'token';
    token: string;
    username: string;
    organization: string;
    hostDomain: string;
};

export const getEmptyGitHostDraft = (
    canInstallGithubApp: boolean,
): GitHostDraft => ({
    githubMethod: canInstallGithubApp ? 'installation' : 'token',
    token: '',
    username: '',
    organization: '',
    hostDomain: '',
});

const blankToNull = (value: string) => (value.trim() ? value.trim() : null);

export const toGitHostCredentials = (
    host: GitHost,
    draft: GitHostDraft,
    hasGithubInstallation: boolean,
): GitHostCredentials | null => {
    const token = draft.token.trim();
    switch (host) {
        case GitHost.GITHUB:
            if (draft.githubMethod === 'installation') {
                return hasGithubInstallation
                    ? { host, method: 'installation' }
                    : null;
            }
            return token ? { host, method: 'token', token } : null;
        case GitHost.GITLAB:
            return token
                ? { host, token, hostDomain: blankToNull(draft.hostDomain) }
                : null;
        case GitHost.BITBUCKET:
            return token && draft.username.trim()
                ? {
                      host,
                      token,
                      username: draft.username.trim(),
                      hostDomain: blankToNull(draft.hostDomain),
                  }
                : null;
        case GitHost.AZURE_DEVOPS:
            return token && draft.organization.trim()
                ? { host, token, organization: draft.organization.trim() }
                : null;
        default:
            return assertUnreachable(host, 'Unknown git host');
    }
};

export type RepositorySelection = {
    repository: GitHostRepository | null;
    branch: string;
    subPath: string;
    isManual: boolean;
};

export const EMPTY_REPOSITORY_SELECTION: RepositorySelection = {
    repository: null,
    branch: '',
    subPath: '/',
    isManual: false,
};

export type SemanticLayerChoice = 'dbt' | 'lightdash';

export const getAutomaticSemanticLayer = (
    format: SemanticLayerFormat,
    supportsNative: boolean,
): SemanticLayerChoice | null => {
    switch (format) {
        case SemanticLayerFormat.DBT:
            return 'dbt';
        case SemanticLayerFormat.LIGHTDASH:
            return supportsNative ? 'lightdash' : null;
        case SemanticLayerFormat.BOTH:
        case SemanticLayerFormat.NEITHER:
            return null;
        default:
            return assertUnreachable(format, 'Unknown semantic layer format');
    }
};
