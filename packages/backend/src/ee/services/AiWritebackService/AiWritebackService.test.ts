import { Ability, AbilityBuilder } from '@casl/ability';
import {
    AnyType,
    DbtProjectType,
    DbtVersionOptionLatest,
    FeatureFlags,
    ForbiddenError,
    getLatestSupportDbtVersion,
    PullRequestProvider,
    SupportedDbtVersions,
    WarehouseTypes,
    type MemberAbility,
    type SessionUser,
} from '@lightdash/common';
import { Sandbox } from 'e2b';
import {
    createPullRequest,
    getAppBotIdentity,
    getAuthenticatedUser,
    getBranchHeadSha,
    getInstallationToken,
    getOrRefreshToken,
    getRepoDefaultBranch,
    listReposAccessibleToInstallation,
} from '../../../clients/github/Github';
import { AiWritebackService } from './AiWritebackService';
import {
    COMPILE_WRAPPER_PATH,
    PR_DESCRIPTION_CLOSE,
    PR_DESCRIPTION_OPEN,
    PR_TITLE_CLOSE,
    PR_TITLE_OPEN,
} from './constants';

// e2b (and the GitHub client → octokit) are ESM-only and break Jest's parser.
// Stub the modules so the import graph stays CJS; the run() tests drive the
// fakes, the unit tests below never reach them.
jest.mock('e2b', () => ({
    Sandbox: { create: jest.fn(), connect: jest.fn() },
    CommandExitError: class CommandExitError extends Error {},
    TimeoutError: class TimeoutError extends Error {},
}));
jest.mock('../../../clients/github/Github', () => ({
    createBranch: jest.fn().mockResolvedValue(undefined),
    createPullRequest: jest.fn(),
    createSignedCommitOnBranch: jest
        .fn()
        .mockResolvedValue({ oid: 'sha-7', url: 'https://github.com/c/o' }),
    getAppBotIdentity: jest.fn(),
    getAuthenticatedUser: jest.fn(),
    getBranchHeadSha: jest.fn(),
    getInstallationToken: jest.fn(),
    getOrRefreshToken: jest.fn(),
    getRepoDefaultBranch: jest.fn(),
    getRepoTree: jest.fn(),
    listReposAccessibleToInstallation: jest.fn(),
    updatePullRequest: jest.fn().mockResolvedValue(undefined),
}));

const ORG = 'org-1';
const PR_3 = 'https://github.com/acme/analytics/pull/3';
const PR_7 = 'https://github.com/acme/analytics/pull/7';
const PR_9 = 'https://github.com/acme/analytics/pull/9';

// The commit a provider lands this turn (SHA + line stat). open/update return
// it so the card can pin CI and show the diff stat; no-change turns return nulls.
const LANDED = { commitSha: 'sha-7', additions: 5, deletions: 2 };

const buildService = (overrides: Record<string, AnyType> = {}) =>
    new AiWritebackService({
        lightdashConfig: { gitlab: {} } as AnyType,
        analytics: { track: jest.fn() } as AnyType,
        projectModel: { get: jest.fn() } as AnyType,
        featureFlagModel: { get: jest.fn() } as AnyType,
        githubAppInstallationsModel: {} as AnyType,
        githubAppService: {
            getValidUserToken: jest.fn().mockResolvedValue(undefined),
        } as AnyType,
        gitlabAppInstallationsModel: {} as AnyType,
        aiWritebackThreadModel: { findByAiThreadUuid: jest.fn() } as AnyType,
        pullRequestsModel: {} as AnyType,
        ...overrides,
    });

// A stand-in GitProvider so applyAgentChanges/run stay provider-agnostic in
// tests — the host-specific behaviour is covered by the provider unit tests.
const fakeProvider = (overrides: AnyType = {}): AnyType => ({
    provider: PullRequestProvider.GITHUB,
    supportsPreviewDeploy: true,
    resolveConnection: jest.fn(),
    resolveInstallation: jest.fn(),
    getCloneTarget: jest.fn(),
    openPullRequest: jest.fn().mockResolvedValue({ prUrl: PR_7, ...LANDED }),
    updatePullRequest: jest.fn().mockResolvedValue({ ...LANDED }),
    adoptPullRequest: jest.fn(),
    ...overrides,
});

