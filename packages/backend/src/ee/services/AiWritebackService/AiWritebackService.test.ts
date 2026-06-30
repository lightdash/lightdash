import { Ability, AbilityBuilder } from '@casl/ability';
import {
    AnyType,
    DbtProjectType,
    DbtVersionOptionLatest,
    FeatureFlags,
    ForbiddenError,
    getLatestSupportDbtVersion,
    PullRequestProvider,
    RequestMethod,
    SupportedDbtVersions,
    WarehouseTypes,
    type MemberAbility,
    type SessionUser,
} from '@lightdash/common';
import {
    createPullRequest,
    getAppBotIdentity,
    getAuthenticatedUser,
    getBranchHeadSha,
    getInstallationToken,
    getOrRefreshToken,
    getRepoDefaultBranch,
    listReposAccessibleToInstallation,
    listReposAccessibleToUser,
} from '../../../clients/github/Github';
import { createSandboxManager, SandboxManager } from '../SandboxRuntime';
import {
    AiWritebackService,
    mergeSourceCodeRepoAccess,
} from './AiWritebackService';
import {
    COMPILE_WRAPPER_PATH,
    PR_DESCRIPTION_CLOSE,
    PR_DESCRIPTION_OPEN,
    PR_TITLE_CLOSE,
    PR_TITLE_OPEN,
} from './constants';

