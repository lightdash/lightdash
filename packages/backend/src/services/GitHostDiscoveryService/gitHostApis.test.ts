import { GitHost, ParameterError } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import {
    fileExistsWithToken,
    listBranchesWithToken,
    listRepositoriesWithToken,
    type FetchFn,
} from './gitHostApis';

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

const fakeFetch = (handler: (url: string) => Response) => {
    const fn = vi.fn(async (input: string | URL | Request) =>
        handler(String(input)),
    );
    return fn as unknown as FetchFn & typeof fn;
};

const repositoryRef = {
    id: 'repo-id',
    fullName: 'acme/analytics',
    azureProject: 'Data',
};

describe('listRepositoriesWithToken', () => {
    it('maps GitLab projects on a self-managed host', async () => {
        const fetchFn = fakeFetch(() =>
            jsonResponse([
                {
                    id: 7,
                    name: 'analytics',
                    path_with_namespace: 'acme/analytics',
                    namespace: { full_path: 'acme' },
                    default_branch: 'main',
                },
            ]),
        );

        const repos = await listRepositoriesWithToken(fetchFn, {
            host: GitHost.GITLAB,
            token: 'glpat',
            hostDomain: 'gitlab.example.com',
        });

        expect(repos).toEqual([
            {
                id: '7',
                owner: 'acme',
                name: 'analytics',
                fullName: 'acme/analytics',
                azureProject: null,
                defaultBranch: 'main',
            },
        ]);
        expect(fetchFn.mock.calls[0][0]).toMatch(
            /^https:\/\/gitlab\.example\.com\/api\/v4\/projects\?membership=true/,
        );
    });

    it('follows Bitbucket next links', async () => {
        const repo = (name: string) => ({
            uuid: `{${name}}`,
            name,
            full_name: `acme/${name}`,
            workspace: { slug: 'acme' },
            mainbranch: { name: 'main' },
        });
        const fetchFn = fakeFetch((url) =>
            url.includes('page=2')
                ? jsonResponse({ values: [repo('two')] })
                : jsonResponse({
                      values: [repo('one')],
                      next: 'https://api.bitbucket.org/2.0/repositories?page=2',
                  }),
        );

        const repos = await listRepositoriesWithToken(fetchFn, {
            host: GitHost.BITBUCKET,
            username: 'me',
            token: 'token',
            hostDomain: null,
        });

        expect(repos.map(({ fullName }) => fullName)).toEqual([
            'acme/one',
            'acme/two',
        ]);
    });

    it('refuses to list Bitbucket Data Center repositories', async () => {
        await expect(
            listRepositoriesWithToken(
                fakeFetch(() => jsonResponse([])),
                {
                    host: GitHost.BITBUCKET,
                    username: 'me',
                    token: 'token',
                    hostDomain: 'git.example.com',
                },
            ),
        ).rejects.toThrow('Bitbucket Data Center');
    });

    it('reads the Azure DevOps project and default branch', async () => {
        const fetchFn = fakeFetch(() =>
            jsonResponse({
                value: [
                    {
                        id: 'abc',
                        name: 'analytics',
                        project: { name: 'Data' },
                        defaultBranch: 'refs/heads/main',
                    },
                ],
            }),
        );

        const [repo] = await listRepositoriesWithToken(fetchFn, {
            host: GitHost.AZURE_DEVOPS,
            organization: 'acme',
            token: 'pat',
        });

        expect(repo).toEqual({
            id: 'abc',
            owner: 'Data',
            name: 'analytics',
            fullName: 'Data/analytics',
            azureProject: 'Data',
            defaultBranch: 'main',
        });
    });

    it.each([401, 403, 203])(
        'names the token as the problem on HTTP %s',
        async (status) => {
            const error = await listRepositoriesWithToken(
                fakeFetch(() => new Response('', { status })),
                {
                    host: GitHost.AZURE_DEVOPS,
                    organization: 'acme',
                    token: 'x',
                },
            ).catch((caught) => caught);

            expect(error).toBeInstanceOf(ParameterError);
            expect(error.message).toContain('Azure DevOps rejected the token');
        },
    );

    it('says when an Azure DevOps organization does not exist', async () => {
        await expect(
            listRepositoriesWithToken(
                fakeFetch(() => new Response('', { status: 404 })),
                {
                    host: GitHost.AZURE_DEVOPS,
                    organization: 'nope',
                    token: 'x',
                },
            ),
        ).rejects.toThrow('no organization called nope');
    });
});

describe('listBranchesWithToken', () => {
    it('pages GitHub branches until a short page', async () => {
        const fetchFn = fakeFetch((url) =>
            /[?&]page=1(&|$)/.test(url)
                ? jsonResponse(
                      Array.from({ length: 100 }, (_, index) => ({
                          name: `b${index}`,
                      })),
                  )
                : jsonResponse([{ name: 'last' }]),
        );

        const branches = await listBranchesWithToken(
            fetchFn,
            { host: GitHost.GITHUB, method: 'token', token: 't' },
            repositoryRef,
        );

        expect(branches).toHaveLength(101);
        expect(branches.at(-1)).toBe('last');
    });

    it('strips refs/heads from Azure DevOps branches', async () => {
        const branches = await listBranchesWithToken(
            fakeFetch(() =>
                jsonResponse({ value: [{ name: 'refs/heads/main' }] }),
            ),
            { host: GitHost.AZURE_DEVOPS, organization: 'acme', token: 'x' },
            repositoryRef,
        );

        expect(branches).toEqual(['main']);
    });
});

describe('fileExistsWithToken', () => {
    it('treats a 404 as a missing file', async () => {
        await expect(
            fileExistsWithToken(
                fakeFetch(() => new Response('', { status: 404 })),
                { host: GitHost.GITLAB, token: 't', hostDomain: null },
                repositoryRef,
                'main',
                'dbt_project.yml',
            ),
        ).resolves.toBe(false);
    });

    it('treats a 200 as a present file', async () => {
        await expect(
            fileExistsWithToken(
                fakeFetch(() => new Response('name: x', { status: 200 })),
                {
                    host: GitHost.BITBUCKET,
                    username: 'me',
                    token: 't',
                    hostDomain: null,
                },
                repositoryRef,
                'main',
                'analytics/dbt_project.yml',
            ),
        ).resolves.toBe(true);
    });
});
