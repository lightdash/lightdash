import {
    ConflictError,
    DbtProjectType,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    PullRequestState,
    UnexpectedGitError,
    type DbtBitBucketProjectConfig,
} from '@lightdash/common';
import fetchMock from '../../testing/fetchMock';
import {
    commitFiles,
    createBranch,
    createPullRequest,
    declinePullRequest,
    deleteBranch,
    getBranch,
    getFileContent,
    getPullRequest,
    getRepository,
    resolveBitbucketCredentials,
    updatePullRequest,
} from './Bitbucket';

const credentials = {
    owner: 'workspace',
    repo: 'analytics',
    token: 'test-token',
};
const repositoryUrl =
    'https://api.bitbucket.org/2.0/repositories/workspace/analytics';
const connection: DbtBitBucketProjectConfig = {
    type: DbtProjectType.BITBUCKET,
    username: 'developer',
    personal_access_token: credentials.token,
    repository: 'workspace/analytics',
    branch: 'main',
    project_sub_path: '/',
};
const branch = { name: 'feature/dbt', target: { hash: 'parent-sha' } };
const commit = {
    ...credentials,
    branch: branch.name,
    expectedParent: branch.target.hash,
    message: 'Update semantic layer',
    changes: [
        {
            action: 'upsert' as const,
            path: 'models/orders.sql',
            content: 'select 1',
        },
    ],
};
const pullRequest = {
    id: 12,
    title: 'Update semantic layer',
    state: 'OPEN',
    source: { branch: { name: branch.name } },
    destination: { branch: { name: 'main' } },
};

beforeEach(() => fetchMock.resetMocks());

