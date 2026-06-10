import {
    AlreadyExistsError,
    ForbiddenError,
    getErrorMessage,
    LightdashError,
    NotFoundError,
    ParameterError,
    PullRequestState,
    UnexpectedGitError,
} from '@lightdash/common';
import { App } from '@octokit/app';
import { Octokit as OctokitRest } from '@octokit/rest';
import Logger from '../../logging/logger';

const { createAppAuth } = require('@octokit/auth-app');

const privateKey = process.env.GITHUB_PRIVATE_KEY
    ? Buffer.from(process.env.GITHUB_PRIVATE_KEY, 'base64').toString('utf-8')
    : undefined;
const appId = process.env.GITHUB_APP_ID;

export const githubApp =
    privateKey && appId
        ? new App({
              appId,
              privateKey,
              oauth: {
                  clientId: process.env.GITHUB_CLIENT_ID || '',
                  clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
              },
              webhooks: {
                  secret: process.env.GITHUB_WEBHOOK_SECRET || 'secret',
              },
          })
        : undefined;

export const getGithubApp = () => {
    if (githubApp === undefined)
        throw new Error('Github integration not configured');
    return githubApp;
};

/** Build the GitHub OAuth authorize URL for linking a user's personal GitHub
 * account (user-to-server token). Uses the same GitHub App OAuth client as the
 * installation flow, so no extra app registration is needed. Without
 * GITHUB_OAUTH_REDIRECT_URI, GitHub redirects to the app's first configured
 * callback URL — set the env var (and register the URL on the app) when the
 * instance is served somewhere else, e.g. a non-default local dev port. */
export const getGithubUserAuthorizeUrl = (state: string): string => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
        throw new Error('Github integration not configured');
    }
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('state', state);
    const redirectUri = process.env.GITHUB_OAUTH_REDIRECT_URI;
    if (redirectUri) {
        url.searchParams.set('redirect_uri', redirectUri);
    }
    return url.href;
};

/** Check whether a user OAuth token can access a repo. A user-to-server token
 * is scoped to (repos the user can access) ∩ (repos the app is installed on),
 * so this can be false even when the app installation has access. */
export const userTokenHasRepoAccess = async (
    token: string,
    owner: string,
    repo: string,
): Promise<boolean> => {
    const octokit = new OctokitRest();
    try {
        await octokit.rest.repos.get({
            owner,
            repo,
            headers: { authorization: `Bearer ${token}` },
        });
        return true;
    } catch {
        return false;
    }
};

export const getOctokitRestForUser = (
    authToken: string,
): { octokit: OctokitRest; headers: { authorization: string } } => {
    const octokit = new OctokitRest();
    const headers = {
        authorization: `Bearer ${authToken}`,
    };
    return {
        octokit,
        headers,
    };
};

/** Resolve the GitHub account behind a user OAuth token. Used to attribute
 * writeback PRs and commits to the user rather than the app. */
