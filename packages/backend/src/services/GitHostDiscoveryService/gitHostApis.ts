import {
    assertUnreachable,
    GIT_HOST_LABELS,
    GitHost,
    ParameterError,
    UnexpectedGitError,
    type GitHostCredentials,
    type GitHostRepository,
} from '@lightdash/common';

export type FetchFn = typeof fetch;

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_PAGES = 10;
const PAGE_SIZE = 100;
const BITBUCKET_CLOUD_HOST = 'bitbucket.org';
const GITHUB_API = 'https://api.github.com';

type TokenCredentials = Exclude<
    GitHostCredentials,
    { host: GitHost.GITHUB; method: 'installation' }
>;

const TOKEN_SCOPE_HINTS: Record<GitHost, string> = {
    [GitHost.GITHUB]:
        'Check that the token can read repository contents (the repo scope, or Contents: Read for a fine-grained token).',
    [GitHost.GITLAB]:
        'Check that the token has the read_api and read_repository scopes.',
    [GitHost.BITBUCKET]:
        'Check the username and that the API token can read repositories.',
    [GitHost.AZURE_DEVOPS]:
        'Check the organization name and that the token has the Code (Read) scope.',
};

export const hostRejectedTokenError = (host: GitHost) =>
    new ParameterError(
        `${GIT_HOST_LABELS[host]} rejected the token. ${TOKEN_SCOPE_HINTS[host]}`,
        { gitHostError: 'credentials' },
    );

const isBitbucketCloud = (hostDomain: string | null) =>
    hostDomain === null || hostDomain === BITBUCKET_CLOUD_HOST;

export const assertListingSupported = (credentials: GitHostCredentials) => {
    if (
        credentials.host === GitHost.BITBUCKET &&
        !isBitbucketCloud(credentials.hostDomain)
    ) {
        throw new ParameterError(
            'Lightdash cannot list repositories on Bitbucket Data Center yet. Enter the repository and branch by hand.',
            { gitHostError: 'listing_not_supported' },
        );
    }
};

const basicAuth = (username: string, password: string) =>
    `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

const authHeaders = (credentials: TokenCredentials): Record<string, string> => {
    switch (credentials.host) {
        case GitHost.GITHUB:
            return {
                Authorization: `Bearer ${credentials.token}`,
                Accept: 'application/vnd.github+json',
            };
        case GitHost.GITLAB:
            return { 'PRIVATE-TOKEN': credentials.token };
        case GitHost.BITBUCKET:
            return {
                Authorization: basicAuth(
                    credentials.username,
                    credentials.token,
                ),
            };
        case GitHost.AZURE_DEVOPS:
            return { Authorization: basicAuth('', credentials.token) };
        default:
            return assertUnreachable(credentials, 'Unknown git host');
    }
};

type Requester = (url: string) => Promise<Response | null>;

const createRequester =
    (fetchFn: FetchFn, credentials: TokenCredentials): Requester =>
    async (url) => {
        let response: Response;
        try {
            response = await fetchFn(url, {
                headers: authHeaders(credentials),
                redirect: 'manual',
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch (error) {
            throw new UnexpectedGitError(
                `Lightdash could not reach ${GIT_HOST_LABELS[credentials.host]}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
        // Azure DevOps answers a bad token with a 203 sign-in page
        if (
            response.status === 401 ||
            response.status === 403 ||
            response.status === 203 ||
            (response.status >= 300 && response.status < 400)
        ) {
            throw hostRejectedTokenError(credentials.host);
        }
        if (response.status === 404) return null;
        if (!response.ok) {
            throw new UnexpectedGitError(
                `${GIT_HOST_LABELS[credentials.host]} returned HTTP ${response.status}`,
            );
        }
        return response;
    };

const readJson = async <T>(response: Response | null): Promise<T | null> =>
    response ? ((await response.json()) as T) : null;

const gitlabBase = (hostDomain: string | null) =>
    `https://${hostDomain ?? 'gitlab.com'}/api/v4`;

const azureBase = (organization: string) =>
    `https://dev.azure.com/${encodeURIComponent(organization)}`;