describe('Bitbucket project credentials', () => {
    it.each([undefined, '', 'bitbucket.org', ' BITBUCKET.ORG. '])(
        'accepts the Cloud host %s and normalizes repository suffixes',
        (host_domain) => {
            expect(
                resolveBitbucketCredentials({
                    ...connection,
                    host_domain,
                    repository: ' workspace/analytics.git ',
                }),
            ).toEqual(credentials);
        },
    );

    it.each([
        'bitbucket.example.com',
        'https://bitbucket.org',
        'bitbucket.org.evil.test',
    ])('rejects unsupported writeback host %s', (host_domain) => {
        expect(() =>
            resolveBitbucketCredentials({ ...connection, host_domain }),
        ).toThrow(ParameterError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        'analytics',
        'workspace/group/analytics',
        '../analytics',
        'workspace/..',
        'workspace/analytics?x=1',
    ])('rejects ambiguous repository %s', (repository) =>
        expect(() =>
            resolveBitbucketCredentials({ ...connection, repository }),
        ).toThrow(ParameterError),
    );

    it('requires a project token', () => {
        expect(() =>
            resolveBitbucketCredentials({
                ...connection,
                personal_access_token: ' ',
            }),
        ).toThrow(ParameterError);
    });
});

describe('Bitbucket API boundary', () => {
    it.each([
        [401, ForbiddenError],
        [403, ForbiddenError],
        [404, NotFoundError],
        [409, ConflictError],
        [400, ParameterError],
        [500, UnexpectedGitError],
    ])(
        'maps HTTP %s without exposing response details or credentials',
        async (status, ErrorClass) => {
            fetchMock.mockResponse(
                JSON.stringify({
                    error: {
                        message: `private-upstream-details ${credentials.token}`,
                    },
                }),
                { status },
            );
            const result = getRepository(credentials);
            await expect(result).rejects.toBeInstanceOf(ErrorClass);
            await expect(result).rejects.not.toThrow(
                'private-upstream-details',
            );
            await expect(result).rejects.not.toThrow(credentials.token);
        },
    );

    it('preserves rate limiting as a retryable HTTP 429', async () => {
        fetchMock.mockResponse('private-upstream-details', { status: 429 });
        await expect(getRepository(credentials)).rejects.toMatchObject({
            statusCode: 429,
        });
    });

    it('sanitizes transport failures', async () => {
        fetchMock.mockRejectedValue(
            new Error(`redirect to https://private.test/${credentials.token}`),
        );
        await expect(getRepository(credentials)).rejects.toThrow(
            'Could not reach the Bitbucket Cloud API',
        );
    });

    it.each(['not JSON', JSON.stringify({ private: credentials.token })])(
        'sanitizes malformed successful responses',
        async (body) => {
            fetchMock.mockResponse(body);
            await expect(getRepository(credentials)).rejects.toThrow(
                'Bitbucket returned an invalid API response',
            );
        },
    );

    it('uses Bearer authentication and refuses redirects', async () => {
        fetchMock.mockResponse(
            JSON.stringify({
                full_name: 'workspace/analytics',
                mainbranch: null,
            }),
        );
        await expect(getRepository(credentials)).resolves.toMatchObject({
            mainbranch: null,
        });
        expect(fetchMock).toHaveBeenCalledWith(
            repositoryUrl,
            expect.objectContaining({
                headers: { Authorization: 'Bearer test-token' },
                redirect: 'error',
                signal: expect.any(AbortSignal),
            }),
        );
    });
});

describe('Bitbucket branches and files', () => {
    it('encodes a slash in a branch name as one API path segment', async () => {
        fetchMock.mockResponse(JSON.stringify(branch));
        await getBranch({ ...credentials, branch: 'feature/dbt #1' });
        expect(fetchMock).toHaveBeenCalledWith(
            `${repositoryUrl}/refs/branches/feature%2Fdbt%20%231`,
            expect.any(Object),
        );
    });

    it('creates a branch from a specific commit and deletes it without parsing a response', async () => {
        fetchMock.mockResponseOnce(JSON.stringify(branch), { status: 201 });
        await expect(
            createBranch({
                ...credentials,
                branch: branch.name,
                sha: 'parent-sha',
            }),
        ).resolves.toEqual(branch);
        expect(fetchMock).toHaveBeenLastCalledWith(
            `${repositoryUrl}/refs/branches`,
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    name: branch.name,
                    target: { hash: 'parent-sha' },
                }),
            }),
        );
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
        await expect(
            deleteBranch({ ...credentials, branch: branch.name }),
        ).resolves.toBeUndefined();
    });

    it('pins a file read to the resolved commit and encodes path components', async () => {
        fetchMock.mockResponseOnce(JSON.stringify(branch));
        fetchMock.mockResponseOnce('version: 2\n');
        await expect(
            getFileContent({
                ...credentials,
                branch: branch.name,
                fileName: '/models/sales #1.yml',
            }),
        ).resolves.toEqual({
            content: 'version: 2\n',
            sha: 'parent-sha',
        });
        expect(fetchMock).toHaveBeenLastCalledWith(
            `${repositoryUrl}/src/parent-sha/models/sales%20%231.yml`,
            expect.any(Object),
        );
    });

    it('commits SQL, YAML, reserved filenames and deletions atomically with an empty 201 response', async () => {
        fetchMock.mockResponseOnce(JSON.stringify(branch));
        fetchMock.mockResponseOnce('', { status: 201 });
        await expect(
            commitFiles({
                ...commit,
                changes: [
                    ...commit.changes,
                    {
                        action: 'upsert',
                        path: 'models/orders.yml',
                        content: 'version: 2\n',
                    },
                    {
                        action: 'upsert',
                        path: 'message',
                        content: 'A file named message',
                    },
                    { action: 'delete', path: 'models/old.sql' },
                    { action: 'delete', path: 'models/old.yml' },
                ],
            }),
        ).resolves.toBeUndefined();
        const options: RequestInit = fetchMock.mock.calls[1][1];
        expect(options.method).toBe('POST');
        expect(options.body).toBeInstanceOf(URLSearchParams);
        const body = new URLSearchParams(String(options.body));
        expect(body.get('parents')).toBe('parent-sha');
        expect(body.get('branch')).toBe(branch.name);
        expect(body.get('message')).toBe(commit.message);
        expect(body.get('/message')).toBe('A file named message');
        expect(body.get('/models/orders.sql')).toBe('select 1');
        expect(body.get('/models/orders.yml')).toBe('version: 2\n');
        expect(body.getAll('files')).toEqual([
            '/models/old.sql',
            '/models/old.yml',
        ]);
    });

    it('does not publish when the branch already advanced', async () => {
        fetchMock.mockResponseOnce(
            JSON.stringify({ ...branch, target: { hash: 'new-head' } }),
        );
        await expect(commitFiles(commit)).rejects.toBeInstanceOf(ConflictError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('reports a concurrent update rejected by Bitbucket after the branch check', async () => {
        fetchMock.mockResponseOnce(JSON.stringify(branch));
        fetchMock.mockResponseOnce(
            JSON.stringify({
                error: {
                    message:
                        'The parent commit specified (parent-sha) is not the head of branch feature/dbt.',
                },
            }),
            { status: 400 },
        );
        await expect(commitFiles(commit)).rejects.toBeInstanceOf(ConflictError);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it.each([
        '../secret',
        'models/../secret',
        'models\\orders.sql',
        'models//orders.sql',
    ])(
        'rejects unsafe commit path %s before making a request',
        async (path) => {
            await expect(
                commitFiles({
                    ...commit,
                    changes: [{ action: 'delete', path }],
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );

    it('rejects duplicate normalized paths before making a request', async () => {
        await expect(
            commitFiles({
                ...commit,
                changes: [
                    {
                        action: 'upsert',
                        path: '/models/orders.sql',
                        content: 'select 1',
                    },
                    { action: 'delete', path: 'models/orders.sql' },
                ],
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('Bitbucket pull requests', () => {
    it('preserves source and destination repository identities for fork validation', async () => {
        fetchMock.mockResponse(
            JSON.stringify({
                ...pullRequest,
                source: {
                    ...pullRequest.source,
                    repository: { full_name: 'fork/analytics' },
                },
                destination: {
                    ...pullRequest.destination,
                    repository: { full_name: 'workspace/analytics' },
                },
            }),
        );
        await expect(
            getPullRequest({ ...credentials, pullNumber: 12 }),
        ).resolves.toMatchObject({
            sourceRepository: 'fork/analytics',
            destinationRepository: 'workspace/analytics',
        });
    });
    it.each([
        ['OPEN', PullRequestState.OPEN],
        ['MERGED', PullRequestState.MERGED],
        ['DECLINED', PullRequestState.CLOSED],
        ['SUPERSEDED', PullRequestState.CLOSED],
    ])('normalizes the %s state', async (state, normalized) => {
        fetchMock.mockResponse(
            JSON.stringify({
                ...pullRequest,
                state,
                links: { html: { href: 'https://untrusted.test' } },
            }),
        );
        await expect(
            getPullRequest({ ...credentials, pullNumber: 12 }),
        ).resolves.toEqual({
            number: 12,
            title: pullRequest.title,
            state: normalized,
            html_url:
                'https://bitbucket.org/workspace/analytics/pull-requests/12',
            head: branch.name,
            base: 'main',
            sourceRepository: null,
            destinationRepository: null,
        });
    });

    it('creates, updates and declines a pull request', async () => {
        fetchMock.mockResponseOnce(JSON.stringify(pullRequest), {
            status: 201,
        });
        await createPullRequest({
            ...credentials,
            title: pullRequest.title,
            body: 'Description',
            head: branch.name,
            base: 'main',
        });
        expect(fetchMock).toHaveBeenLastCalledWith(
            `${repositoryUrl}/pullrequests`,
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    title: pullRequest.title,
                    description: 'Description',
                    source: pullRequest.source,
                    destination: pullRequest.destination,
                    close_source_branch: true,
                }),
            }),
        );
        fetchMock.mockResponseOnce(
            JSON.stringify({ ...pullRequest, title: 'Updated' }),
        );
        await expect(
            updatePullRequest({
                ...credentials,
                pullNumber: 12,
                title: 'Updated',
                body: 'New description',
            }),
        ).resolves.toMatchObject({ title: 'Updated' });
        expect(fetchMock).toHaveBeenLastCalledWith(
            `${repositoryUrl}/pullrequests/12`,
            expect.objectContaining({
                method: 'PUT',
                body: JSON.stringify({
                    title: 'Updated',
                    description: 'New description',
                }),
            }),
        );
        fetchMock.mockResponseOnce(
            JSON.stringify({ ...pullRequest, state: 'DECLINED' }),
        );
        await expect(
            declinePullRequest({ ...credentials, pullNumber: 12 }),
        ).resolves.toMatchObject({ state: PullRequestState.CLOSED });
        expect(fetchMock).toHaveBeenLastCalledWith(
            `${repositoryUrl}/pullrequests/12/decline`,
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it.each([0, -1, 1.5, Number.NaN])(
        'rejects invalid pull request number %s',
        async (pullNumber) => {
            await expect(
                getPullRequest({ ...credentials, pullNumber }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );
});