const turnContext = (overrides: AnyType = {}): AnyType => ({
    organizationUuid: ORG,
    projectName: 'Analytics',
    provider: fakeProvider(),
    gitConnection: {
        provider: PullRequestProvider.GITHUB,
        owner: 'acme',
        repo: 'analytics',
        projectSubPath: '.',
    },
    existingRow: null,
    isResume: false,
    warehouseType: null,
    ...overrides,
});

const threadRow = (prUrl: string): AnyType => ({
    ai_writeback_thread_uuid: 'w-1',
    ai_thread_uuid: 'thread-1',
    sandbox_id: 'sbx-1',
    pull_request_uuid: 'pr-1',
    created_at: new Date(),
    pr_url: prUrl,
});

const adoptedPullRequest = (prUrl: string): AnyType => ({
    prUrl,
    owner: 'acme',
    repo: 'analytics',
    pullNumber: 9,
    headRef: 'feature/x',
});

describe('AiWritebackService.applyAgentChanges', () => {
    const setup = () => {
        const service = buildService();
        const provider = fakeProvider();
        const record = jest
            .spyOn(service as AnyType, 'recordWritebackPullRequest')
            .mockResolvedValue(undefined);
        return {
            service,
            provider,
            open: provider.openPullRequest,
            update: provider.updatePullRequest,
            record,
        };
    };

    const applyAgentChanges = (
        service: AiWritebackService,
        provider: AnyType,
        args: AnyType,
    ): AnyType =>
        (service as AnyType).applyAgentChanges({
            sandbox: { sandboxId: 'sbx-1' },
            installation: {
                provider: PullRequestProvider.GITHUB,
                installationId: 'inst-1',
            },
            adoptedPr: null,
            turn: turnContext({ provider, ...(args.turnOverrides ?? {}) }),
            user: { userUuid: 'u1' },
            projectUuid: 'p1',
            aiThreadUuid: undefined,
            setStage: jest.fn(),
            prTitle: 'T',
            prDescription: 'D',
            ...args,
        });

    it('does nothing when the agent made no changes (one-shot)', async () => {
        const { service, provider, open, update } = setup();
        const result = await applyAgentChanges(service, provider, {
            hasChanges: false,
        });
        expect(result).toEqual({
            prUrl: null,
            prCreated: false,
            pauseOnExit: false,
            commitSha: null,
            additions: null,
            deletions: null,
        });
        expect(open).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });

    it('keeps a resumed PR and sandbox warm when there are no changes', async () => {
        const { service, provider } = setup();
        const result = await applyAgentChanges(service, provider, {
            hasChanges: false,
            turnOverrides: { existingRow: threadRow(PR_3), isResume: true },
        });
        expect(result).toEqual({
            prUrl: PR_3,
            prCreated: false,
            pauseOnExit: true,
            commitSha: null,
            additions: null,
            deletions: null,
        });
    });

    it('updates the existing PR and pauses on a resume turn with changes', async () => {
        const { service, provider, update, record } = setup();
        const result = await applyAgentChanges(service, provider, {
            hasChanges: true,
            turnOverrides: { existingRow: threadRow(PR_3), isResume: true },
        });
        expect(result).toEqual({
            prUrl: PR_3,
            prCreated: false,
            pauseOnExit: true,
            ...LANDED,
        });
        expect(update).toHaveBeenCalledTimes(1);
        expect(record).not.toHaveBeenCalled();
    });

    it('updates and records a pasted (adopted) PR when given a thread uuid', async () => {
        const { service, provider, update, record } = setup();
        const result = await applyAgentChanges(service, provider, {
            hasChanges: true,
            adoptedPr: adoptedPullRequest(PR_9),
            aiThreadUuid: 'thread-1',
        });
        expect(result).toEqual({
            prUrl: PR_9,
            prCreated: false,
            pauseOnExit: true,
            ...LANDED,
        });
        expect(update).toHaveBeenCalledTimes(1);
        expect(record).toHaveBeenCalledTimes(1);
    });

    it('does not keep an adopted PR warm without a thread uuid', async () => {
        const { service, provider } = setup();
        const result = await applyAgentChanges(service, provider, {
            hasChanges: true,
            adoptedPr: adoptedPullRequest(PR_9),
            aiThreadUuid: undefined,
        });
        expect(result.pauseOnExit).toBe(false);
    });

    it('opens and records a new PR for fresh changes in a thread', async () => {
        const { service, provider, open, update, record } = setup();
        const result = await applyAgentChanges(service, provider, {
            hasChanges: true,
            aiThreadUuid: 'thread-1',
        });
        expect(result).toEqual({
            prUrl: PR_7,
            prCreated: true,
            pauseOnExit: true,
            ...LANDED,
        });
        expect(open).toHaveBeenCalledTimes(1);
        expect(update).not.toHaveBeenCalled();
        expect(record).toHaveBeenCalledTimes(1);
    });

    it('kills the sandbox after a one-shot run opens a PR', async () => {
        const { service, provider } = setup();
        const result = await applyAgentChanges(service, provider, {
            hasChanges: true,
            aiThreadUuid: undefined,
        });
        expect(result).toMatchObject({ prCreated: true, pauseOnExit: false });
    });
});

