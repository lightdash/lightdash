import {
    ConflictError,
    DbtProjectType,
    ForbiddenError,
    LightdashError,
    NotFoundError,
    ParameterError,
    PullRequestState,
    UnexpectedGitError,
    type DbtProjectConfig,
} from '@lightdash/common';
import { z } from 'zod';

export type BitbucketCredentials = {
    owner: string;
    repo: string;
    token: string;
};

type BranchParams = BitbucketCredentials & { branch: string };
type PullRequestParams = BitbucketCredentials & { pullNumber: number };

const branchSchema = z.object({
    name: z.string(),
    target: z.object({ hash: z.string() }),
});
const repositorySchema = z.object({
    full_name: z.string(),
    mainbranch: z.object({ name: z.string() }).nullable().optional(),
});
const pullRequestSchema = z.object({
    id: z.number().int().positive(),
    title: z.string(),
    state: z.enum(['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED']),
    source: z.object({
        branch: z.object({ name: z.string() }),
        repository: z.object({ full_name: z.string() }).nullish(),
    }),
    destination: z.object({
        branch: z.object({ name: z.string() }),
        repository: z.object({ full_name: z.string() }).nullish(),
    }),
});

export type BitbucketPullRequest = {
    number: number;
    title: string;
    html_url: string;
    state: PullRequestState;
    head: string;
    base: string;
    sourceRepository?: string | null;
    destinationRepository?: string | null;
};

const encodeSegment = (value: string): string => {
    if (
        !value ||
        value === '.' ||
        value === '..' ||
        /[\x00-\x1f]/.test(value)
    ) {
        throw new ParameterError('Invalid Bitbucket path');
    }
    return encodeURIComponent(value);
};

export const resolveBitbucketRepository = (
    connection: DbtProjectConfig,
): Pick<BitbucketCredentials, 'owner' | 'repo'> => {
    if (connection.type !== DbtProjectType.BITBUCKET) {
        throw new ParameterError('The project is not connected to Bitbucket');
    }
    const host = connection.host_domain
        ?.trim()
        .toLowerCase()
        .replace(/\.$/, '');
    if (host && host !== 'bitbucket.org') {
        throw new ParameterError(
            'Writeback supports Bitbucket Cloud (bitbucket.org) only',
        );
    }
    const repository = connection.repository.trim().replace(/\.git$/, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
        throw new ParameterError(
            'Bitbucket repository must be workspace/repository',
        );
    }
    const [owner, repo] = repository.split('/');
    encodeSegment(owner);
    encodeSegment(repo);
    return { owner, repo };
};

export const resolveBitbucketCredentials = (
    connection: DbtProjectConfig,
): BitbucketCredentials => {
    const { owner, repo } = resolveBitbucketRepository(connection);
    if (connection.type !== DbtProjectType.BITBUCKET) {
        throw new ParameterError('The project is not connected to Bitbucket');
    }
    const token = connection.personal_access_token?.trim();
    if (!token) {
        throw new ParameterError(
            'Configure an API token for this Bitbucket project',
        );
    }
    return { owner, repo, token };
};

const repositoryUrl = ({ owner, repo }: BitbucketCredentials): string =>
    `https://api.bitbucket.org/2.0/repositories/${encodeSegment(owner)}/${encodeSegment(repo)}`;

const request = async (
    credentials: BitbucketCredentials,
    path: string,
    options: RequestInit = {},
): Promise<Response> => {
    let response: Response;
    try {
        response = await fetch(`${repositoryUrl(credentials)}${path}`, {
            ...options,
            redirect: 'error',
            signal: options.signal ?? AbortSignal.timeout(30_000),
            headers: {
                ...options.headers,
                Authorization: `Bearer ${credentials.token}`,
            },
        });
    } catch {
        // Fetch errors can include request credentials or redirect destinations.
        throw new UnexpectedGitError('Could not reach the Bitbucket Cloud API');
    }
    if (response.ok) {
        return response;
    }
    switch (response.status) {
        case 401:
            throw new ForbiddenError(
                'Bitbucket API token is invalid or expired. Update the project token.',
            );
        case 403:
            throw new ForbiddenError(
                'Bitbucket denied access. Check repository access, token scopes and workspace write restrictions. Writeback requires repository and pull request read/write permissions.',
            );
        case 404:
            throw new NotFoundError(
                'Bitbucket resource was not found or is not accessible to the project token',
            );
        case 409:
            throw new ConflictError(
                'The Bitbucket branch changed. Reload it before retrying.',
            );
        case 429:
            throw new LightdashError({
                name: 'BitbucketRateLimitError',
                message: 'Bitbucket API rate limit reached. Retry later.',
                statusCode: 429,
                data: {},
            });
        case 400: {
            const error = await response.json().catch(() => null);
            const parsed = z
                .object({ error: z.object({ message: z.string() }) })
                .safeParse(error);
            if (
                parsed.success &&
                /^The parent commit specified .+ is not the head of branch /.test(
                    parsed.data.error.message,
                )
            ) {
                throw new ConflictError(
                    'The Bitbucket branch changed. Reload it before retrying.',
                );
            }
            throw new ParameterError(
                'Bitbucket rejected the request. Check file paths, branch names and the expected parent commit.',
            );
        }
        default:
            throw new UnexpectedGitError(
                `Bitbucket API request failed (HTTP ${response.status})`,
            );
    }
};