// Stub e2b and the GitHub/octokit client so the run() tests drive fakes and the
// unit tests below never reach the real SDKs.
vi.mock('e2b', () => ({
    Sandbox: { create: vi.fn(), connect: vi.fn() },
    CommandExitError: class CommandExitError extends Error {},
    TimeoutError: class TimeoutError extends Error {},
    ALL_TRAFFIC: 'all',
}));
// The service talks to a SandboxManager over a provider, never a concrete SDK.
// Keep the real SandboxManager + error classes (the service branches on them
// with instanceof) but stub the manager factory so the run() tests wrap a fake
// provider in a real manager.
vi.mock('../SandboxRuntime', async () => ({
    ...(await vi.importActual<typeof import('../SandboxRuntime')>(
        '../SandboxRuntime',
    )),
    createSandboxManager: vi.fn(),
}));
vi.mock('../../../clients/github/Github', () => ({
    createBranch: vi.fn().mockResolvedValue(undefined),
    createPullRequest: vi.fn(),
    createSignedCommitOnBranch: vi
        .fn()
        .mockResolvedValue({ oid: 'sha-7', url: 'https://github.com/c/o' }),
    getAppBotIdentity: vi.fn(),
    getAuthenticatedUser: vi.fn(),
    getBranchHeadSha: vi.fn(),
    getInstallationToken: vi.fn(),
    getOrRefreshToken: vi.fn(),
    getRepoDefaultBranch: vi.fn(),
    getRepoTree: vi.fn(),
    listReposAccessibleToInstallation: vi.fn(),
    listReposAccessibleToUser: vi.fn(),
    updatePullRequest: vi.fn().mockResolvedValue(undefined),
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
        analytics: { track: vi.fn() } as AnyType,
        projectModel: { get: vi.fn() } as AnyType,
        featureFlagModel: { get: vi.fn() } as AnyType,
        githubAppInstallationsModel: {} as AnyType,
        githubAppService: {
            getValidUserToken: vi.fn().mockResolvedValue(undefined),
        } as AnyType,
        gitlabAppInstallationsModel: {} as AnyType,
        aiWritebackThreadModel: { findByAiThreadUuid: vi.fn() } as AnyType,
        sandboxRegistryModel: {
            create: vi.fn().mockResolvedValue('sbx-uuid'),
            findBySandboxUuid: vi.fn().mockResolvedValue(null),
            markRunning: vi.fn().mockResolvedValue(undefined),
            markSuspended: vi.fn().mockResolvedValue(undefined),
            touch: vi.fn().mockResolvedValue(undefined),
            deleteBySandboxUuid: vi.fn().mockResolvedValue(undefined),
            findIdleRunning: vi.fn().mockResolvedValue([]),
            findExpiredSuspended: vi.fn().mockResolvedValue([]),
        } as AnyType,
        pullRequestsModel: {} as AnyType,
        ciService: { mergePullRequest: vi.fn() } as AnyType,
        projectService: { scheduleCompileProject: vi.fn() } as AnyType,
        ...overrides,
    });

// A stand-in GitProvider so applyAgentChanges/run stay provider-agnostic in
// tests — the host-specific behaviour is covered by the provider unit tests.
const fakeProvider = (overrides: AnyType = {}): AnyType => ({
    provider: PullRequestProvider.GITHUB,
    supportsPreviewDeploy: true,
    resolveConnection: vi.fn(),
    resolveInstallation: vi.fn(),
    getCloneTarget: vi.fn(),
    openPullRequest: vi.fn().mockResolvedValue({ prUrl: PR_7, ...LANDED }),
    updatePullRequest: vi.fn().mockResolvedValue({ ...LANDED }),
    adoptPullRequest: vi.fn(),
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
    sandbox_uuid: 'sbx-1',
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
        const record = vi
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
            sandboxUuid: 'sbx-uuid',
            installation: {
                provider: PullRequestProvider.GITHUB,
                installationId: 'inst-1',
            },
            adoptedPr: null,
            turn: turnContext({ provider, ...(args.turnOverrides ?? {}) }),
            user: { userUuid: 'u1' },
            projectUuid: 'p1',
            aiThreadUuid: undefined,
            setStage: vi.fn(),
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
                get: vi.fn().mockResolvedValue({ enabled: false }),
            } as AnyType,
        });
        await expect(prepareTurn(service, userWithOrg(true))).rejects.toThrow(
            ForbiddenError,
        );
    });

    it('rejects when the user cannot manage source code', async () => {
        const service = buildService({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as AnyType,
            projectModel: {
                get: vi.fn().mockResolvedValue(githubProject()),
            } as AnyType,
        });
        await expect(prepareTurn(service, userWithOrg(false))).rejects.toThrow(
            ForbiddenError,
        );
    });

    it('resolves a fresh turn context for a permitted user', async () => {
        const service = buildService({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as AnyType,
            projectModel: {
                get: vi.fn().mockResolvedValue(githubProject()),
            } as AnyType,
            aiWritebackThreadModel: {
                findByAiThreadUuid: vi.fn().mockResolvedValue(null),
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
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as AnyType,
            projectModel: {
                get: vi
                    .fn()
                    .mockResolvedValue(
                        githubProject(DbtVersionOptionLatest.LATEST),
                    ),
            } as AnyType,
            aiWritebackThreadModel: {
                findByAiThreadUuid: vi.fn().mockResolvedValue(null),
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
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as AnyType,
            projectModel: {
                get: vi
                    .fn()
                    .mockResolvedValue(
                        githubProject(SupportedDbtVersions.V1_5),
                    ),
            } as AnyType,
            aiWritebackThreadModel: {
                findByAiThreadUuid: vi.fn().mockResolvedValue(null),
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
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as AnyType,
            projectModel: {
                get: vi.fn().mockResolvedValue(gitlabProject()),
            } as AnyType,
            aiWritebackThreadModel: {
                findByAiThreadUuid: vi.fn().mockResolvedValue(null),
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
            write: vi.fn().mockResolvedValue(undefined),
            read: vi.fn().mockResolvedValue('model contents'),
            remove: vi.fn().mockResolvedValue(undefined),
        },
        git: {
            clone: vi.fn().mockResolvedValue(undefined),
            status: vi
                .fn()
                .mockResolvedValue({ hasChanges, currentBranch: 'main' }),
            add: vi.fn().mockResolvedValue(undefined),
            commit: vi.fn().mockResolvedValue(undefined),
            createBranch: vi.fn().mockResolvedValue(undefined),
        },
        commands: {
            run: vi.fn(async (command: string, opts: AnyType) => {
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
        pause: vi.fn().mockResolvedValue(undefined),
    });

    // A fake SandboxProvider over the fake sandbox. create/connect hand back the
    // sandbox; destroy/pause are the control-plane calls the service makes to
    // tear the sandbox down or keep it warm.
    const fakeSandboxProvider = {
        capabilities: {
            isolation: 'microvm',
            pauseResume: true,
            egressAllowlist: true,
            warmPool: false,
            persistence: 'memory',
        },
        create: vi.fn(),
        connect: vi.fn(),
        destroy: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn().mockResolvedValue(undefined),
        persist: vi
            .fn()
            .mockResolvedValue({ kind: 'e2b-paused', sandboxId: 'sb-test' }),
        resume: vi.fn(),
        deleteSnapshot: vi.fn().mockResolvedValue(undefined),
    };

    const runService = (sandbox: AnyType) => {
        const service = buildService({
            lightdashConfig: {
                siteUrl: 'https://app.example',
                gitlab: {},
                appRuntime: {
                    e2bApiKey: 'e2b-key',
                    e2bAiWritebackTemplateName: 'tpl',
                    e2bAiWritebackTemplateTag: '',
                    sandboxProvider: 'e2b',
                    sandboxAiWritebackDockerImage:
                        'lightdash-ai-writeback:local',
                    sandboxIdleTimeoutMs: 30 * 60 * 1000,
                    sandboxSnapshotRetentionMs: 7 * 24 * 60 * 60 * 1000,
                },
                aiWriteback: { anthropicApiKey: 'anthropic-key' },
            } as AnyType,
            featureFlagModel: {
                get: vi.fn(({ featureFlagId }: AnyType) =>
                    Promise.resolve({
                        enabled: featureFlagId === FeatureFlags.AiWriteback,
                    }),
                ),
            } as AnyType,
            projectModel: {
                get: vi.fn().mockResolvedValue({
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
                getInstallationId: vi.fn().mockResolvedValue('inst-1'),
                findInstallationId: vi.fn().mockResolvedValue('inst-1'),
                getAuth: vi
                    .fn()
                    .mockResolvedValue({ token: 'oauth', refreshToken: 'r' }),
                updateAuth: vi.fn().mockResolvedValue(undefined),
            } as AnyType,
            aiWritebackThreadModel: {
                findByAiThreadUuid: vi.fn().mockResolvedValue(null),
                create: vi.fn().mockResolvedValue(undefined),
            } as AnyType,
            pullRequestsModel: {
                findOrCreate: vi
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
        vi.clearAllMocks();
        fakeSandboxProvider.destroy.mockResolvedValue(undefined);
        fakeSandboxProvider.pause.mockResolvedValue(undefined);
        // Wrap the fake provider in a real SandboxManager, threading the
        // service's own fake registry model through.
        (createSandboxManager as import('vitest').Mock).mockImplementation(
            (opts: AnyType) =>
                new SandboxManager({
                    provider: fakeSandboxProvider as AnyType,
                    providerKind: 'e2b',
                    registryModel: opts.registryModel,
                    logger: opts.logger,
                    idleTimeoutMs: opts.idleTimeoutMs ?? 0,
                    snapshotRetentionMs: opts.snapshotRetentionMs ?? 0,
                }),
        );
        (getInstallationToken as import('vitest').Mock).mockResolvedValue(
            'install-token',
        );
        (getOrRefreshToken as import('vitest').Mock).mockResolvedValue({
            token: 'oauth',
            refreshToken: 'r',
        });
        (getAuthenticatedUser as import('vitest').Mock).mockResolvedValue({
            login: 'octocat',
            id: 1,
        });
        (getAppBotIdentity as import('vitest').Mock).mockResolvedValue({
            login: 'lightdash-bot',
            id: 2,
        });
        (getBranchHeadSha as import('vitest').Mock).mockResolvedValue(
            'base-oid',
        );
        (createPullRequest as import('vitest').Mock).mockResolvedValue({
            html_url: PR_7,
        });
    });

    it('opens a PR and kills the sandbox for a one-shot run with changes', async () => {
        const sandbox = fakeSandbox(0, true);
        fakeSandboxProvider.create.mockResolvedValue(sandbox);

        const result = await runService(sandbox);

        expect(result).toMatchObject({
            output: 'Done.',
            exitCode: 0,
            prUrl: PR_7,
            prAction: 'opened',
            repository: 'acme/analytics',
        });
        expect(createPullRequest).toHaveBeenCalledTimes(1);
        expect(fakeSandboxProvider.destroy).toHaveBeenCalledTimes(1);
        expect(sandbox.pause).not.toHaveBeenCalled();

        // The compile wrapper pins `dbt` to the project's version venv (V1_9)
        // and still strips secrets from the compile child's environment.
        const wrapperWrite = (
            sandbox.files.write as import('vitest').Mock
        ).mock.calls.find(([path]) => path === COMPILE_WRAPPER_PATH);
        expect(wrapperWrite).toBeDefined();
        if (!wrapperWrite) throw new Error('Expected compile wrapper write');
        expect(wrapperWrite[1]).toContain('PATH="/usr/local/dbt1.9/bin:$PATH"');
        expect(wrapperWrite[1]).toContain('-u ANTHROPIC_API_KEY');
    });

    it('skips the PR when the agent exits non-zero', async () => {
        const sandbox = fakeSandbox(1, true);
        fakeSandboxProvider.create.mockResolvedValue(sandbox);

        const result = await runService(sandbox);

        expect(result).toMatchObject({
            exitCode: 1,
            prUrl: null,
            prAction: null,
        });
        expect(createPullRequest).not.toHaveBeenCalled();
        expect(fakeSandboxProvider.destroy).toHaveBeenCalledTimes(1);
    });

    it('opens no PR when the agent produced no changes', async () => {
        const sandbox = fakeSandbox(0, false);
        fakeSandboxProvider.create.mockResolvedValue(sandbox);

        const result = await runService(sandbox);

        expect(result).toMatchObject({
            exitCode: 0,
            prUrl: null,
            prAction: null,
        });
        expect(createPullRequest).not.toHaveBeenCalled();
        expect(fakeSandboxProvider.destroy).toHaveBeenCalledTimes(1);
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

    const gitlabProject = (): AnyType => ({
        organizationUuid: ORG,
        name: 'Analytics',
        dbtConnection: {
            type: DbtProjectType.GITLAB,
            personal_access_token: 'pat',
            repository: 'acme/analytics',
            branch: 'main',
            project_sub_path: 'transform/dbt',
            host_domain: 'gitlab.acme.com',
        },
        warehouseConnection: { type: WarehouseTypes.POSTGRES },
        dbtVersion: SupportedDbtVersions.V1_9,
    });

    const buildWithInstallation = (project: AnyType = githubProject()) => {
        const githubAppService = {
            getValidUserToken: vi.fn().mockResolvedValue(undefined),
        } as AnyType;
        const service = buildService({
            projectModel: {
                get: vi.fn().mockResolvedValue(project),
            } as AnyType,
            githubAppService,
        });
        const resolveInstallation = vi.spyOn(
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
        return { service, resolveInstallation, githubAppService };
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getRepoReadAccess (dbt project repo, provider-tagged)', () => {
        it('returns github-tagged access for a GitHub dbt connection', async () => {
            const { service } = buildWithInstallation();
            await expect(
                service.getRepoReadAccess({
                    user: userWithOrg(true),
                    projectUuid: 'p1',
                }),
            ).resolves.toEqual({
                provider: 'github',
                owner: 'acme',
                repo: 'analytics',
                branch: 'main',
                token: 'install-token',
                subPath: 'transform/dbt',
            });
            // Branch came from the connection; no default-branch lookup.
            expect(getRepoDefaultBranch).not.toHaveBeenCalled();
        });

        it('returns gitlab-tagged access (with hostDomain) for a GitLab dbt connection', async () => {
            const { service } = buildWithInstallation(gitlabProject());
            vi.spyOn(
                (service as AnyType).gitlabProvider,
                'resolveInstallation',
            ).mockResolvedValue({
                provider: PullRequestProvider.GITLAB,
                token: 'gitlab-install-token',
                instanceUrl: 'https://gitlab.acme.com',
                commitAuthor: { name: 'n', email: 'e' },
            } as AnyType);
            await expect(
                service.getRepoReadAccess({
                    user: userWithOrg(true),
                    projectUuid: 'p1',
                }),
            ).resolves.toEqual({
                provider: 'gitlab',
                owner: 'acme',
                repo: 'analytics',
                branch: 'main',
                token: 'gitlab-install-token',
                hostDomain: 'gitlab.acme.com',
                subPath: 'transform/dbt',
            });
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
                listReposAccessibleToInstallation as import('vitest').Mock
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
            expect(access.installationToken).toBe('install-token');
            // No linked user token → the user listing is never fetched.
            expect(listReposAccessibleToUser).not.toHaveBeenCalled();
        });

        it('unions the linked user repos with the org repos (org wins on collision)', async () => {
            const { service, githubAppService } = buildWithInstallation();
            (
                githubAppService.getValidUserToken as import('vitest').Mock
            ).mockResolvedValue('user-token');
            (
                listReposAccessibleToUser as import('vitest').Mock
            ).mockResolvedValue([
                {
                    owner: 'me',
                    repo: 'personal',
                    defaultBranch: 'main',
                    private: true,
                },
                {
                    owner: 'acme',
                    repo: 'shared',
                    defaultBranch: 'main',
                    private: true,
                },
            ]);
            (
                listReposAccessibleToInstallation as import('vitest').Mock
            ).mockResolvedValue([
                {
                    owner: 'acme',
                    repo: 'shared',
                    defaultBranch: 'main',
                    private: false,
                },
                {
                    owner: 'acme',
                    repo: 'data',
                    defaultBranch: 'main',
                    private: false,
                },
            ]);

            const access = await service.getInstallationRepoReadAccess({
                user: userWithOrg(true),
                projectUuid: 'p1',
            });
            const repos = await access.listRepos();

            // union of both sources, deduped by owner/repo
            expect(repos.map((r) => `${r.owner}/${r.repo}`).sort()).toEqual([
                'acme/data',
                'acme/shared',
                'me/personal',
            ]);
            // personal repo reads with the user token...
            expect(await access.resolveRepoAccess('me', 'personal')).toEqual({
                branch: 'main',
                token: 'user-token',
            });
            // ...the org installation wins the collision, so its token reads it.
            expect(await access.resolveRepoAccess('acme', 'shared')).toEqual({
                branch: 'main',
                token: 'install-token',
            });
        });

        it('resolveRepoAccess falls back to the installation token for a repo outside the union', async () => {
            const { service } = buildWithInstallation();
            (
                listReposAccessibleToInstallation as import('vitest').Mock
            ).mockResolvedValue([]);
            (getRepoDefaultBranch as import('vitest').Mock).mockResolvedValue(
                'develop',
            );

            const access = await service.getInstallationRepoReadAccess({
                user: userWithOrg(true),
                projectUuid: 'p1',
            });
            const resolved = await access.resolveRepoAccess(
                'lightdash',
                'lightdash',
            );

            expect(getRepoDefaultBranch).toHaveBeenCalledWith({
                owner: 'lightdash',
                repo: 'lightdash',
                installationId: 'inst-1',
            });
            expect(resolved).toEqual({
                branch: 'develop',
                token: 'install-token',
            });
        });
    });
});

describe('AiWritebackService.mergePullRequest', () => {
    const gitProject = (): AnyType => ({
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
    });

    const nonGitProject = (): AnyType => ({
        organizationUuid: ORG,
        name: 'Analytics',
        dbtConnection: { type: DbtProjectType.NONE },
        warehouseConnection: { type: WarehouseTypes.POSTGRES },
    });

    const mergeArgs = {
        user: { userUuid: 'u1' } as AnyType,
        projectUuid: 'p1',
        prUrl: PR_7,
        sha: 'sha-7',
    };

    const setup = (overrides: Record<string, AnyType> = {}) => {
        const mergePullRequest = vi
            .fn()
            .mockResolvedValue({ merged: true, sha: 'sha-7' });
        const scheduleCompileProject = vi
            .fn()
            .mockResolvedValue({ jobUuid: 'job-1' });
        const get = vi.fn().mockResolvedValue(gitProject());
        const service = buildService({
            projectModel: { get } as AnyType,
            ciService: { mergePullRequest } as AnyType,
            projectService: { scheduleCompileProject } as AnyType,
            ...overrides,
        });
        return { service, mergePullRequest, scheduleCompileProject, get };
    };

    it('schedules a recompile after a successful merge of a git project', async () => {
        const { service, scheduleCompileProject } = setup();
        const result = await service.mergePullRequest(mergeArgs);
        expect(result).toEqual({ merged: true, sha: 'sha-7' });
        expect(scheduleCompileProject).toHaveBeenCalledTimes(1);
        expect(scheduleCompileProject).toHaveBeenCalledWith(
            mergeArgs.user,
            'p1',
            RequestMethod.BACKEND,
            true,
        );
    });

    it('does not schedule a recompile when the PR was not merged', async () => {
        const { service, scheduleCompileProject, get } = setup({
            ciService: {
                mergePullRequest: vi
                    .fn()
                    .mockResolvedValue({ merged: false, sha: null }),
            } as AnyType,
        });
        const result = await service.mergePullRequest(mergeArgs);
        expect(result).toEqual({ merged: false, sha: null });
        expect(get).not.toHaveBeenCalled();
        expect(scheduleCompileProject).not.toHaveBeenCalled();
    });

    it('skips the recompile for a non-git project', async () => {
        const { service, scheduleCompileProject } = setup({
            projectModel: {
                get: vi.fn().mockResolvedValue(nonGitProject()),
            } as AnyType,
        });
        const result = await service.mergePullRequest(mergeArgs);
        expect(result).toEqual({ merged: true, sha: 'sha-7' });
        expect(scheduleCompileProject).not.toHaveBeenCalled();
    });

    it('still returns the merge result when scheduling the recompile fails', async () => {
        const { service } = setup({
            projectService: {
                scheduleCompileProject: vi
                    .fn()
                    .mockRejectedValue(new Error('scheduler down')),
            } as AnyType,
        });
        await expect(service.mergePullRequest(mergeArgs)).resolves.toEqual({
            merged: true,
            sha: 'sha-7',
        });
    });

    const userWithOrg = { userUuid: 'u1', organizationUuid: ORG } as AnyType;

    it('tracks ai_writeback.merged with the parsed PR context on a successful git merge', async () => {
        const track = vi.fn();
        const { service } = setup({ analytics: { track } as AnyType });
        await service.mergePullRequest({ ...mergeArgs, user: userWithOrg });
        expect(track).toHaveBeenCalledTimes(1);
        expect(track).toHaveBeenCalledWith({
            event: 'ai_writeback.merged',
            userId: 'u1',
            properties: {
                organizationId: ORG,
                projectId: 'p1',
                prUrl: PR_7,
                owner: 'acme',
                repo: 'analytics',
                pullNumber: 7,
                mergeCommitSha: 'sha-7',
                compileScheduled: true,
            },
        });
    });

    it('tracks the merge with compileScheduled=false for a non-git project', async () => {
        const track = vi.fn();
        const { service } = setup({
            analytics: { track } as AnyType,
            projectModel: {
                get: vi.fn().mockResolvedValue(nonGitProject()),
            } as AnyType,
        });
        await service.mergePullRequest({ ...mergeArgs, user: userWithOrg });
        expect(track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'ai_writeback.merged',
                properties: expect.objectContaining({
                    compileScheduled: false,
                }),
            }),
        );
    });

    it('does not track ai_writeback.merged when the PR was not merged', async () => {
        const track = vi.fn();
        const { service } = setup({
            analytics: { track } as AnyType,
            ciService: {
                mergePullRequest: vi
                    .fn()
                    .mockResolvedValue({ merged: false, sha: null }),
            } as AnyType,
        });
        await service.mergePullRequest({ ...mergeArgs, user: userWithOrg });
        expect(track).not.toHaveBeenCalled();
    });

    it('leaves owner/repo/pullNumber null when the PR URL is not a github.com link', async () => {
        const track = vi.fn();
        const { service } = setup({ analytics: { track } as AnyType });
        await service.mergePullRequest({
            ...mergeArgs,
            user: userWithOrg,
            prUrl: 'https://gitlab.com/acme/analytics/-/merge_requests/3',
        });
        expect(track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'ai_writeback.merged',
                properties: expect.objectContaining({
                    owner: null,
                    repo: null,
                    pullNumber: null,
                    prUrl: 'https://gitlab.com/acme/analytics/-/merge_requests/3',
                }),
            }),
        );
    });
});

describe('mergeSourceCodeRepoAccess', () => {
    const u = (owner: string, repo: string) => ({
        owner,
        repo,
        defaultBranch: 'main',
        private: true,
    });

    it('returns only the installation repos when there is no user token', () => {
        const map = mergeSourceCodeRepoAccess(
            [u('me', 'personal')],
            undefined,
            [u('acme', 'data')],
            'inst-token',
        );
        expect([...map.keys()]).toEqual(['acme/data']);
        expect(map.get('acme/data')?.token).toBe('inst-token');
    });

    it('unions both sources and lets the installation win a collision', () => {
        const map = mergeSourceCodeRepoAccess(
            [u('me', 'personal'), u('acme', 'shared')],
            'user-token',
            [u('acme', 'shared'), u('acme', 'data')],
            'inst-token',
        );
        expect([...map.keys()].sort()).toEqual([
            'acme/data',
            'acme/shared',
            'me/personal',
        ]);
        expect(map.get('me/personal')?.token).toBe('user-token');
        expect(map.get('acme/shared')?.token).toBe('inst-token'); // org wins
    });
});