describe('AiWritebackService.prepareTurn', () => {
    const userWithOrg = (canManage: boolean): SessionUser => {
        const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
        if (canManage) can('manage', 'SourceCode', { organizationUuid: ORG });
        return {
            userUuid: 'u1',
            organizationUuid: ORG,
            organizationName: 'Acme',
            organizationCreatedAt: new Date(),
            role: 'admin',
            ability: build(),
        } as AnyType;
    };

    const githubProject = (
        dbtVersion: AnyType = SupportedDbtVersions.V1_9,
    ): AnyType => ({
        organizationUuid: ORG,
        name: 'Analytics',
        dbtConnection: {
            type: DbtProjectType.GITHUB,
            authorization_method: 'installation_id',
            repository: 'acme/analytics',
            branch: 'main',
            project_sub_path: '/',
        },
        warehouseConnection: { type: WarehouseTypes.POSTGRES },
        dbtVersion,
    });

    const gitlabProject = (): AnyType => ({
        organizationUuid: ORG,
        name: 'Analytics',
        dbtConnection: {
            type: DbtProjectType.GITLAB,
            personal_access_token: 'pat',
            repository: 'acme/analytics',
            branch: 'main',
            project_sub_path: '/',
            host_domain: 'gitlab.acme.com',
        },
        warehouseConnection: { type: WarehouseTypes.POSTGRES },
    });

    const prepareTurn = (service: AiWritebackService, user: SessionUser) =>
        (service as AnyType).prepareTurn({
            user,
            projectUuid: 'p1',
            aiThreadUuid: undefined,
        });

    it('rejects when the AI writeback feature flag is disabled', async () => {
        const service = buildService({
            featureFlagModel: {
                get: jest.fn().mockResolvedValue({ enabled: false }),
            } as AnyType,
        });
        await expect(prepareTurn(service, userWithOrg(true))).rejects.toThrow(
            ForbiddenError,
        );
    });

    it('rejects when the user cannot manage source code', async () => {
        const service = buildService({
            featureFlagModel: {
                get: jest.fn().mockResolvedValue({ enabled: true }),
            } as AnyType,
            projectModel: {
                get: jest.fn().mockResolvedValue(githubProject()),
            } as AnyType,
        });
        await expect(prepareTurn(service, userWithOrg(false))).rejects.toThrow(
            ForbiddenError,
        );
    });

    it('resolves a fresh turn context for a permitted user', async () => {
        const service = buildService({
            featureFlagModel: {
                get: jest.fn().mockResolvedValue({ enabled: true }),
            } as AnyType,
            projectModel: {
                get: jest.fn().mockResolvedValue(githubProject()),
            } as AnyType,
            aiWritebackThreadModel: {
                findByAiThreadUuid: jest.fn().mockResolvedValue(null),
            } as AnyType,
        });
        await expect(
            prepareTurn(service, userWithOrg(true)),
        ).resolves.toMatchObject({
            organizationUuid: ORG,
            projectName: 'Analytics',
            gitConnection: {
                provider: PullRequestProvider.GITHUB,
                owner: 'acme',
                repo: 'analytics',
                projectSubPath: '.',
            },
            existingRow: null,
            isResume: false,
            warehouseType: WarehouseTypes.POSTGRES,
            dbtVersion: SupportedDbtVersions.V1_9,
        });
    });

    it('resolves the project `latest` dbt version to the newest supported version', async () => {
        const service = buildService({
            featureFlagModel: {
                get: jest.fn().mockResolvedValue({ enabled: true }),
            } as AnyType,
            projectModel: {
                get: jest
                    .fn()
                    .mockResolvedValue(
                        githubProject(DbtVersionOptionLatest.LATEST),
                    ),
            } as AnyType,
            aiWritebackThreadModel: {
                findByAiThreadUuid: jest.fn().mockResolvedValue(null),
            } as AnyType,
        });
        await expect(
            prepareTurn(service, userWithOrg(true)),
        ).resolves.toMatchObject({
            dbtVersion: getLatestSupportDbtVersion(),
        });
    });

    it('clamps a project pinned below the supported range to the oldest installed version', async () => {
        const service = buildService({
            featureFlagModel: {
                get: jest.fn().mockResolvedValue({ enabled: true }),
            } as AnyType,
            projectModel: {
                get: jest
                    .fn()
                    .mockResolvedValue(
                        githubProject(SupportedDbtVersions.V1_5),
                    ),
            } as AnyType,
            aiWritebackThreadModel: {
                findByAiThreadUuid: jest.fn().mockResolvedValue(null),
            } as AnyType,
        });
        await expect(
            prepareTurn(service, userWithOrg(true)),
        ).resolves.toMatchObject({
            dbtVersion: SupportedDbtVersions.V1_8,
        });
    });

    it('resolves a GitLab connection with its host for a GitLab project', async () => {
        const service = buildService({
            featureFlagModel: {
                get: jest.fn().mockResolvedValue({ enabled: true }),
            } as AnyType,
            projectModel: {
                get: jest.fn().mockResolvedValue(gitlabProject()),
            } as AnyType,
            aiWritebackThreadModel: {
                findByAiThreadUuid: jest.fn().mockResolvedValue(null),
            } as AnyType,
        });
        await expect(
            prepareTurn(service, userWithOrg(true)),
        ).resolves.toMatchObject({
            gitConnection: {
                provider: PullRequestProvider.GITLAB,
                owner: 'acme',
                repo: 'analytics',
                projectSubPath: '.',
                hostDomain: 'gitlab.acme.com',
            },
        });
    });
});