const readJson = async <T>(
    response: Response,
    schema: z.ZodType<T>,
): Promise<T> => {
    try {
        return schema.parse(await response.json());
    } catch {
        throw new UnexpectedGitError(
            'Bitbucket returned an invalid API response',
        );
    }
};

const jsonOptions = (method: string, data: unknown): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
});

export const getRepository = async (credentials: BitbucketCredentials) =>
    readJson(await request(credentials, ''), repositorySchema);

export const getBranch = async (args: BranchParams) =>
    readJson(
        await request(args, `/refs/branches/${encodeSegment(args.branch)}`),
        branchSchema,
    );

export const createBranch = async (args: BranchParams & { sha: string }) =>
    readJson(
        await request(
            args,
            '/refs/branches',
            jsonOptions('POST', {
                name: args.branch,
                target: { hash: args.sha },
            }),
        ),
        branchSchema,
    );

export const deleteBranch = async (args: BranchParams): Promise<void> => {
    await request(args, `/refs/branches/${encodeSegment(args.branch)}`, {
        method: 'DELETE',
    });
};

const filePath = (path: string): string => {
    const normalized = path.replace(/^\//, '');
    if (normalized.includes('\\')) {
        throw new ParameterError(
            'Bitbucket file paths must use forward slashes',
        );
    }
    normalized.split('/').forEach(encodeSegment);
    return normalized;
};

export const getFileContent = async (
    args: BranchParams & { fileName: string },
): Promise<{ content: string; sha: string }> => {
    const branch = await getBranch(args);
    const path = filePath(args.fileName)
        .split('/')
        .map(encodeSegment)
        .join('/');
    const response = await request(
        args,
        `/src/${encodeSegment(branch.target.hash)}/${path}`,
    );
    return { content: await response.text(), sha: branch.target.hash };
};

export type BitbucketFileChange =
    | { path: string; content: string; action: 'upsert' }
    | { path: string; action: 'delete' };

export const commitFiles = async (
    args: BranchParams & {
        expectedParent: string;
        message: string;
        changes: BitbucketFileChange[];
    },
): Promise<void> => {
    if (args.changes.length === 0) {
        throw new ParameterError(
            'A Bitbucket commit requires at least one file change',
        );
    }
    const paths = args.changes.map((change) => filePath(change.path));
    if (new Set(paths).size !== paths.length) {
        throw new ParameterError(
            'A Bitbucket commit cannot change the same path twice',
        );
    }
    const current = await getBranch(args);
    if (current.target.hash !== args.expectedParent) {
        throw new ConflictError(
            'The Bitbucket branch changed. Reload it before retrying.',
        );
    }
    const body = new URLSearchParams({
        branch: args.branch,
        parents: args.expectedParent,
        message: args.message,
    });
    args.changes.forEach((change, index) => {
        const path = `/${paths[index]}`;
        if (change.action === 'delete') {
            body.append('files', path);
        } else {
            body.append(path, change.content);
        }
    });
    // Bitbucket enforces the parent when publishing and returns an empty 201.
    await request(args, '/src', { method: 'POST', body });
};

const readPullRequest = async (
    args: BitbucketCredentials,
    response: Response,
): Promise<BitbucketPullRequest> => {
    const result = await readJson(response, pullRequestSchema);
    const states: Record<
        z.infer<typeof pullRequestSchema>['state'],
        PullRequestState
    > = {
        OPEN: PullRequestState.OPEN,
        MERGED: PullRequestState.MERGED,
        DECLINED: PullRequestState.CLOSED,
        SUPERSEDED: PullRequestState.CLOSED,
    };
    return {
        number: result.id,
        title: result.title,
        html_url: `https://bitbucket.org/${encodeSegment(args.owner)}/${encodeSegment(args.repo)}/pull-requests/${result.id}`,
        state: states[result.state],
        head: result.source.branch.name,
        base: result.destination.branch.name,
        sourceRepository: result.source.repository?.full_name ?? null,
        destinationRepository: result.destination.repository?.full_name ?? null,
    };
};

const pullRequestPath = (number: number): string => {
    if (!Number.isSafeInteger(number) || number < 1) {
        throw new ParameterError('Invalid Bitbucket pull request number');
    }
    return `/pullrequests/${number}`;
};

export const getPullRequest = async (
    args: PullRequestParams,
): Promise<BitbucketPullRequest> =>
    readPullRequest(
        args,
        await request(args, pullRequestPath(args.pullNumber)),
    );

export const createPullRequest = async (
    args: BitbucketCredentials & {
        title: string;
        body: string;
        head: string;
        base: string;
    },
): Promise<BitbucketPullRequest> =>
    readPullRequest(
        args,
        await request(
            args,
            '/pullrequests',
            jsonOptions('POST', {
                title: args.title,
                description: args.body,
                source: { branch: { name: args.head } },
                destination: { branch: { name: args.base } },
                close_source_branch: true,
            }),
        ),
    );

export const updatePullRequest = async (
    args: PullRequestParams & { title: string; body: string },
): Promise<BitbucketPullRequest> =>
    readPullRequest(
        args,
        await request(
            args,
            pullRequestPath(args.pullNumber),
            jsonOptions('PUT', {
                title: args.title,
                description: args.body,
            }),
        ),
    );

export const declinePullRequest = async (
    args: PullRequestParams,
): Promise<BitbucketPullRequest> =>
    readPullRequest(
        args,
        await request(args, `${pullRequestPath(args.pullNumber)}/decline`, {
            method: 'POST',
        }),
    );
