import { Ability } from '@casl/ability';
import {
    DbtProjectType,
    ForbiddenError,
    ParameterError,
    PullRequestProvider,
    PullRequestState,
    type DbtBitBucketProjectConfig,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as BitbucketClient from '../../../../clients/bitbucket/Bitbucket';
import type { ProjectDbtSourcesModel } from '../../../../models/ProjectDbtSourcesModel';
import type { ProjectModel } from '../../../../models/ProjectModel/ProjectModel';
import type { SandboxHandle } from '../../SandboxRuntime';
import { CWD } from '../constants';
import { DeniedPathError } from '../deniedPaths';
import {
    WritebackCredentialCleanupError,
    WritebackGitNotConnectedError,
} from '../errors';
import type { BitbucketConnection, BitbucketInstallation } from '../types';
import { quoteShellArgument } from '../utils';
import { BitbucketProvider } from './BitbucketProvider';

const config: DbtBitBucketProjectConfig = {
    type: DbtProjectType.BITBUCKET,
    username: 'developer',
    repository: 'workspace/analytics',
    personal_access_token: 'project-token',
    branch: 'main',
    project_sub_path: '.',
};
const connection: BitbucketConnection = {
    provider: PullRequestProvider.BITBUCKET,
    owner: 'workspace',
    repo: 'analytics',
    projectSubPath: '.',
    branch: 'main',
    username: 'developer',
    projectUuid: 'project',
    projectDbtSourceUuid: null,
};
const installation: BitbucketInstallation = {
    provider: PullRequestProvider.BITBUCKET,
    owner: 'workspace',
    repo: 'analytics',
    token: 'project-token',
    commitAuthor: { name: 'Lightdash', email: 'support@lightdash.com' },
};
const prUrl = 'https://bitbucket.org/workspace/analytics/pull-requests/42';
const pullRequest: BitbucketClient.BitbucketPullRequest = {
    number: 42,
    title: 'Add metric',
    html_url: prUrl,
    state: PullRequestState.OPEN,
    head: 'feature/metric',
    base: 'main',
    sourceRepository: 'workspace/analytics',
    destinationRepository: 'workspace/analytics',
};
const user = {
    userUuid: 'user',
    organizationUuid: 'organization',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    ability: new Ability<PossibleAbilities>([
        {
            action: 'manage',
            subject: 'SourceCode',
            conditions: {
                organizationUuid: 'organization',
                projectUuid: 'project',
            },
        },
    ]),
} as SessionUser;

const setup = () => {
    vi.spyOn(BitbucketClient, 'getRepository').mockResolvedValue({
        full_name: 'workspace/analytics',
        mainbranch: { name: 'main' },
    });
    const projectModel = {
        getSummary: vi
            .fn()
            .mockResolvedValue({ organizationUuid: 'organization' }),
        getWithSensitiveFields: vi
            .fn()
            .mockResolvedValue({ dbtConnection: config }),
    };
    const projectDbtSourcesModel = {
        getSource: vi.fn().mockResolvedValue({
            projectUuid: 'project',
            dbtConnection: config,
        }),
    };
    const provider = new BitbucketProvider({
        projectModel: projectModel as unknown as ProjectModel,
        projectDbtSourcesModel:
            projectDbtSourcesModel as unknown as ProjectDbtSourcesModel,
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } as never,
    });
    return { provider, projectModel, projectDbtSourcesModel };
};
const sandboxFixture = () => ({
    sandboxId: 'sandbox',
    git: {
        status: vi.fn().mockResolvedValue({ currentBranch: 'main' }),
        createBranch: vi.fn().mockResolvedValue(undefined),
        add: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue(undefined),
        push: vi.fn().mockResolvedValue(undefined),
    },
    commands: {
        run: vi.fn(async (command: string) => {
            if (command.includes('rev-parse')) {
                return { exitCode: 0, stdout: 'commit-sha\n' };
            }
            if (command.includes('--numstat')) {
                return { exitCode: 0, stdout: '2\t1\tmodels/orders.yml\n' };
            }
            return { exitCode: 0, stdout: '' };
        }),
    },
});
const writeArgs = (sandbox: ReturnType<typeof sandboxFixture>) => ({
    connection,
    installation,
    user,
    sandbox: sandbox as unknown as SandboxHandle,
    title: 'Add metric',
    description: 'Adds revenue.',
    setStage: vi.fn(),
});