describe('AiWritebackService.run (mocked end-to-end)', () => {
    const permittedUser = (): SessionUser => {
        const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
        can('manage', 'SourceCode', { organizationUuid: ORG });
        return {
            userUuid: 'u1',
            organizationUuid: ORG,
            organizationName: 'Acme',
            organizationCreatedAt: new Date(),
            role: 'admin',
            ability: build(),
        } as AnyType;
    };

    // Final assistant message: a reply plus the structured PR title/description.
    const agentReply = (): string =>
        `Done.\n${PR_TITLE_OPEN}Add metric${PR_TITLE_CLOSE}\n` +
        `${PR_DESCRIPTION_OPEN}Adds revenue.${PR_DESCRIPTION_CLOSE}`;

    const fakeSandbox = (
        agentExitCode: number,
        hasChanges: boolean,
    ): AnyType => ({
        sandboxId: 'sbx-1',
        files: {
            write: jest.fn().mockResolvedValue(undefined),
            read: jest.fn().mockResolvedValue('model contents'),
            remove: jest.fn().mockResolvedValue(undefined),
        },
        git: {
            clone: jest.fn().mockResolvedValue(undefined),
            status: jest
                .fn()
                .mockResolvedValue({ hasChanges, currentBranch: 'main' }),
            add: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            createBranch: jest.fn().mockResolvedValue(undefined),
        },
        commands: {
            run: jest.fn(async (command: string, opts: AnyType) => {
                if (command.includes('claude')) {
                    opts?.onStdout?.(
                        `${JSON.stringify({
                            type: 'assistant',
                            message: {
                                content: [{ type: 'text', text: agentReply() }],
                            },
                        })}\n`,
                    );
                    return { exitCode: agentExitCode, stdout: '' };
                }
                if (command.includes('--name-status')) {
                    return { exitCode: 0, stdout: 'A\0models/x.sql\0' };
                }
                return { exitCode: 0, stdout: '' };
            }),
        },
        pause: jest.fn().mockResolvedValue(undefined),
        kill: jest.fn().mockResolvedValue(undefined),
    });

    const runService = (sandbox: AnyType) => {
        const service = buildService({
            lightdashConfig: {
                siteUrl: 'https://app.example',
                gitlab: {},
                appRuntime: {
                    e2bApiKey: 'e2b-key',
                    e2bAiWritebackTemplateName: 'tpl',
                    e2bAiWritebackTemplateTag: '',
                },
                aiWriteback: { anthropicApiKey: 'anthropic-key' },
            } as AnyType,
            featureFlagModel: {
                get: jest.fn(({ featureFlagId }: AnyType) =>
                    Promise.resolve({
                        enabled: featureFlagId === FeatureFlags.AiWriteback,
                    }),
                ),
            } as AnyType,
            projectModel: {
                get: jest.fn().mockResolvedValue({
                    organizationUuid: ORG,
                    name: 'Analytics',
                    dbtConnection: {
                        type: DbtProjectType.GITHUB,
                        authorization_method: 'installation_id',
                        repository: 'acme/analytics',
                        branch: 'main',
                        project_sub_path: '/',
                    },
                    warehouseConnection: null,
                    dbtVersion: SupportedDbtVersions.V1_9,
                }),
            } as AnyType,
            githubAppInstallationsModel: {
                getInstallationId: jest.fn().mockResolvedValue('inst-1'),
                findInstallationId: jest.fn().mockResolvedValue('inst-1'),
                getAuth: jest
                    .fn()
                    .mockResolvedValue({ token: 'oauth', refreshToken: 'r' }),
                updateAuth: jest.fn().mockResolvedValue(undefined),
            } as AnyType,
            aiWritebackThreadModel: {
                findByAiThreadUuid: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue(undefined),
            } as AnyType,
            pullRequestsModel: {
                findOrCreate: jest
                    .fn()
                    .mockResolvedValue({ pullRequestUuid: 'pr-uuid' }),
            } as AnyType,
        });
        return service.run({
            user: permittedUser(),
            projectUuid: 'p1',
            prompt: 'add a revenue metric',
            source: 'web',
        });
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (getInstallationToken as jest.Mock).mockResolvedValue('install-token');
        (getOrRefreshToken as jest.Mock).mockResolvedValue({
            token: 'oauth',
            refreshToken: 'r',
        });
        (getAuthenticatedUser as jest.Mock).mockResolvedValue({
            login: 'octocat',
            id: 1,
        });
        (getAppBotIdentity as jest.Mock).mockResolvedValue({
            login: 'lightdash-bot',
            id: 2,
        });
        (getBranchHeadSha as jest.Mock).mockResolvedValue('base-oid');
        (createPullRequest as jest.Mock).mockResolvedValue({
            html_url: PR_7,
        });
    });

    it('opens a PR and kills the sandbox for a one-shot run with changes', async () => {
        const sandbox = fakeSandbox(0, true);
        (Sandbox.create as jest.Mock).mockResolvedValue(sandbox);

        const result = await runService(sandbox);

        expect(result).toMatchObject({
            output: 'Done.',
            exitCode: 0,
            prUrl: PR_7,
            prAction: 'opened',
            repository: 'acme/analytics',
        });
        expect(createPullRequest).toHaveBeenCalledTimes(1);
        expect(sandbox.kill).toHaveBeenCalledTimes(1);
        expect(sandbox.pause).not.toHaveBeenCalled();

        // The compile wrapper pins `dbt` to the project's version venv (V1_9)
        // and still strips secrets from the compile child's environment.
        const wrapperWrite = (sandbox.files.write as jest.Mock).mock.calls.find(
            ([path]) => path === COMPILE_WRAPPER_PATH,
        );
        expect(wrapperWrite).toBeDefined();
        expect(wrapperWrite[1]).toContain('PATH="/usr/local/dbt1.9/bin:$PATH"');
        expect(wrapperWrite[1]).toContain('-u ANTHROPIC_API_KEY');
    });

    it('skips the PR when the agent exits non-zero', async () => {
        const sandbox = fakeSandbox(1, true);
        (Sandbox.create as jest.Mock).mockResolvedValue(sandbox);

        const result = await runService(sandbox);

        expect(result).toMatchObject({
            exitCode: 1,
            prUrl: null,
            prAction: null,
        });
        expect(createPullRequest).not.toHaveBeenCalled();
        expect(sandbox.kill).toHaveBeenCalledTimes(1);
    });

    it('opens no PR when the agent produced no changes', async () => {
        const sandbox = fakeSandbox(0, false);
        (Sandbox.create as jest.Mock).mockResolvedValue(sandbox);

        const result = await runService(sandbox);

        expect(result).toMatchObject({
            exitCode: 0,
            prUrl: null,
            prAction: null,
        });
        expect(createPullRequest).not.toHaveBeenCalled();
        expect(sandbox.kill).toHaveBeenCalledTimes(1);
    });
});