const stripHeadsRef = (ref: string | null | undefined) =>
    ref ? ref.replace(/^refs\/heads\//, '') : null;

const collectPages = async <T>(
    fetchPage: (page: number) => Promise<{ items: T[]; hasMore: boolean }>,
): Promise<T[]> => {
    const items: T[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
        // eslint-disable-next-line no-await-in-loop
        const result = await fetchPage(page);
        items.push(...result.items);
        if (!result.hasMore) break;
    }
    return items;
};

type GithubRepo = {
    id: number;
    name: string;
    full_name: string;
    owner: { login: string };
    default_branch: string | null;
};
type GitlabProject = {
    id: number;
    name: string;
    path_with_namespace: string;
    namespace: { full_path: string };
    default_branch: string | null;
};
type BitbucketPage<T> = { values: T[]; next?: string };
type BitbucketRepo = {
    uuid: string;
    name: string;
    full_name: string;
    workspace: { slug: string };
    mainbranch: { name: string } | null;
};
type AzureList<T> = { value: T[] };
type AzureRepo = {
    id: string;
    name: string;
    project: { name: string };
    defaultBranch: string | null;
};

export const listRepositoriesWithToken = async (
    fetchFn: FetchFn,
    credentials: TokenCredentials,
): Promise<GitHostRepository[]> => {
    const request = createRequester(fetchFn, credentials);
    switch (credentials.host) {
        case GitHost.GITHUB: {
            const repos = await collectPages(async (page) => {
                const batch =
                    (await readJson<GithubRepo[]>(
                        await request(
                            `${GITHUB_API}/user/repos?per_page=${PAGE_SIZE}&page=${page}&sort=updated`,
                        ),
                    )) ?? [];
                return { items: batch, hasMore: batch.length === PAGE_SIZE };
            });
            return repos.map((repo) => ({
                id: String(repo.id),
                owner: repo.owner.login,
                name: repo.name,
                fullName: repo.full_name,
                azureProject: null,
                defaultBranch: repo.default_branch,
            }));
        }
        case GitHost.GITLAB: {
            const projects = await collectPages(async (page) => {
                const batch =
                    (await readJson<GitlabProject[]>(
                        await request(
                            `${gitlabBase(credentials.hostDomain)}/projects?membership=true&simple=true&order_by=last_activity_at&per_page=${PAGE_SIZE}&page=${page}`,
                        ),
                    )) ?? [];
                return { items: batch, hasMore: batch.length === PAGE_SIZE };
            });
            return projects.map((project) => ({
                id: String(project.id),
                owner: project.namespace.full_path,
                name: project.name,
                fullName: project.path_with_namespace,
                azureProject: null,
                defaultBranch: project.default_branch,
            }));
        }
        case GitHost.BITBUCKET: {
            assertListingSupported(credentials);
            let next: string | undefined =
                `https://api.bitbucket.org/2.0/repositories?role=member&pagelen=${PAGE_SIZE}`;
            const repos = await collectPages(async () => {
                if (!next) return { items: [], hasMore: false };
                const pageResult: BitbucketPage<BitbucketRepo> | null =
                    await readJson<BitbucketPage<BitbucketRepo>>(
                        await request(next),
                    );
                next = pageResult?.next;
                return {
                    items: pageResult?.values ?? [],
                    hasMore: next !== undefined,
                };
            });
            return repos.map((repo) => ({
                id: repo.uuid,
                owner: repo.workspace.slug,
                name: repo.name,
                fullName: repo.full_name,
                azureProject: null,
                defaultBranch: repo.mainbranch?.name ?? null,
            }));
        }
        case GitHost.AZURE_DEVOPS: {
            const result = await readJson<AzureList<AzureRepo>>(
                await request(
                    `${azureBase(credentials.organization)}/_apis/git/repositories?api-version=7.1`,
                ),
            );
            if (!result) {
                throw new ParameterError(
                    `Azure DevOps has no organization called ${credentials.organization}.`,
                    { gitHostError: 'not_found' },
                );
            }
            return result.value.map((repo) => ({
                id: repo.id,
                owner: repo.project.name,
                name: repo.name,
                fullName: `${repo.project.name}/${repo.name}`,
                azureProject: repo.project.name,
                defaultBranch: stripHeadsRef(repo.defaultBranch),
            }));
        }
        default:
            return assertUnreachable(credentials, 'Unknown git host');
    }
};

export type RepositoryRef = Pick<
    GitHostRepository,
    'id' | 'fullName' | 'azureProject'
>;

const encodePath = (fullName: string) => encodeURIComponent(fullName);

export const listBranchesWithToken = async (
    fetchFn: FetchFn,
    credentials: TokenCredentials,
    repository: RepositoryRef,
): Promise<string[]> => {
    const request = createRequester(fetchFn, credentials);
    switch (credentials.host) {
        case GitHost.GITHUB:
            return collectPages(async (page) => {
                const batch =
                    (await readJson<{ name: string }[]>(
                        await request(
                            `${GITHUB_API}/repos/${repository.fullName}/branches?per_page=${PAGE_SIZE}&page=${page}`,
                        ),
                    )) ?? [];
                return {
                    items: batch.map(({ name }) => name),
                    hasMore: batch.length === PAGE_SIZE,
                };
            });
        case GitHost.GITLAB:
            return collectPages(async (page) => {
                const batch =
                    (await readJson<{ name: string }[]>(
                        await request(
                            `${gitlabBase(credentials.hostDomain)}/projects/${encodePath(repository.fullName)}/repository/branches?per_page=${PAGE_SIZE}&page=${page}`,
                        ),
                    )) ?? [];
                return {
                    items: batch.map(({ name }) => name),
                    hasMore: batch.length === PAGE_SIZE,
                };
            });
        case GitHost.BITBUCKET: {
            assertListingSupported(credentials);
            let next: string | undefined =
                `https://api.bitbucket.org/2.0/repositories/${repository.fullName}/refs/branches?pagelen=${PAGE_SIZE}`;
            return collectPages(async () => {
                if (!next) return { items: [], hasMore: false };
                const pageResult: BitbucketPage<{ name: string }> | null =
                    await readJson<BitbucketPage<{ name: string }>>(
                        await request(next),
                    );
                next = pageResult?.next;
                return {
                    items: (pageResult?.values ?? []).map(({ name }) => name),
                    hasMore: next !== undefined,
                };
            });
        }
        case GitHost.AZURE_DEVOPS: {
            const result = await readJson<AzureList<{ name: string }>>(
                await request(
                    `${azureBase(credentials.organization)}/${encodeURIComponent(repository.azureProject ?? '')}/_apis/git/repositories/${encodeURIComponent(repository.id)}/refs?filter=heads/&api-version=7.1`,
                ),
            );
            return (result?.value ?? []).flatMap(({ name }) => {
                const branch = stripHeadsRef(name);
                return branch ? [branch] : [];
            });
        }
        default:
            return assertUnreachable(credentials, 'Unknown git host');
    }
};

export const fileExistsWithToken = async (
    fetchFn: FetchFn,
    credentials: TokenCredentials,
    repository: RepositoryRef,
    branch: string,
    filePath: string,
): Promise<boolean> => {
    const request = createRequester(fetchFn, credentials);
    const ref = encodeURIComponent(branch);
    switch (credentials.host) {
        case GitHost.GITHUB:
            return (
                (await request(
                    `${GITHUB_API}/repos/${repository.fullName}/contents/${filePath}?ref=${ref}`,
                )) !== null
            );
        case GitHost.GITLAB:
            return (
                (await request(
                    `${gitlabBase(credentials.hostDomain)}/projects/${encodePath(repository.fullName)}/repository/files/${encodeURIComponent(filePath)}?ref=${ref}`,
                )) !== null
            );
        case GitHost.BITBUCKET:
            assertListingSupported(credentials);
            return (
                (await request(
                    `https://api.bitbucket.org/2.0/repositories/${repository.fullName}/src/${ref}/${filePath}`,
                )) !== null
            );
        case GitHost.AZURE_DEVOPS:
            return (
                (await request(
                    `${azureBase(credentials.organization)}/${encodeURIComponent(repository.azureProject ?? '')}/_apis/git/repositories/${encodeURIComponent(repository.id)}/items?path=${encodeURIComponent(`/${filePath}`)}&versionDescriptor.version=${ref}&versionDescriptor.versionType=branch&api-version=7.1`,
                )) !== null
            );
        default:
            return assertUnreachable(credentials, 'Unknown git host');
    }
};