afterEach(() => vi.restoreAllMocks());

describe('Bitbucket project authentication', () => {
    it('resolves sanitized connection identity without carrying a token', () => {
        const { provider } = setup();
        expect(
            provider.resolveConnection(
                { ...config, personal_access_token: '' },
                {
                    projectUuid: 'project',
                    projectDbtSourceUuid: null,
                },
            ),
        ).toEqual(connection);
    });

    it.each([
        ['/', '.'],
        ['/dbt/', 'dbt'],
    ])('normalizes dbt subpath %s to %s', (project_sub_path, expected) => {
        expect(
            setup().provider.resolveConnection(
                { ...config, project_sub_path },
                {
                    projectUuid: 'project',
                    projectDbtSourceUuid: null,
                },
            ).projectSubPath,
        ).toBe(expected);
    });

    it('allows a custom role limited to feature-branch SourceCode management', async () => {
        const limitedUser = {
            ...user,
            ability: new Ability<PossibleAbilities>([
                {
                    action: 'manage',
                    subject: 'SourceCode',
                    conditions: {
                        organizationUuid: 'organization',
                        projectUuid: 'project',
                        isProtectedBranch: false,
                    },
                },
            ]),
        };
        await expect(
            setup().provider.resolveInstallation('organization', {
                user: limitedUser,
                connection,
            }),
        ).resolves.toMatchObject({ token: 'project-token' });
    });

    it.each(['bitbucket.example.com', 'bitbucket.org.evil.test'])(
        'rejects unsupported host %s before resolving credentials',
        (host_domain) => {
            expect(() =>
                setup().provider.resolveConnection(
                    { ...config, host_domain },
                    {
                        projectUuid: 'project',
                        projectDbtSourceUuid: null,
                    },
                ),
            ).toThrow(ParameterError);
        },
    );

    it('resolves the current token for the authorized project', async () => {
        const { provider } = setup();
        expect(
            await provider.resolveInstallation('organization', {
                user,
                connection,
            }),
        ).toMatchObject({
            provider: PullRequestProvider.BITBUCKET,
            token: 'project-token',
            owner: 'workspace',
            repo: 'analytics',
        });
    });

    it('reports provider-denied token access as a Bitbucket configuration error', async () => {
        const { provider } = setup();
        vi.mocked(BitbucketClient.getRepository).mockRejectedValue(
            new ForbiddenError('Private provider details'),
        );
        await expect(
            provider.resolveInstallation('organization', { user, connection }),
        ).rejects.toMatchObject({
            provider: PullRequestProvider.BITBUCKET,
            message:
                'The Bitbucket API token is invalid, expired or lacks repository access. Update the token in the project connection.',
        });
    });

    it('denies another organization before loading secrets', async () => {
        const { provider, projectModel } = setup();
        projectModel.getSummary.mockResolvedValue({
            organizationUuid: 'other-organization',
        });
        await expect(
            provider.resolveInstallation('organization', { user, connection }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(projectModel.getWithSensitiveFields).not.toHaveBeenCalled();
    });

    it('requires manage SourceCode before loading secrets', async () => {
        const { provider, projectModel } = setup();
        await expect(
            provider.resolveInstallation('organization', {
                user: { ...user, ability: new Ability<PossibleAbilities>([]) },
                connection,
            }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(projectModel.getWithSensitiveFields).not.toHaveBeenCalled();
    });

    it.each([
        { repository: 'workspace/other' },
        { username: 'other-user' },
        { host_domain: 'other.example.com' },
    ])('rejects changed connection identity %j', async (change) => {
        const { provider, projectModel } = setup();
        projectModel.getWithSensitiveFields.mockResolvedValue({
            dbtConnection: { ...config, ...change },
        });
        await expect(
            provider.resolveInstallation('organization', { user, connection }),
        ).rejects.toThrow();
    });

    it('reports a missing project token as a Bitbucket configuration error', async () => {
        const { provider, projectModel } = setup();
        projectModel.getWithSensitiveFields.mockResolvedValue({
            dbtConnection: { ...config, personal_access_token: '' },
        });
        await expect(
            provider.resolveInstallation('organization', { user, connection }),
        ).rejects.toBeInstanceOf(WritebackGitNotConnectedError);
    });

    it('resolves an additional source and rejects a source from another project', async () => {
        const { provider, projectModel, projectDbtSourcesModel } = setup();
        const options = {
            user,
            connection: { ...connection, projectDbtSourceUuid: 'source' },
        };
        await expect(
            provider.resolveInstallation('organization', options),
        ).resolves.toMatchObject({ token: 'project-token' });
        expect(projectModel.getWithSensitiveFields).not.toHaveBeenCalled();
        projectDbtSourcesModel.getSource.mockResolvedValue({
            projectUuid: 'other-project',
            dbtConnection: config,
        });
        await expect(
            provider.resolveInstallation('organization', options),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('builds a credential-free clone URL and rejects another repository installation', () => {
        const { provider } = setup();
        expect(provider.getCloneTarget(connection, installation)).toEqual({
            url: 'https://bitbucket.org/workspace/analytics.git',
            username: 'x-bitbucket-api-token-auth',
            password: 'project-token',
        });
        expect(() =>
            provider.getCloneTarget(connection, {
                ...installation,
                repo: 'other',
            }),
        ).toThrow(ForbiddenError);
    });
});

describe('Bitbucket PR lifecycle', () => {
    it.each([
        'https://evil.test/workspace/analytics/pull-requests/42',
        'http://bitbucket.org/workspace/analytics/pull-requests/42',
        'https://bitbucket.org/other/analytics/pull-requests/42',
        'https://user:token@bitbucket.org/workspace/analytics/pull-requests/42',
        'https://bitbucket.org/workspace/analytics/pull-requests/0',
    ])('rejects invalid or unrelated URL %s before API calls', async (url) => {
        const get = vi.spyOn(BitbucketClient, 'getPullRequest');
        await expect(
            setup().provider.adoptPullRequest({
                prUrl: url,
                connection,
                installation,
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(get).not.toHaveBeenCalled();
    });

    it('adopts a same-repository open PR', async () => {
        vi.spyOn(BitbucketClient, 'getPullRequest').mockResolvedValue(
            pullRequest,
        );
        await expect(
            setup().provider.adoptPullRequest({
                prUrl,
                connection,
                installation,
            }),
        ).resolves.toEqual({
            prUrl,
            owner: 'workspace',
            repo: 'analytics',
            pullNumber: 42,
            headRef: 'feature/metric',
        });
    });

    it.each([
        { sourceRepository: 'fork/analytics' },
        { destinationRepository: 'other/analytics' },
        { sourceRepository: null },
        { destinationRepository: undefined },
    ])('rejects fork or missing repository identity %j', async (change) => {
        vi.spyOn(BitbucketClient, 'getPullRequest').mockResolvedValue({
            ...pullRequest,
            ...change,
        });
        await expect(
            setup().provider.adoptPullRequest({
                prUrl,
                connection,
                installation,
            }),
        ).rejects.toThrow(/fork/);
    });

    it.each([PullRequestState.MERGED, PullRequestState.CLOSED])(
        'reports %s as uneditable and refuses adoption',
        async (state) => {
            vi.spyOn(BitbucketClient, 'getPullRequest').mockResolvedValue({
                ...pullRequest,
                state,
            });
            const { provider } = setup();
            await expect(
                provider.getPullRequestEditState({
                    prUrl,
                    connection,
                    installation,
                }),
            ).resolves.toEqual({ editable: false, reason: state });
            await expect(
                provider.adoptPullRequest({ prUrl, connection, installation }),
            ).rejects.toThrow(state);
        },
    );

    it('pushes a fresh branch, returns commit stats and credits the user', async () => {
        const create = vi
            .spyOn(BitbucketClient, 'createPullRequest')
            .mockResolvedValue(pullRequest);
        const sandbox = sandboxFixture();
        await expect(
            setup().provider.openPullRequest(writeArgs(sandbox)),
        ).resolves.toEqual({
            prUrl,
            commitSha: 'commit-sha',
            additions: 2,
            deletions: 1,
        });
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                base: 'main',
                head: expect.stringMatching(/^lightdash-ai-writeback\//),
            }),
        );
        expect(sandbox.git.push).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                remote: 'origin',
                username: 'x-bitbucket-api-token-auth',
                password: 'project-token',
            }),
        );
        expect(sandbox.commands.run).toHaveBeenCalledWith(
            expect.stringContaining(
                "remote set-url origin 'https://bitbucket.org/workspace/analytics.git'",
            ),
        );
        expect(sandbox.commands.run).toHaveBeenCalledWith(
            expect.stringContaining('--unset-all remote.origin.pushurl'),
        );
        expect(sandbox.git.commit).toHaveBeenCalledWith(
            expect.any(String),
            expect.stringContaining(
                'Co-authored-by: Jane Doe <jane@example.com>',
            ),
            expect.anything(),
        );
        expect(sandbox.commands.run).toHaveBeenCalledWith(
            expect.stringContaining('--remove-section credential'),
        );
    });

    it.each(['bitbucket-pipelines.yml', '.github/workflows/deploy.yml'])(
        'refuses denied path %s before committing or pushing',
        async (path) => {
            const sandbox = sandboxFixture();
            sandbox.commands.run.mockImplementation(async (command) => ({
                exitCode: 0,
                stdout: command.includes('--name-status')
                    ? `A\u0000${path}\u0000`
                    : '',
            }));
            const create = vi.spyOn(BitbucketClient, 'createPullRequest');
            await expect(
                setup().provider.openPullRequest(writeArgs(sandbox)),
            ).rejects.toBeInstanceOf(DeniedPathError);
            expect(sandbox.git.commit).not.toHaveBeenCalled();
            expect(sandbox.git.push).not.toHaveBeenCalled();
            expect(create).not.toHaveBeenCalled();
        },
    );

    it('replaces a tampered Git push URL and disables hooks before authenticated push', async () => {
        const directory = mkdtempSync(join(tmpdir(), 'bitbucket-provider-'));
        try {
            const git = (...args: string[]) =>
                execFileSync('git', ['-C', directory, ...args], {
                    encoding: 'utf8',
                }).trim();
            git('init', '-q');
            git('remote', 'add', 'origin', 'https://evil.test/repo.git');
            git(
                'config',
                '--local',
                'remote.origin.pushurl',
                'https://evil.test/push.git',
            );
            git('config', '--local', 'core.hooksPath', '/tmp/unsafe-hooks');
            git('config', '--local', 'credential.helper', 'unsafe-helper');
            const sandbox = sandboxFixture();
            sandbox.commands.run.mockImplementation(async (command) => {
                if (
                    command.includes(' config ') ||
                    command.includes(' remote set-url ')
                ) {
                    execFileSync('sh', [
                        '-c',
                        command.replaceAll(CWD, quoteShellArgument(directory)),
                    ]);
                }
                return {
                    exitCode: 0,
                    stdout: command.includes('rev-parse') ? 'commit-sha' : '',
                };
            });
            sandbox.git.push.mockImplementation(async () => {
                expect(git('remote', 'get-url', '--push', 'origin')).toBe(
                    'https://bitbucket.org/workspace/analytics.git',
                );
                expect(git('config', '--local', 'core.hooksPath')).toBe(
                    '/dev/null',
                );
                expect(() =>
                    git('config', '--local', '--get-all', 'credential.helper'),
                ).toThrow();
            });
            vi.spyOn(BitbucketClient, 'createPullRequest').mockResolvedValue(
                pullRequest,
            );
            await setup().provider.openPullRequest(writeArgs(sandbox));
            expect(sandbox.git.push).toHaveBeenCalledTimes(1);
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('cleans up credentials and sanitizes a failed push', async () => {
        const sandbox = sandboxFixture();
        sandbox.git.push.mockRejectedValue(new Error('project-token'));
        await expect(
            setup().provider.openPullRequest(writeArgs(sandbox)),
        ).rejects.toThrow('Could not push the Bitbucket writeback branch');
        expect(sandbox.commands.run).toHaveBeenCalledWith(
            expect.stringContaining('--remove-section credential'),
        );
    });

    it('fails safely when the sandbox cannot remove persisted credentials', async () => {
        const sandbox = sandboxFixture();
        sandbox.commands.run.mockImplementation(async (command) => ({
            exitCode: command.includes('--remove-section credential') ? 1 : 0,
            stdout: '',
        }));
        const create = vi.spyOn(BitbucketClient, 'createPullRequest');
        await expect(
            setup().provider.openPullRequest(writeArgs(sandbox)),
        ).rejects.toBeInstanceOf(WritebackCredentialCleanupError);
        expect(create).not.toHaveBeenCalled();
    });

    it('refuses to update a PR that merged before the resumed turn', async () => {
        vi.spyOn(BitbucketClient, 'getPullRequest').mockResolvedValue({
            ...pullRequest,
            state: PullRequestState.MERGED,
        });
        const sandbox = sandboxFixture();
        await expect(
            setup().provider.updatePullRequest({
                ...writeArgs(sandbox),
                prUrl,
            }),
        ).rejects.toThrow(/merged/);
        expect(sandbox.git.commit).not.toHaveBeenCalled();
        expect(sandbox.git.push).not.toHaveBeenCalled();
    });

    it('updates only the live PR branch and refreshes metadata', async () => {
        vi.spyOn(BitbucketClient, 'getPullRequest').mockResolvedValue(
            pullRequest,
        );
        const update = vi
            .spyOn(BitbucketClient, 'updatePullRequest')
            .mockResolvedValue(pullRequest);
        const sandbox = sandboxFixture();
        sandbox.git.status.mockResolvedValue({
            currentBranch: pullRequest.head,
        });
        await expect(
            setup().provider.updatePullRequest({
                ...writeArgs(sandbox),
                prUrl,
            }),
        ).resolves.toMatchObject({ commitSha: 'commit-sha' });
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({ pullNumber: 42, title: 'Add metric' }),
        );
        sandbox.git.status.mockResolvedValue({ currentBranch: 'main' });
        sandbox.git.push.mockClear();
        await expect(
            setup().provider.updatePullRequest({
                ...writeArgs(sandbox),
                prUrl,
            }),
        ).rejects.toThrow(/not on/);
        expect(sandbox.git.push).not.toHaveBeenCalled();
    });

    it('declines an open PR, treats already closed as idempotent and refuses merged PRs', async () => {
        const get = vi
            .spyOn(BitbucketClient, 'getPullRequest')
            .mockResolvedValue(pullRequest);
        const decline = vi
            .spyOn(BitbucketClient, 'declinePullRequest')
            .mockResolvedValue({
                ...pullRequest,
                state: PullRequestState.CLOSED,
            });
        const { provider } = setup();
        const args = {
            prUrl,
            owner: 'workspace',
            repo: 'analytics',
            pullNumber: 42,
            installation,
        };
        await expect(provider.closePullRequest(args)).resolves.toEqual({
            state: 'closed',
        });
        get.mockResolvedValue({
            ...pullRequest,
            state: PullRequestState.CLOSED,
        });
        await expect(provider.closePullRequest(args)).resolves.toEqual({
            state: 'closed',
        });
        expect(decline).toHaveBeenCalledTimes(1);
        get.mockResolvedValue({
            ...pullRequest,
            state: PullRequestState.MERGED,
        });
        await expect(provider.closePullRequest(args)).rejects.toThrow(/merged/);
        await expect(
            provider.closePullRequest({ ...args, owner: 'other' }),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });
});