describe('AiWritebackService repo read access', () => {
    const userWithOrg = (canView: boolean): SessionUser => {
        const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
        // `manage` implies `view`; grant nothing to model a user without access.
        if (canView) can('manage', 'SourceCode', { organizationUuid: ORG });
        return {
            userUuid: 'u1',
            organizationUuid: ORG,
            organizationName: 'Acme',
            organizationCreatedAt: new Date(),
            role: 'admin',
            ability: build(),
        } as AnyType;
    };

    const githubProject = (): AnyType => ({
        organizationUuid: ORG,
        name: 'Analytics',
        dbtConnection: {
            type: DbtProjectType.GITHUB,
            authorization_method: 'installation_id',
            repository: 'acme/analytics',
            branch: 'main',
            project_sub_path: 'transform/dbt',
        },
        warehouseConnection: { type: WarehouseTypes.POSTGRES },
        dbtVersion: SupportedDbtVersions.V1_9,
    });

    const buildWithInstallation = (project: AnyType = githubProject()) => {
        const service = buildService({
            projectModel: {
                get: jest.fn().mockResolvedValue(project),
            } as AnyType,
        });
        const resolveInstallation = jest.spyOn(
            (service as AnyType).githubProvider,
            'resolveInstallation',
        );
        resolveInstallation.mockResolvedValue({
            provider: PullRequestProvider.GITHUB,
            installationId: 'inst-1',
            token: 'install-token',
            userToken: null,
            commitAuthor: { name: 'n', email: 'e' },
            coAuthorTrailer: '',
        } as AnyType);
        return { service, resolveInstallation };
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getRepoReadAccess (dbt project repo, unchanged contract)', () => {
        it('returns the dbt repo owner/repo/branch/token/subPath', async () => {
            const { service } = buildWithInstallation();
            await expect(
                service.getRepoReadAccess({
                    user: userWithOrg(true),
                    projectUuid: 'p1',
                }),
            ).resolves.toEqual({
                owner: 'acme',
                repo: 'analytics',
                branch: 'main',
                token: 'install-token',
                subPath: 'transform/dbt',
            });
            // Branch came from the connection; no default-branch lookup.
            expect(getRepoDefaultBranch).not.toHaveBeenCalled();
        });

        it('rejects a user without view:SourceCode', async () => {
            const { service } = buildWithInstallation();
            await expect(
                service.getRepoReadAccess({
                    user: userWithOrg(false),
                    projectUuid: 'p1',
                }),
            ).rejects.toThrow(ForbiddenError);
        });
    });

    describe('getInstallationRepoReadAccess (any accessible repo)', () => {
        it('rejects a user without view:SourceCode', async () => {
            const { service } = buildWithInstallation();
            await expect(
                service.getInstallationRepoReadAccess({
                    user: userWithOrg(false),
                    projectUuid: 'p1',
                }),
            ).rejects.toThrow(ForbiddenError);
        });

        it('listRepos lists repos for the resolved installation and maps the shape', async () => {
            const { service } = buildWithInstallation();
            (
                listReposAccessibleToInstallation as jest.Mock
            ).mockResolvedValue([
                {
                    owner: 'lightdash',
                    repo: 'lightdash',
                    defaultBranch: 'main',
                    private: false,
                },
            ]);

            const access = await service.getInstallationRepoReadAccess({
                user: userWithOrg(true),
                projectUuid: 'p1',
            });
            const repos = await access.listRepos();

            expect(listReposAccessibleToInstallation).toHaveBeenCalledWith({
                installationId: 'inst-1',
            });
            expect(repos).toEqual([
                {
                    owner: 'lightdash',
                    repo: 'lightdash',
                    defaultBranch: 'main',
                    private: false,
                },
            ]);
            expect(access.token).toBe('install-token');
        });

        it('resolveBranch returns the repo default branch via the installation', async () => {
            const { service } = buildWithInstallation();
            (getRepoDefaultBranch as jest.Mock).mockResolvedValue('develop');

            const access = await service.getInstallationRepoReadAccess({
                user: userWithOrg(true),
                projectUuid: 'p1',
            });
            const branch = await access.resolveBranch('lightdash', 'lightdash');

            expect(getRepoDefaultBranch).toHaveBeenCalledWith({
                owner: 'lightdash',
                repo: 'lightdash',
                installationId: 'inst-1',
            });
            expect(branch).toBe('develop');
        });
    });
});