export const getAuthenticatedUser = async (
    token: string,
): Promise<{ login: string; id: number }> => {
    const { octokit, headers } = getOctokitRestForUser(token);
    try {
        const { data } = await octokit.rest.users.getAuthenticated({ headers });
        return { login: data.login, id: data.id };
    } catch (e) {
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

export const getOctokitRestForApp = (installationId: string): OctokitRest => {
    if (appId === undefined)
        throw new Error('Github integration not configured');

    return new OctokitRest({
        authStrategy: createAppAuth,
        auth: {
            appId,
            privateKey,
            installationId,
        },
    });
};

/** Resolve the GitHub App's bot account (login + numeric id) for an
 * installation, so it can be referenced as a co-author with its avatar. */
export const getAppBotIdentity = async (
    installationId: string,
): Promise<{ login: string; id: number }> => {
    const octokit = getOctokitRestForApp(installationId);
    try {
        const { data: installation } = await octokit.rest.apps.getInstallation({
            installation_id: parseInt(installationId, 10),
        });
        const slug = installation.app_slug;
        if (!slug) {
            throw new ParameterError('GitHub installation has no app_slug');
        }
        const { data: bot } = await octokit.rest.users.getByUsername({
            username: `${slug}[bot]`,
        });
        return { login: bot.login, id: bot.id };
    } catch (e) {
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

/** Wrapper to get the right octokit client for the authentication provided
 * If available, use the installation id as a bot
 * otherwise use the token as a user
 * The token can be generated using the installation id
 */
export const getOctokit = (
    installationId?: string,
    token?: string,
): { octokit: OctokitRest; headers: { authorization: string } | undefined } => {
    if (installationId) {
        return {
            octokit: getOctokitRestForApp(installationId),
            headers: undefined,
        };
    }
    return getOctokitRestForUser(token!);
};

export const getOrRefreshToken = async (
    token: string,
    refreshToken: string,
) => {
    // check if token expired and refresh if needed
    try {
        const tokenResponse = await getGithubApp().oauth.checkToken({
            token,
        });
        if (tokenResponse.status === 200) return { token, refreshToken };
    } catch {
        Logger.debug('Refreshing expired or invalid github token');
    }

    const auth = await getGithubApp().oauth.refreshToken({
        refreshToken,
    });

    return {
        token: auth.data.access_token,
        refreshToken: auth.data.refresh_token,
    };
};

export const getLastCommit = async ({
    owner,
    repo,
    branch,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    branch: string;
    installationId?: string;
    token?: string;
}) => {
    const { octokit, headers } = getOctokit(installationId, token);
    // GitHub API uses `sha` param to filter by branch
    // @see https://docs.github.com/en/rest/commits/commits#list-commits
    const response = await octokit.rest.repos.listCommits({
        owner,
        repo,
        sha: branch,
        headers,
    });

    return response.data[0];
};

/**
 * True when a thrown octokit error is a rate-limit response. GitHub signals it
 * two ways: a primary limit (403 with `x-ratelimit-remaining: 0`) and a
 * secondary/burst limit (429, or 403 carrying a `retry-after` header, or a
 * "rate limit" message). Checked at the throw site because callers wrap the
 * error into UnexpectedGitError (dropping status + headers) downstream.
 */
export const isGithubRateLimitError = (error: unknown): boolean => {
    const status = (error as { status?: number } | null)?.status;
    const responseHeaders =
        (error as { response?: { headers?: Record<string, string> } } | null)
            ?.response?.headers ?? {};
    const remaining = responseHeaders['x-ratelimit-remaining'];
    const retryAfter = responseHeaders['retry-after'];
    return (
        status === 429 ||
        (status === 403 && (remaining === '0' || retryAfter !== undefined)) ||
        /rate limit/i.test(getErrorMessage(error))
    );
};

/**
 * Log a rate-limit response loudly (with the reset/retry hints) so throttling is
 * never silent — several callers swallow or wrap the underlying error. No-op for
 * non-rate-limit errors. `context` identifies the call site (e.g. the path).
 */
const logGithubRateLimit = (error: unknown, context: string): void => {
    if (!isGithubRateLimitError(error)) return;
    const responseHeaders =
        (error as { response?: { headers?: Record<string, string> } } | null)
            ?.response?.headers ?? {};
    const status = (error as { status?: number } | null)?.status;
    Logger.warn(
        `[github] rate limit hit (${context}): status=${
            status ?? '?'
        } remaining=${responseHeaders['x-ratelimit-remaining'] ?? '?'} retryAfter=${
            responseHeaders['retry-after'] ?? '?'
        } reset=${responseHeaders['x-ratelimit-reset'] ?? '?'}`,
        {
            event: 'github.rate_limit',
            context,
            status,
            remaining: responseHeaders['x-ratelimit-remaining'],
            retryAfter: responseHeaders['retry-after'],
            reset: responseHeaders['x-ratelimit-reset'],
        },
    );
};

export const getFileContent = async ({
    fileName,
    owner,
    repo,
    branch,
    installationId,
    token,
    hostDomain,
}: {
    fileName: string;
    owner: string;
    repo: string;
    branch: string;
    installationId?: string;
    token?: string;
    hostDomain?: string;
}) => {
    const { octokit, headers } = getOctokit(installationId, token);
    try {
        // GitHub API uses `ref` param for branch/tag/commit
        // @see https://docs.github.com/en/rest/repos/contents#get-repository-content
        const response = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: fileName,
            ref: branch,
            headers,
        });

        if ('content' in response.data) {
            const content = Buffer.from(
                response.data.content,
                'base64',
            ).toString('utf-8');
            return { content, sha: response.data.sha };
        }

        throw new NotFoundError('file not found');
    } catch (error) {
        if (
            error instanceof Error &&
            `status` in error &&
            error.status === 404
        ) {
            throw new NotFoundError(`file ${fileName} not found in Github`);
        }
        logGithubRateLimit(error, `getContent ${fileName}`);
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};

/**
 * Read every `.github/workflows/*.{yml,yaml}` file from a repo via the GitHub
 * API — no clone/sandbox. Used to detect a Lightdash preview-deploy workflow on
 * demand. Reads the repo's default branch when `ref` is omitted. Returns an
 * empty list when the workflows directory does not exist.
 */
/**
 * List every file path in a repo via the GitHub Git Trees API (recursive) — no
 * clone/sandbox. Backs the read-only repo virtual filesystem (`repoShell` tool).
 * `branch` may be a branch name, tag, or commit SHA (resolved to its tree).
 * `truncated` is true when the repo exceeds the API's tree-entry limit, in which
 * case the returned list is incomplete.
 */
export const getRepoTree = async ({
    owner,
    repo,
    branch,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    branch: string;
    installationId?: string;
    token?: string;
}): Promise<{
    files: { path: string; size: number }[];
    truncated: boolean;
}> => {
    const { octokit, headers } = getOctokit(installationId, token);
    try {
        const response = await octokit.rest.git.getTree({
            owner,
            repo,
            tree_sha: branch,
            recursive: 'true',
            headers,
        });
        const files = response.data.tree
            // Symlinks are blobs with mode 120000. The Contents API follows an
            // in-repo symlink server-side and returns the *target's* content, so
            // a symlink committed inside a scoped dbt subPath would let a read
            // escape that scope. Exclude them — the repo VFS exposes real files
            // only (and reports isSymbolicLink: false everywhere).
            .filter(
                (entry) =>
                    entry.type === 'blob' &&
                    entry.mode !== '120000' &&
                    Boolean(entry.path),
            )
            .map((entry) => ({
                path: entry.path as string,
                size: entry.size ?? 0,
            }));
        return { files, truncated: response.data.truncated ?? false };
    } catch (error) {
        if (
            error instanceof Error &&
            `status` in error &&
            error.status === 404
        ) {
            throw new NotFoundError(
                `repo ${owner}/${repo} (ref ${branch}) not found in Github`,
            );
        }
        logGithubRateLimit(error, `getTree ${owner}/${repo}@${branch}`);
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};

export const getRepoWorkflowFiles = async ({
    owner,
    repo,
    ref,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    ref?: string;
    installationId?: string;
    token?: string;
}): Promise<{ path: string; content: string }[]> => {
    const { octokit, headers } = getOctokit(installationId, token);
    try {
        const dirResponse = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: '.github/workflows',
            ...(ref ? { ref } : {}),
            headers,
        });
        // A directory listing is an array; a single file (unexpected here) is not.
        if (!Array.isArray(dirResponse.data)) {
            return [];
        }
        const workflowEntries = dirResponse.data.filter(
            (entry) =>
                entry.type === 'file' &&
                (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')),
        );
        return await Promise.all(
            workflowEntries.map(async (entry) => {
                const fileResponse = await octokit.rest.repos.getContent({
                    owner,
                    repo,
                    path: entry.path,
                    ...(ref ? { ref } : {}),
                    headers,
                });
                const content =
                    'content' in fileResponse.data
                        ? Buffer.from(
                              fileResponse.data.content,
                              'base64',
                          ).toString('utf-8')
                        : '';
                return { path: entry.path, content };
            }),
        );
    } catch (error) {
        if (
            error instanceof Error &&
            `status` in error &&
            error.status === 404
        ) {
            // No `.github/workflows` directory — the repo has no workflows.
            return [];
        }
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};

export const createBranch = async ({
    owner,
    repo,
    sha,
    branch,
    installationId,
    token,
    hostDomain,
}: {
    owner: string;
    repo: string;
    sha: string;
    branch: string;
    installationId?: string;
    token?: string;
    hostDomain?: string;
}): Promise<Awaited<ReturnType<OctokitRest['rest']['git']['createRef']>>> => {
    const { octokit, headers } = getOctokit(installationId, token);

    try {
        // GitHub API uses `ref` as fully qualified reference (refs/heads/...)
        // @see https://docs.github.com/en/rest/git/refs#create-a-reference
        const response = await octokit.rest.git.createRef({
            owner,
            repo,
            ref: `refs/heads/${branch}`,
            sha,
            headers,
        });
        return response;
    } catch (error) {
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};
export const getBranchHeadSha = async ({
    owner,
    repo,
    branch,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    branch: string;
    installationId?: string;
    token?: string;
}): Promise<string> => {
    const { octokit, headers } = getOctokit(installationId, token);
    try {
        const { data } = await octokit.rest.git.getRef({
            owner,
            repo,
            ref: `heads/${branch}`,
            headers,
        });
        return data.object.sha;
    } catch (e) {
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

/** The repo's default branch — the base for a PR opened without a sandbox clone. */
export const getRepoDefaultBranch = async ({
    owner,
    repo,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    installationId?: string;
    token?: string;
}): Promise<string> => {
    const { octokit, headers } = getOctokit(installationId, token);
    try {
        const { data } = await octokit.rest.repos.get({
            owner,
            repo,
            headers,
        });
        return data.default_branch;
    } catch (e) {
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

/** A single GitHub Actions check run on a ref, in the API's native vocabulary. */
export type GithubCheckRun = {
    name: string;
    status: 'queued' | 'in_progress' | 'completed';
    conclusion: string | null;
    htmlUrl: string | null;
    /** When the run started, used to pick the latest run per check name. */
    startedAt: string | null;
};

/**
 * List the GitHub Actions check runs for a ref (branch name or SHA). Used to
 * surface a PR's CI status. Paginates so all check runs are returned, not just
 * the first page.
 */
export const listCheckRunsForRef = async ({
    owner,
    repo,
    ref,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    ref: string;
    installationId?: string;
    token?: string;
}): Promise<GithubCheckRun[]> => {
    const { octokit, headers } = getOctokit(installationId, token);
    try {
        const checkRuns = await octokit.paginate(
            octokit.rest.checks.listForRef,
            { owner, repo, ref, per_page: 100, headers },
        );
        return checkRuns.map((run) => ({
            name: run.name,
            status: run.status as GithubCheckRun['status'],
            conclusion: run.conclusion,
            htmlUrl: run.html_url ?? null,
            startedAt: run.started_at ?? null,
        }));
    } catch (e) {
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

export type GithubFileChanges = {
    /** `contents` is the base64-encoded file content, as required by the API. */
    additions: { path: string; contents: string }[];
    deletions: { path: string }[];
};

/**
 * Create a commit on a branch via the GitHub GraphQL `createCommitOnBranch`
 * mutation. Unlike a pushed git commit, an API commit is signed by GitHub
 * server-side (shows as "Verified") and authored by the credential's identity —
 * the committer cannot be spoofed, which is exactly what makes it verifiable.
 * Pass a user `token` to attribute (and sign) the commit as that user, or an
 * `installationId` to attribute it to the app. `expectedHeadOid` must be the
 * current tip of `branch` (optimistic concurrency).
 */
export const createSignedCommitOnBranch = async ({
    owner,
    repo,
    branch,
    expectedHeadOid,
    headline,
    body,
    fileChanges,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    branch: string;
    expectedHeadOid: string;
    headline: string;
    body: string;
    fileChanges: GithubFileChanges;
    installationId?: string;
    token?: string;
}): Promise<{ oid: string; url: string }> => {
    const { octokit, headers } = getOctokit(installationId, token);
    const mutation = `mutation($input: CreateCommitOnBranchInput!) {
        createCommitOnBranch(input: $input) {
            commit {
                oid
                url
            }
        }
    }`;
    try {
        const response = await octokit.graphql<{
            createCommitOnBranch: { commit: { oid: string; url: string } };
        }>(mutation, {
            input: {
                branch: {
                    repositoryNameWithOwner: `${owner}/${repo}`,
                    branchName: branch,
                },
                message: { headline, body },
                expectedHeadOid,
                fileChanges,
            },
            headers,
        });
        return response.createCommitOnBranch.commit;
    } catch (e) {
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

export const getInstallationToken = async (
    installationId: string,
): Promise<string> => {
    try {
        const octokit = getOctokitRestForApp(installationId);
        const response = await octokit.rest.apps.createInstallationAccessToken({
            installation_id: parseInt(installationId, 10),
        });
        return response.data.token;
    } catch (error) {
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};

export const updateFile = async ({
    owner,
    repo,
    fileName,
    content,
    fileSha,
    branch,
    message,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    fileName: string;
    content: string;
    fileSha: string;
    branch: string;
    message: string;
    installationId?: string;
    token?: string;
}): Promise<
    Awaited<
        ReturnType<OctokitRest['rest']['repos']['createOrUpdateFileContents']>
    >
> => {
    const { octokit, headers } = getOctokit(installationId, token);
    try {
        // GitHub API uses `branch` param for target branch
        // @see https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents
        const response = await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: fileName,
            message,
            content: Buffer.from(content, 'utf-8').toString('base64'),
            sha: fileSha,
            branch,
            headers,
            committer: {
                name: 'Lightdash',
                email: 'developers@glightdash.com',
            },
            author: {
                name: 'Lightdash',
                email: 'developers@glightdash.com',
            },
        });
        return response;
    } catch (e) {
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

export const createFile = async ({
    owner,
    repo,
    fileName,
    content,
    branch,
    message,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    fileName: string;
    content: string;
    branch: string;
    message: string;
    installationId?: string;
    token?: string;
}): Promise<
    Awaited<
        ReturnType<OctokitRest['rest']['repos']['createOrUpdateFileContents']>
    >
> => {
    const { octokit, headers } = getOctokit(installationId, token);

    try {
        // GitHub API uses `branch` param for target branch
        // @see https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents
        const response = await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: fileName,
            message,
            content: Buffer.from(content, 'utf-8').toString('base64'),
            branch,
            headers,
        });
        return response;
    } catch (e) {
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

export const createPullRequest = async ({
    owner,
    repo,
    title,
    body,
    head,
    base,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
    installationId?: string;
    token?: string;
}) => {
    const { octokit, headers } = getOctokit(installationId, token);

    try {
        const response = await octokit.rest.pulls.create({
            owner,
            repo,
            title,
            body,
            head,
            base,
            headers,
        });

        return response.data;
    } catch (e) {
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

export const updatePullRequest = async ({
    owner,
    repo,
    pullNumber,
    title,
    body,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    pullNumber: number;
    title: string;
    body: string;
    installationId?: string;
    token?: string;
}) => {
    const { octokit, headers } = getOctokit(installationId, token);

    try {
        const response = await octokit.rest.pulls.update({
            owner,
            repo,
            pull_number: pullNumber,
            title,
            body,
            headers,
        });

        return response.data;
    } catch (e) {
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

export const getPullRequest = async ({
    owner,
    repo,
    pullNumber,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    pullNumber: number;
    installationId?: string;
    token?: string;
}): Promise<{
    state: 'open' | 'closed';
    merged: boolean;
    headRef: string;
    /** Full name (`owner/repo`) of the PR's head — differs from the base when the PR comes from a fork. */
    headRepoFullName: string | null;
}> => {
    const { octokit, headers } = getOctokit(installationId, token);

    try {
        const response = await octokit.rest.pulls.get({
            owner,
            repo,
            pull_number: pullNumber,
            headers,
        });

        return {
            state: response.data.state === 'closed' ? 'closed' : 'open',
            merged: response.data.merged === true,
            headRef: response.data.head.ref,
            headRepoFullName: response.data.head.repo?.full_name ?? null,
        };
    } catch (e) {
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

export const createPullRequestComment = async ({
    owner,
    repo,
    pullNumber,
    body,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    pullNumber: number;
    body: string;
    installationId?: string;
    token?: string;
}) => {
    const { octokit, headers } = getOctokit(installationId, token);

    try {
        const response = await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: pullNumber,
            body,
            headers,
        });

        return response.data;
    } catch (e) {
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

/**
 * Return the bodies of every issue comment on a pull request (PRs are issues in
 * the GitHub API). Used to discover the Lightdash preview-environment URL that
 * the dbt repo's CI posts after publishing a preview. Empty bodies are dropped.
 */
export const getPullRequestComments = async ({
    owner,
    repo,
    pullNumber,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    pullNumber: number;
    installationId?: string;
    token?: string;
}): Promise<string[]> => {
    const { octokit, headers } = getOctokit(installationId, token);

    try {
        const comments = await octokit.paginate(
            octokit.rest.issues.listComments,
            {
                owner,
                repo,
                issue_number: pullNumber,
                per_page: 100,
                headers,
            },
        );

        return comments
            .map((comment) => comment.body ?? '')
            .filter((body) => body.length > 0);
    } catch (e) {
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

export type PullRequestMetadata = {
    title: string;
    state: PullRequestState;
};

const GITHUB_GRAPHQL_BATCH_SIZE = 100;

const mapGithubPrState = (state: string): PullRequestState => {
    switch (state) {
        case 'MERGED':
            return PullRequestState.MERGED;
        case 'CLOSED':
            return PullRequestState.CLOSED;
        default:
            return PullRequestState.OPEN;
    }
};

/**
 * Batch-resolve the live title/state for many pull requests in a single repo.
 * Uses the GraphQL API with aliased `pullRequest(number:)` lookups so the whole
 * batch costs one request instead of one REST call per PR. Numbers that cannot
 * be resolved (deleted PR, no access) are simply absent from the result.
 */
export const getPullRequests = async ({
    owner,
    repo,
    pullNumbers,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    pullNumbers: number[];
    installationId?: string;
    token?: string;
}): Promise<Record<number, PullRequestMetadata>> => {
    const { octokit, headers } = getOctokit(installationId, token);

    const chunks: number[][] = [];
    for (let i = 0; i < pullNumbers.length; i += GITHUB_GRAPHQL_BATCH_SIZE) {
        chunks.push(pullNumbers.slice(i, i + GITHUB_GRAPHQL_BATCH_SIZE));
    }

    try {
        const responses = await Promise.all(
            chunks.map((chunk) => {
                const aliases = chunk
                    .map(
                        (n) =>
                            `pr${n}: pullRequest(number: ${n}) { number title state }`,
                    )
                    .join('\n');
                const query = `query($owner: String!, $repo: String!) {
                    repository(owner: $owner, name: $repo) {
                        ${aliases}
                    }
                }`;
                return octokit.graphql<{
                    repository: Record<
                        string,
                        { number: number; title: string; state: string } | null
                    >;
                }>(query, { owner, repo, headers });
            }),
        );

        const result: Record<number, PullRequestMetadata> = {};
        responses.forEach((response) => {
            Object.values(response.repository ?? {}).forEach((pr) => {
                if (pr) {
                    result[pr.number] = {
                        title: pr.title,
                        state: mapGithubPrState(pr.state),
                    };
                }
            });
        });
        return result;
    } catch (e) {
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

export const checkFileDoesNotExist = async ({
    owner,
    repo,
    path,
    installationId,
    token,
    branch,
}: {
    owner: string;
    repo: string;
    path: string;
    installationId?: string;
    token?: string;
    branch: string;
}): Promise<boolean> => {
    const { octokit, headers } = getOctokit(installationId, token);

    try {
        // GitHub API uses `ref` param for branch/tag/commit
        // @see https://docs.github.com/en/rest/repos/contents#get-repository-content
        await octokit.rest.repos.getContent({
            owner,
            repo,
            path,
            ref: branch,
            headers,
        });
        throw new AlreadyExistsError(`File "${path}" already exists in Github`);
    } catch (error) {
        if (
            error instanceof Error &&
            `status` in error &&
            error.status === 404
        ) {
            return true;
        }
        throw error;
    }
};

export const getBranches = async ({
    owner,
    repo,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    installationId?: string;
    token?: string;
}) => {
    const { octokit, headers } = getOctokit(installationId, token);

    try {
        const branches = await octokit.paginate(octokit.repos.listBranches, {
            owner,
            repo,
            headers,
        });
        return branches;
    } catch (e) {
        Logger.error(`Failed to list GitHub branches: ${getErrorMessage(e)}`);
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

export const createRepository = async ({
    installationId,
    name,
    description,
    isPrivate = true,
}: {
    installationId: string;
    name: string;
    description?: string;
    isPrivate?: boolean;
}): Promise<{
    owner: string;
    repo: string;
    fullName: string;
    defaultBranch: string;
}> => {
    const octokit = getOctokitRestForApp(installationId);

    try {
        // Get the installation to find the account (org or user)
        const { data: installation } = await octokit.rest.apps.getInstallation({
            installation_id: parseInt(installationId, 10),
        });

        const { account } = installation;
        if (!account || !('login' in account)) {
            throw new ParameterError(
                'Could not determine repository owner from installation',
            );
        }

        const owner = account.login;

        // Determine if the installation is for an org or user
        // Check if the account has a 'type' property (User/Org accounts have it)
        const accountType = 'type' in account ? account.type : undefined;

        let repo;
        if (accountType === 'Organization') {
            // Create repo in the org account
            const response = await octokit.rest.repos.createInOrg({
                org: owner,
                name,
                description: description || 'Lightdash dbt project',
                private: isPrivate,
                auto_init: true, // Creates with README so it's not empty
            });
            repo = response.data;
        } else {
            // Create repo for user account
            const response =
                await octokit.rest.repos.createForAuthenticatedUser({
                    name,
                    description: description || 'Lightdash dbt project',
                    private: isPrivate,
                    auto_init: true,
                });
            repo = response.data;
        }

        return {
            owner: repo.owner.login,
            repo: repo.name,
            fullName: repo.full_name,
            defaultBranch: repo.default_branch,
        };
    } catch (e) {
        if (
            e instanceof Error &&
            'status' in e &&
            (e as { status: number }).status === 422
        ) {
            throw new AlreadyExistsError(`Repository "${name}" already exists`);
        }
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

export const getDirectoryContents = async ({
    owner,
    repo,
    branch,
    path,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    branch: string;
    path: string;
    installationId?: string;
    token?: string;
}): Promise<
    Array<{
        name: string;
        path: string;
        type: string;
        size: number;
        sha: string;
    }>
> => {
    const { octokit, headers } = getOctokit(installationId, token);
    try {
        const response = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: path || '',
            ref: branch,
            headers,
        });

        if (!Array.isArray(response.data)) {
            throw new ParameterError('Path is not a directory');
        }

        return response.data.map((item) => ({
            name: item.name,
            path: item.path,
            type: item.type,
            size: item.size ?? 0,
            sha: item.sha,
        }));
    } catch (error) {
        if (
            error instanceof Error &&
            `status` in error &&
            error.status === 404
        ) {
            throw new NotFoundError(`Directory ${path} not found in GitHub`);
        }
        if (error instanceof ParameterError) {
            throw error;
        }
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};

export const deleteFile = async ({
    owner,
    repo,
    path,
    sha,
    branch,
    message,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    path: string;
    sha: string;
    branch: string;
    message: string;
    installationId?: string;
    token?: string;
}): Promise<
    Awaited<ReturnType<OctokitRest['rest']['repos']['deleteFile']>>
> => {
    const { octokit, headers } = getOctokit(installationId, token);
    try {
        const response = await octokit.rest.repos.deleteFile({
            owner,
            repo,
            path,
            sha,
            branch,
            message,
            headers,
            committer: {
                name: 'Lightdash',
                email: 'developers@lightdash.com',
            },
        });
        return response;
    } catch (error) {
        if (
            error instanceof Error &&
            `status` in error &&
            error.status === 404
        ) {
            throw new NotFoundError(`File ${path} not found in GitHub`);
        }
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};
