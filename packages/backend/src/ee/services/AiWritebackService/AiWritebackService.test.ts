import { Ability, AbilityBuilder } from '@casl/ability';
import {
    AnyType,
    DbtProjectType,
    DbtVersionOptionLatest,
    FeatureFlags,
    ForbiddenError,
    getLatestSupportDbtVersion,
    ParameterError,
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
    getRepoMetadata,
    getScopedRepoCloneToken,
    listReposAccessibleToInstallation,
    listReposAccessibleToUser,
    revokeInstallationToken,
} from '../../../clients/github/Github';
import { createSandboxManager, SandboxManager } from '../SandboxRuntime';
import {
    AiWritebackService,
    auditReasonForError,
    computeWritableRepoKeys,
    mergeSourceCodeRepoAccess,
    parseOwnerRepo,
    workstreamLockKey,
} from './AiWritebackService';
import {
    COMPILE_WRAPPER_PATH,
    GENERAL_ALLOWED_TOOLS,
    GENERAL_DISALLOWED_TOOLS,
    MAX_CONCURRENT_WORKSTREAM_TURNS_PER_THREAD,
    PR_DESCRIPTION_CLOSE,
    PR_DESCRIPTION_OPEN,
    PR_TITLE_CLOSE,
    PR_TITLE_OPEN,
} from './constants';
import { DeniedPathError } from './deniedPaths';
import {
    RepoTooLargeError,
    WritebackGitNotConnectedError,
    WritebackThreadPrClosedError,
} from './errors';

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
    getRepoMetadata: vi
        .fn()
        .mockResolvedValue({ defaultBranch: 'main', sizeKb: 1024 }),
    getRepoTree: vi.fn(),
    getScopedRepoCloneToken: vi.fn().mockResolvedValue('scoped-clone-token'),
    listReposAccessibleToInstallation: vi.fn(),
    listReposAccessibleToUser: vi.fn(),
    revokeInstallationToken: vi.fn().mockResolvedValue(undefined),
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
        // Default: no additional dbt sources, so the single-source (primary)
        // path is taken unless a test overrides this.
        projectDbtSourcesModel: {
            getSources: vi.fn().mockResolvedValue([]),
        } as AnyType,
        featureFlagModel: { get: vi.fn() } as AnyType,
        githubAppInstallationsModel: {} as AnyType,
        githubAppService: {
            getValidUserToken: vi.fn().mockResolvedValue(undefined),
        } as AnyType,
        gitlabAppInstallationsModel: {} as AnyType,
        aiWritebackThreadModel: { findByAiThreadUuid: vi.fn() } as AnyType,
        aiWritebackRunModel: {
            create: vi.fn(),
            findByUuid: vi.fn(),
            updateStageIfInProgress: vi.fn().mockResolvedValue(undefined),
            markReady: vi.fn().mockResolvedValue(true),
            markError: vi.fn().mockResolvedValue(true),
            setBranchName: vi.fn().mockResolvedValue(undefined),
        } as AnyType,
        userModel: { findSessionUserAndOrgByUuid: vi.fn() } as AnyType,
        schedulerClient: { aiWritebackPipeline: vi.fn() } as AnyType,
        sandboxRegistryModel: {
            create: vi.fn().mockResolvedValue('sbx-uuid'),
            findBySandboxUuid: vi.fn().mockResolvedValue(null),
            markRunning: vi.fn().mockResolvedValue(undefined),
            markSuspended: vi.fn().mockResolvedValue(undefined),
            deleteBySandboxUuid: vi.fn().mockResolvedValue(undefined),
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

    // prepareTurn now returns a discriminated union ({ kind: 'run', turn } |
    // { kind: 'select', ... }); unwrap the turn so these single-source tests keep
    // asserting on the turn context directly. Rejections still propagate.
    const prepareTurn = async (
        service: AiWritebackService,
        user: SessionUser,
    ) => {
        const prepared = await (service as AnyType).prepareTurn({
            user,
            projectUuid: 'p1',
            prompt: 'add a revenue metric',
            aiThreadUuid: undefined,
            dbtSourceUuid: undefined,
        });
        return prepared.kind === 'run' ? prepared.turn : prepared;
    };

    it('rejects when the user cannot manage source code', async () => {
        const service = buildService({
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

    // Workstream routing: a thread can hold several PRs per repo, so the resume
    // row is selected, not just looked up by repo. The row carries a live PR url
    // so the resume path is taken (a null pr_url now means the PR was deleted and
    // the turn restarts fresh — see the stale-PR recovery test, M4).
    const workstreamRow = {
        ai_writeback_thread_uuid: 'w1',
        ai_thread_uuid: 't1',
        sandbox_id: 's1',
        target_repo: 'acme/analytics',
        pr_url: PR_3,
    };

    it('continues the active workstream for the repo by default (unchanged path)', async () => {
        const findActiveWorkstreamByRepo = vi
            .fn()
            .mockResolvedValue(workstreamRow);
        const findByAiThreadUuidAndPrUrl = vi.fn();
        const service = buildService({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as AnyType,
            projectModel: {
                get: vi.fn().mockResolvedValue(githubProject()),
            } as AnyType,
            aiWritebackThreadModel: {
                findByAiThreadUuid: vi.fn().mockResolvedValue(null),
                findActiveWorkstreamByRepo,
                findByAiThreadUuidAndPrUrl,
            } as AnyType,
        });
        // A live PR triggers the edit-state guard, so stub the provider calls.
        vi.spyOn(
            (service as AnyType).githubProvider,
            'resolveInstallation',
        ).mockResolvedValue({
            provider: PullRequestProvider.GITHUB,
            installationId: 'inst-1',
            token: 'install-token',
            userToken: null,
            commitAuthor: { name: 'n', email: 'e' },
            coAuthorTrailer: '',
        } as AnyType);
        vi.spyOn(
            (service as AnyType).githubProvider,
            'getPullRequestEditState',
        ).mockResolvedValue({ editable: true, reason: null });

        const turn = await (service as AnyType).prepareTurn({
            user: userWithOrg(true),
            projectUuid: 'p1',
            aiThreadUuid: 't1',
        });

        expect(findActiveWorkstreamByRepo).toHaveBeenCalledWith(
            't1',
            'acme/analytics',
        );
        expect(findByAiThreadUuidAndPrUrl).not.toHaveBeenCalled();
        expect(turn).toMatchObject({
            kind: 'run',
            turn: {
                existingRow: workstreamRow,
                isResume: true,
            },
        });
    });

    it('forces a fresh workstream when startNewPullRequest is set', async () => {
        const findActiveWorkstreamByRepo = vi.fn();
        const findByAiThreadUuidAndPrUrl = vi.fn();
        const service = buildService({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as AnyType,
            projectModel: {
                get: vi.fn().mockResolvedValue(githubProject()),
            } as AnyType,
            aiWritebackThreadModel: {
                findByAiThreadUuid: vi.fn().mockResolvedValue(null),
                findActiveWorkstreamByRepo,
                findByAiThreadUuidAndPrUrl,
            } as AnyType,
        });

        const turn = await (service as AnyType).prepareTurn({
            user: userWithOrg(true),
            projectUuid: 'p1',
            aiThreadUuid: 't1',
            startNewPullRequest: true,
        });

        expect(findActiveWorkstreamByRepo).not.toHaveBeenCalled();
        expect(findByAiThreadUuidAndPrUrl).not.toHaveBeenCalled();
        expect(turn).toMatchObject({
            kind: 'run',
            turn: { existingRow: null, isResume: false },
        });
    });

    // Change C: `prUrl` routing is no longer gated on `mode === 'general'`, so a
    // dbt-writeback thread can resume a specific one of its own workstreams by
    // URL. This asserts the by-URL lookup is taken (not the repo-level resume).
    it('resumes a specific pull request by prUrl, regardless of mode (change C)', async () => {
        const findActiveWorkstreamByRepo = vi.fn();
        const findByAiThreadUuidAndPrUrl = vi
            .fn()
            .mockResolvedValue(workstreamRow);
        const service = buildService({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as AnyType,
            projectModel: {
                get: vi.fn().mockResolvedValue(githubProject()),
            } as AnyType,
            aiWritebackThreadModel: {
                findByAiThreadUuid: vi.fn().mockResolvedValue(null),
                findActiveWorkstreamByRepo,
                findByAiThreadUuidAndPrUrl,
            } as AnyType,
        });
        // The resumed row carries a live PR, so the edit-state guard runs.
        vi.spyOn(
            (service as AnyType).githubProvider,
            'resolveInstallation',
        ).mockResolvedValue({
            provider: PullRequestProvider.GITHUB,
            installationId: 'inst-1',
            token: 'install-token',
            userToken: null,
            commitAuthor: { name: 'n', email: 'e' },
            coAuthorTrailer: '',
        } as AnyType);
        vi.spyOn(
            (service as AnyType).githubProvider,
            'getPullRequestEditState',
        ).mockResolvedValue({ editable: true, reason: null });

        const turn = await (service as AnyType).prepareTurn({
            user: userWithOrg(true),
            projectUuid: 'p1',
            aiThreadUuid: 't1',
            prUrl: PR_3,
        });

        expect(findByAiThreadUuidAndPrUrl).toHaveBeenCalledWith('t1', PR_3);
        expect(findActiveWorkstreamByRepo).not.toHaveBeenCalled();
        expect(turn).toMatchObject({
            kind: 'run',
            turn: {
                existingRow: workstreamRow,
                isResume: true,
            },
        });
    });

    // Change C, adopt fallback: a prUrl that isn't one of this thread's own
    // workstreams (an external paste) resolves to null, so the turn is fresh and
    // the later adopt path validates + records the pasted PR.
    it('looks up by prUrl then falls through to the adopt path for an external paste', async () => {
        const findActiveWorkstreamByRepo = vi.fn();
        const findByAiThreadUuidAndPrUrl = vi.fn().mockResolvedValue(null);
        const service = buildService({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as AnyType,
            projectModel: {
                get: vi.fn().mockResolvedValue(githubProject()),
            } as AnyType,
            aiWritebackThreadModel: {
                findByAiThreadUuid: vi.fn().mockResolvedValue(null),
                findActiveWorkstreamByRepo,
                findByAiThreadUuidAndPrUrl,
            } as AnyType,
        });

        const turn = await (service as AnyType).prepareTurn({
            user: userWithOrg(true),
            projectUuid: 'p1',
            aiThreadUuid: 't1',
            prUrl: PR_7,
        });

        expect(findByAiThreadUuidAndPrUrl).toHaveBeenCalledWith('t1', PR_7);
        expect(findActiveWorkstreamByRepo).not.toHaveBeenCalled();
        expect(turn).toMatchObject({
            kind: 'run',
            turn: { existingRow: null, isResume: false },
        });
    });
});

describe('AiWritebackService workstream concurrency', () => {
    const turnWith = (existingRow: AnyType): AnyType => ({ existingRow });

    it('keys the lock on the workstream when resuming, new::repo when fresh, null one-shot', () => {
        const key = (aiThreadUuid: string | undefined, existingRow: AnyType) =>
            workstreamLockKey(
                aiThreadUuid,
                turnWith(existingRow),
                'acme/web-app',
            );
        expect(key('t1', { ai_writeback_thread_uuid: 'w1' })).toBe(
            't1::ws::w1',
        );
        expect(key('t1', null)).toBe('t1::new::acme/web-app');
        expect(key(undefined, null)).toBeNull();
    });

    it('rejects a second turn on the same workstream but allows a different PR', () => {
        const service = buildService();
        const assertAvailable = (lockKey: string, existingRow: AnyType) =>
            (service as AnyType).assertTurnSlotAvailable(
                't1',
                lockKey,
                existingRow,
            );
        (service as AnyType).acquireTurnSlot('t1', 't1::ws::w1');

        expect(() => assertAvailable('t1::ws::w1', { x: 1 })).toThrow(
            /already in progress for this pull request/,
        );
        // A different workstream on the same repo runs in parallel.
        expect(() => assertAvailable('t1::ws::w2', { x: 1 })).not.toThrow();
    });

    it('caps concurrent turns per thread and frees a slot on release', () => {
        const service = buildService();
        const assertCap = () =>
            (service as AnyType).assertTurnSlotAvailable('t1', null, null);
        for (
            let i = 0;
            i < MAX_CONCURRENT_WORKSTREAM_TURNS_PER_THREAD;
            i += 1
        ) {
            (service as AnyType).acquireTurnSlot('t1', `t1::ws::w${i}`);
        }

        expect(assertCap).toThrow(/Too many edits/);

        (service as AnyType).releaseTurnSlot('t1', 't1::ws::w0');
        expect(assertCap).not.toThrow();
    });

    it('isolates the per-thread cap between threads', () => {
        const service = buildService();
        for (
            let i = 0;
            i < MAX_CONCURRENT_WORKSTREAM_TURNS_PER_THREAD;
            i += 1
        ) {
            (service as AnyType).acquireTurnSlot('t1', `t1::ws::w${i}`);
        }
        // A different thread is unaffected by t1 saturating its cap.
        expect(() =>
            (service as AnyType).assertTurnSlotAvailable('t2', null, null),
        ).not.toThrow();
    });
});

describe('AiWritebackService dbt source targeting', () => {
    const PRIMARY_CONNECTION = {
        type: DbtProjectType.GITHUB,
        authorization_method: 'installation_id',
        repository: 'acme/analytics',
        branch: 'main',
        project_sub_path: '/',
    };
    const project = (): AnyType => ({
        projectUuid: 'p1',
        dbtConnection: PRIMARY_CONNECTION,
    });
    // An additional (non-primary) GitHub dbt source pointing at a different repo.
    const marketingSource = (): AnyType => ({
        projectDbtSourceUuid: 'src-marketing',
        projectUuid: 'p1',
        name: 'Marketing dbt',
        isPrimary: false,
        precedence: 1,
        dbtConnection: {
            type: DbtProjectType.GITHUB,
            authorization_method: 'installation_id',
            repository: 'acme/marketing',
            branch: 'main',
            project_sub_path: '/',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    const serviceWithSources = (sources: AnyType[]) =>
        buildService({
            projectDbtSourcesModel: {
                getSources: vi.fn().mockResolvedValue(sources),
            } as AnyType,
        });

    const resolve = (
        service: AiWritebackService,
        args: {
            prompt?: string;
            dbtSourceUuid?: string;
            existingRow?: AnyType;
        },
    ) =>
        (service as AnyType).resolveDbtTarget({
            projectUuid: 'p1',
            project: project(),
            prompt: args.prompt ?? '',
            dbtSourceUuid: args.dbtSourceUuid,
            existingRow: args.existingRow ?? null,
        });

    it('targets the primary connection when the project has no additional sources', async () => {
        const result = await resolve(serviceWithSources([]), {
            prompt: 'add a revenue metric',
        });
        expect(result).toMatchObject({
            kind: 'resolved',
            candidate: { sourceUuid: null, isPrimary: true, optionUuid: 'p1' },
        });
    });

    it('honours an explicit additional dbtSourceUuid', async () => {
        const result = await resolve(serviceWithSources([marketingSource()]), {
            dbtSourceUuid: 'src-marketing',
        });
        expect(result).toMatchObject({
            kind: 'resolved',
            candidate: {
                sourceUuid: 'src-marketing',
                isPrimary: false,
                connection: { repository: 'acme/marketing' },
            },
        });
    });

    it('treats the project uuid as an explicit choice of the primary source', async () => {
        const result = await resolve(serviceWithSources([marketingSource()]), {
            dbtSourceUuid: 'p1',
        });
        expect(result).toMatchObject({
            kind: 'resolved',
            candidate: { sourceUuid: null, isPrimary: true },
        });
    });

    it('rejects an explicit dbtSourceUuid that is not a target', async () => {
        await expect(
            resolve(serviceWithSources([marketingSource()]), {
                dbtSourceUuid: 'does-not-exist',
            }),
        ).rejects.toThrow(ParameterError);
    });

    it('infers the source from the prompt when exactly one matches', async () => {
        const result = await resolve(serviceWithSources([marketingSource()]), {
            prompt: 'add a spend metric to the marketing models',
        });
        expect(result).toMatchObject({
            kind: 'resolved',
            candidate: { sourceUuid: 'src-marketing' },
        });
    });

    it('prefers the most specific source when names share a prefix', async () => {
        // Primary `jaffle` is a substring of the additional `jaffle-2`, so naive
        // substring matching would flag both and ask. The longest-match rule
        // resolves "jaffle-2" to jaffle-2 and bare "jaffle" to the primary.
        const jaffle2 = {
            projectDbtSourceUuid: 'src-j2',
            projectUuid: 'p1',
            name: 'jaffle-2',
            isPrimary: false,
            precedence: 1,
            dbtConnection: {
                type: DbtProjectType.GITHUB,
                authorization_method: 'installation_id',
                repository: 'charliedowler/jaffle-2',
                branch: 'main',
                project_sub_path: '/dbt',
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        const service = serviceWithSources([jaffle2]);
        const primaryJaffle = {
            projectUuid: 'p1',
            dbtConnection: {
                type: DbtProjectType.GITHUB,
                authorization_method: 'installation_id',
                repository: 'charliedowler/jaffle',
                branch: 'main',
                project_sub_path: '/dbt',
            },
        };
        const resolvePrompt = (prompt: string) =>
            (service as AnyType).resolveDbtTarget({
                projectUuid: 'p1',
                project: primaryJaffle,
                prompt,
                dbtSourceUuid: undefined,
                existingRow: null,
            });
        await expect(
            resolvePrompt('In jaffle-2, add a total_revenue metric to orders'),
        ).resolves.toMatchObject({
            kind: 'resolved',
            candidate: { sourceUuid: 'src-j2' },
        });
        await expect(
            resolvePrompt('add a metric in the jaffle repo'),
        ).resolves.toMatchObject({
            kind: 'resolved',
            candidate: { sourceUuid: null, isPrimary: true },
        });
    });

    it('asks the caller to choose when the prompt names no source', async () => {
        const result = await resolve(serviceWithSources([marketingSource()]), {
            prompt: 'add a new metric',
        });
        expect(result.kind).toBe('select');
        expect(result.options).toHaveLength(2);
        expect(result.options).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    projectDbtSourceUuid: 'p1',
                    isPrimary: true,
                }),
                expect.objectContaining({
                    projectDbtSourceUuid: 'src-marketing',
                    repository: 'acme/marketing',
                }),
            ]),
        );
    });

    it('keeps a resumed thread bound to its original source, ignoring the prompt', async () => {
        const result = await resolve(serviceWithSources([marketingSource()]), {
            // The prompt names the primary repo, but the thread is bound to the
            // additional source — binding wins so the resumed sandbox stays put.
            prompt: 'change something in analytics',
            existingRow: { project_dbt_source_uuid: 'src-marketing' },
        });
        expect(result).toMatchObject({
            kind: 'resolved',
            candidate: { sourceUuid: 'src-marketing' },
        });
    });

    it('falls back to the primary when a resumed thread`s bound source was deleted', async () => {
        const result = await resolve(serviceWithSources([marketingSource()]), {
            existingRow: { project_dbt_source_uuid: 'deleted-source' },
        });
        expect(result).toMatchObject({
            kind: 'resolved',
            candidate: { sourceUuid: null, isPrimary: true },
        });
    });

    it('falls back to the first git source (not by stale array order) when the bound source is deleted and the primary is non-git', async () => {
        // Graphite-flagged scenario: with a non-git primary the primary is not a
        // candidate, so `candidates[0]` is the first *additional* source, not the
        // primary. When the bound source has been deleted there is no primary to
        // return; degrade deterministically to the first git-backed source.
        const service = serviceWithSources([marketingSource()]);
        const result = await (service as AnyType).resolveDbtTarget({
            projectUuid: 'p1',
            project: {
                projectUuid: 'p1',
                dbtConnection: { type: DbtProjectType.DBT },
            },
            prompt: 'change something',
            dbtSourceUuid: undefined,
            existingRow: { project_dbt_source_uuid: 'deleted-src' },
        });
        expect(result).toMatchObject({
            kind: 'resolved',
            candidate: { sourceUuid: 'src-marketing', isPrimary: false },
        });
    });

    it('drops a non-git primary but still targets git-backed additional sources', async () => {
        const service = serviceWithSources([marketingSource()]);
        const result = await (service as AnyType).resolveDbtTarget({
            projectUuid: 'p1',
            // Local (non-git) primary — cannot be a writeback target.
            project: {
                projectUuid: 'p1',
                dbtConnection: { type: DbtProjectType.DBT },
            },
            prompt: 'add a metric',
            dbtSourceUuid: undefined,
            existingRow: null,
        });
        // Only the git-backed additional source remains, so it's the sole target.
        expect(result).toMatchObject({
            kind: 'resolved',
            candidate: { sourceUuid: 'src-marketing', isPrimary: false },
        });
    });

    it('rejects when no git-backed source exists at all', async () => {
        const service = serviceWithSources([]);
        await expect(
            (service as AnyType).resolveDbtTarget({
                projectUuid: 'p1',
                project: {
                    projectUuid: 'p1',
                    dbtConnection: { type: DbtProjectType.DBT },
                },
                prompt: 'add a metric',
                dbtSourceUuid: undefined,
                existingRow: null,
            }),
        ).rejects.toThrow(WritebackGitNotConnectedError);
    });

    it('run() returns a selection request without starting a sandbox', async () => {
        const service = buildService({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as AnyType,
            projectModel: {
                get: vi.fn().mockResolvedValue({
                    projectUuid: 'p1',
                    organizationUuid: ORG,
                    name: 'Analytics',
                    dbtConnection: PRIMARY_CONNECTION,
                    warehouseConnection: null,
                    dbtVersion: SupportedDbtVersions.V1_9,
                }),
            } as AnyType,
            projectDbtSourcesModel: {
                getSources: vi.fn().mockResolvedValue([marketingSource()]),
            } as AnyType,
            aiWritebackThreadModel: {
                findByAiThreadUuid: vi.fn().mockResolvedValue(null),
            } as AnyType,
        });
        const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
        can('manage', 'SourceCode', { organizationUuid: ORG });
        const user = {
            userUuid: 'u1',
            organizationUuid: ORG,
            organizationName: 'Acme',
            organizationCreatedAt: new Date(),
            role: 'admin',
            ability: build(),
        } as AnyType;

        const result = await service.run({
            user,
            projectUuid: 'p1',
            prompt: 'add a new metric',
            source: 'api',
        });

        expect(result.needsDbtSourceSelection).toBe(true);
        expect(result.prUrl).toBeNull();
        expect(result.dbtSourceUuid).toBeNull();
        expect(result.dbtSourceOptions).toHaveLength(2);
        // No sandbox manager is ever constructed on the selection path.
        expect(createSandboxManager).not.toHaveBeenCalled();
    });

    it('marks the run started (install) as soon as a worker picks it up', async () => {
        const updateStageIfInProgress = vi.fn().mockResolvedValue(undefined);
        const service = buildService({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as AnyType,
            projectModel: {
                get: vi.fn().mockResolvedValue({
                    projectUuid: 'p1',
                    organizationUuid: ORG,
                    name: 'Analytics',
                    dbtConnection: PRIMARY_CONNECTION,
                    warehouseConnection: null,
                    dbtVersion: SupportedDbtVersions.V1_9,
                }),
            } as AnyType,
            projectDbtSourcesModel: {
                getSources: vi.fn().mockResolvedValue([marketingSource()]),
            } as AnyType,
            aiWritebackThreadModel: {
                findByAiThreadUuid: vi.fn().mockResolvedValue(null),
            } as AnyType,
            aiWritebackRunModel: {
                create: vi.fn(),
                findByUuid: vi.fn(),
                updateStageIfInProgress,
                markReady: vi.fn().mockResolvedValue(true),
                markError: vi.fn().mockResolvedValue(true),
                setBranchName: vi.fn().mockResolvedValue(undefined),
            } as AnyType,
        });
        const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
        can('manage', 'SourceCode', { organizationUuid: ORG });
        const user = {
            userUuid: 'u1',
            organizationUuid: ORG,
            organizationName: 'Acme',
            organizationCreatedAt: new Date(),
            role: 'admin',
            ability: build(),
        } as AnyType;

        // Runs far enough to resolve the turn (then returns a source selection);
        // the run must already have been moved off 'pending' by that point so the
        // stale sweeper treats it as a worker's, not a queued one's.
        await service.run({
            user,
            projectUuid: 'p1',
            prompt: 'add a metric',
            source: 'api',
            aiWritebackRunUuid: 'run-1',
        });

        expect(updateStageIfInProgress).toHaveBeenCalledWith(
            'run-1',
            'install',
        );
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
    });

    // A fake SandboxProvider over the fake sandbox. create/connect hand back the
    // sandbox; destroy/persist are the control-plane calls the service makes to
    // tear the sandbox down or suspend it.
    const fakeSandboxProvider = {
        capabilities: { pauseResume: true },
        create: vi.fn(),
        connect: vi.fn(),
        destroy: vi.fn().mockResolvedValue(undefined),
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
                },
                aiWriteback: { anthropicApiKey: 'anthropic-key' },
            } as AnyType,
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
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
        // Wrap the fake provider in a real SandboxManager, threading the
        // service's own fake registry model through.
        (createSandboxManager as import('vitest').Mock).mockImplementation(
            (opts: AnyType) =>
                new SandboxManager({
                    provider: fakeSandboxProvider as AnyType,
                    providerKind: 'e2b',
                    registryModel: opts.registryModel,
                    logger: opts.logger,
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

    // R13: the sandbox network lockdown is a security invariant. The egress
    // allowlist passed to the provider must stay [anthropic,github,gitlab] —
    // never widened to `*`. Under the SandboxProvider abstraction the implicit
    // denyOut=ALL is enforced inside the provider; this test fails loudly if the
    // allowlist handed to the provider is ever loosened.
    it('creates the sandbox with a fixed egress allowlist', async () => {
        const sandbox = fakeSandbox(0, true);
        fakeSandboxProvider.create.mockClear();
        fakeSandboxProvider.create.mockResolvedValue(sandbox);

        await runService(sandbox);

        expect(fakeSandboxProvider.create).toHaveBeenCalledTimes(1);
        const [spec] = fakeSandboxProvider.create.mock.calls[0];
        // The INVARIANT (not just the current literal): the egress allowlist is a
        // non-empty set of specific hosts — never a wildcard or a broad CIDR. The
        // implicit deny-all default is enforced inside the provider. A provider or
        // model change may extend the host list, but must keep this shape or the
        // test fails loudly.
        const { allow } = spec.egress;
        expect(allow.length).toBeGreaterThan(0);
        allow.forEach((host: string) => {
            expect(host).not.toContain('*');
            expect(host).not.toMatch(/\/\d+$/); // no CIDR
            expect(host).not.toBe('0.0.0.0');
            expect(host).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/i); // a real hostname
        });
        expect(allow).toContain('api.anthropic.com');
    });

    it('skips the PR and rejects when the agent exits non-zero', async () => {
        const sandbox = fakeSandbox(1, true);
        fakeSandboxProvider.create.mockResolvedValue(sandbox);

        await expect(runService(sandbox)).rejects.toThrow('exited with code 1');
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

describe('AiWritebackService.listWorkstreams', () => {
    it('returns [] without querying when the thread has no uuid', async () => {
        const listByAiThreadUuid = vi.fn();
        const service = buildService({
            aiWritebackThreadModel: { listByAiThreadUuid } as AnyType,
        });
        await expect(
            service.listWorkstreams({
                aiThreadUuid: undefined,
                repoTarget: null,
            }),
        ).resolves.toEqual([]);
        expect(listByAiThreadUuid).not.toHaveBeenCalled();
    });

    it('maps rows to owner/repo workstreams, passing the repo filter through', async () => {
        const listByAiThreadUuid = vi.fn().mockResolvedValue([
            {
                owner: 'acme',
                repo: 'analytics',
                provider: PullRequestProvider.GITHUB,
                pr_url: PR_7,
                pr_number: 7,
                summary: 'Fix the typo',
                created_at: new Date(),
            },
        ]);
        const service = buildService({
            aiWritebackThreadModel: { listByAiThreadUuid } as AnyType,
        });

        await expect(
            service.listWorkstreams({
                aiThreadUuid: 'thread-1',
                repoTarget: 'acme/analytics',
            }),
        ).resolves.toEqual([
            {
                repository: 'acme/analytics',
                provider: PullRequestProvider.GITHUB,
                prUrl: PR_7,
                prNumber: 7,
                summary: 'Fix the typo',
            },
        ]);
        expect(listByAiThreadUuid).toHaveBeenCalledWith(
            'thread-1',
            'acme/analytics',
        );
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

describe('parseOwnerRepo', () => {
    it('parses a valid owner/repo', () => {
        expect(parseOwnerRepo('acme/web-app')).toEqual({
            owner: 'acme',
            repo: 'web-app',
        });
    });

    it('trims whitespace and a trailing .git', () => {
        expect(parseOwnerRepo('  acme/web-app.git ')).toEqual({
            owner: 'acme',
            repo: 'web-app',
        });
    });

    it.each([undefined, '', 'noslash', 'a/b/c', 'owner/', '/repo'])(
        'throws ParameterError on malformed input %p',
        (input) => {
            expect(() => parseOwnerRepo(input as string)).toThrow();
        },
    );
});

describe('computeWritableRepoKeys', () => {
    const r = (owner: string, repo: string) => ({ owner, repo });

    it('without user intersection, every installation repo is writable', () => {
        const keys = computeWritableRepoKeys(
            [r('acme', 'a'), r('acme', 'b')],
            [],
            false,
        );
        expect([...keys].sort()).toEqual(['acme/a', 'acme/b']);
    });

    it('with user intersection, only repos in BOTH sets are writable', () => {
        const keys = computeWritableRepoKeys(
            [r('acme', 'a'), r('acme', 'b'), r('acme', 'c')],
            [r('acme', 'b'), r('acme', 'c'), r('me', 'x')],
            true,
        );
        // acme/a is install-only (excluded); me/x is user-only (not installable)
        expect([...keys].sort()).toEqual(['acme/b', 'acme/c']);
    });

    it('never marks the denylisted lightdash/lightdash writable', () => {
        const keys = computeWritableRepoKeys(
            [r('lightdash', 'lightdash'), r('acme', 'a')],
            [],
            false,
        );
        expect(keys.has('lightdash/lightdash')).toBe(false);
        expect(keys.has('acme/a')).toBe(true);
    });

    it('denylist is case-insensitive', () => {
        const keys = computeWritableRepoKeys(
            [r('Lightdash', 'Lightdash')],
            [],
            false,
        );
        expect(keys.size).toBe(0);
    });

    it('intersects case-insensitively (installation vs user listings can differ in case)', () => {
        const keys = computeWritableRepoKeys(
            [r('Acme', 'Web-App')],
            [r('acme', 'web-app')],
            true,
        );
        // The slug differs only by case across the two listings — it must still
        // intersect (L1), and the output keeps the installation's casing.
        expect([...keys]).toEqual(['Acme/Web-App']);
    });
});

describe('auditReasonForError', () => {
    it('maps each terminal coding-agent error to a stable reason', () => {
        expect(auditReasonForError(new DeniedPathError(['.env']))).toBe(
            'denied_path',
        );
        expect(
            auditReasonForError(new RepoTooLargeError('a/b', 900, 500)),
        ).toBe('repo_too_large');
        expect(
            auditReasonForError(
                new WritebackGitNotConnectedError(PullRequestProvider.GITHUB),
            ),
        ).toBe('not_installed');
        expect(
            auditReasonForError(new WritebackThreadPrClosedError('merged')),
        ).toBe('pr_not_open');
    });

    it('distinguishes the ForbiddenError authz sub-conditions by message', () => {
        expect(
            auditReasonForError(
                new ForbiddenError(
                    'The repository lightdash/lightdash cannot be edited',
                ),
            ),
        ).toBe('denied_repo');
        expect(
            auditReasonForError(
                new ForbiddenError(
                    'a/b is not accessible to your linked GitHub account',
                ),
            ),
        ).toBe('user_intersection');
        expect(
            auditReasonForError(
                new ForbiddenError(
                    "a/b is not accessible to your organization's GitHub App installation",
                ),
            ),
        ).toBe('installation');
        // A bare ForbiddenError (the manage:SourceCode gate) -> permission.
        expect(auditReasonForError(new ForbiddenError())).toBe('permission');
    });

    it('falls back to unknown for unrecognised errors', () => {
        expect(auditReasonForError(new Error('boom'))).toBe('unknown');
    });
});

describe('GENERAL_ALLOWED_TOOLS', () => {
    const tools = GENERAL_ALLOWED_TOOLS.split(',');

    // Inv#2: the general coding agent has NO shell. "No in-sandbox build" is
    // enforceable (not convention) only while zero Bash entries are granted.
    it('grants zero Bash entries (no shell for the general agent)', () => {
        expect(tools.some((t) => t.startsWith('Bash('))).toBe(false);
        expect(tools).not.toContain('Bash');
    });

    it('does not grant a blanket WebFetch/WebSearch escape hatch', () => {
        expect(tools.some((t) => t.startsWith('WebFetch'))).toBe(false);
        expect(tools.some((t) => t.startsWith('WebSearch'))).toBe(false);
    });

    // L2: path-scoped allows must use Claude Code absolute (`//`) paths too, so
    // the allowlist matches the real /home/user/repo checkout rather than a
    // project-relative path (which would silently grant nothing / the wrong dir).
    it('scopes repo file tools to the absolute (//) repo path', () => {
        const repoFileTools = tools.filter((t) =>
            /^(Read|Glob|Grep|Edit|Write)\(.*home\/user\/repo/.test(t),
        );
        expect(repoFileTools.length).toBeGreaterThan(0);
        repoFileTools.forEach((t) => {
            expect(t).toMatch(
                /^(Read|Glob|Grep|Edit|Write)\(\/\/home\/user\/repo\//,
            );
        });
    });
});

describe('GENERAL_DISALLOWED_TOOLS', () => {
    const rules = GENERAL_DISALLOWED_TOOLS.split(',');

    it('denies Grep on every path it denies Read on (no read/grep parity gap)', () => {
        const readGlobs = rules
            .filter((r) => r.startsWith('Read('))
            .map((r) => r.slice('Read('.length, -1));
        const grepGlobs = new Set(
            rules
                .filter((r) => r.startsWith('Grep('))
                .map((r) => r.slice('Grep('.length, -1)),
        );

        expect(readGlobs.length).toBeGreaterThan(0);
        readGlobs.forEach((glob) => {
            expect(grepGlobs.has(glob)).toBe(true);
        });
    });

    it('denies Grep against .env and .git so secrets cannot be grepped out', () => {
        expect(rules).toEqual(
            expect.arrayContaining([
                expect.stringMatching(/^Grep\(.*\.git\/\*\*\)$/),
                expect.stringMatching(/^Grep\(.*\.env\)$/),
            ]),
        );
    });

    // L2: in Claude Code, `//path` is an ABSOLUTE filesystem path while `/path`
    // is relative to the project root. The agent's repo is at the absolute path
    // /home/user/repo, so every deny rule MUST keep the `//` prefix — dropping a
    // slash would silently retarget the deny to a project-relative path and stop
    // blocking the real secret files. This test fails loudly if that happens.
    it('uses absolute (//) paths so the deny rules target the real repo', () => {
        rules.forEach((rule) => {
            expect(rule).toMatch(/^(Read|Grep)\(\/\/home\/user\/repo\//);
        });
    });
});

describe('AiWritebackService.resolveWritableRepoTarget (fail-closed authz)', () => {
    const userWithManage = (): SessionUser => {
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

    const githubProject = (): AnyType => ({
        organizationUuid: ORG,
        projectUuid: 'p1',
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

    beforeEach(() => vi.clearAllMocks());

    it('fails closed (does NOT widen to installation scope) when the user repo listing fails', async () => {
        const { service } = (() => {
            const svc = buildService({
                githubAppService: {
                    getValidUserToken: vi.fn().mockResolvedValue('user-token'),
                } as AnyType,
            });
            vi.spyOn(
                (svc as AnyType).githubProvider,
                'resolveInstallation',
            ).mockResolvedValue({
                provider: PullRequestProvider.GITHUB,
                installationId: 'inst-1',
                token: 'install-token',
                userToken: null,
                commitAuthor: { name: 'n', email: 'e' },
                coAuthorTrailer: '',
            } as AnyType);
            return { service: svc };
        })();

        // The installation can reach the target...
        (
            listReposAccessibleToInstallation as import('vitest').Mock
        ).mockResolvedValue([{ owner: 'acme', repo: 'analytics' }]);
        // ...but listing the user's own repos fails transiently.
        (listReposAccessibleToUser as import('vitest').Mock).mockRejectedValue(
            new Error('GitHub 503'),
        );

        await expect(
            service.resolveWritableRepoTarget({
                user: userWithManage(),
                project: githubProject(),
                repoTarget: 'acme/analytics',
            }),
        ).rejects.toThrow(/Could not verify your GitHub access/);
    });

    it('fails closed at the size guard (R9) before any clone when the repo is over the limit', async () => {
        const svc = buildService({
            lightdashConfig: {
                gitlab: {},
                aiWriteback: { codingAgentMaxRepoSizeMb: 100 },
            } as AnyType,
            githubAppService: {
                getValidUserToken: vi.fn().mockResolvedValue(undefined),
            } as AnyType,
        });
        vi.spyOn(
            (svc as AnyType).githubProvider,
            'resolveInstallation',
        ).mockResolvedValue({
            provider: PullRequestProvider.GITHUB,
            installationId: 'inst-1',
            token: 'install-token',
            userToken: null,
            commitAuthor: { name: 'n', email: 'e' },
            coAuthorTrailer: '',
        } as AnyType);
        (
            listReposAccessibleToInstallation as import('vitest').Mock
        ).mockResolvedValue([{ owner: 'acme', repo: 'analytics' }]);
        // 250 MB checkout against a 100 MB limit → reject before cloning.
        (getRepoMetadata as import('vitest').Mock).mockResolvedValue({
            defaultBranch: 'main',
            sizeKb: 250 * 1024,
        });

        await expect(
            svc.resolveWritableRepoTarget({
                user: userWithManage(),
                project: githubProject(),
                repoTarget: 'acme/analytics',
            }),
        ).rejects.toThrow(RepoTooLargeError);
    });
});

describe('AiWritebackService.generalCodingAgentConfig (general-agent invariants, H3)', () => {
    const buildGeneralService = () =>
        buildService({
            lightdashConfig: {
                gitlab: {},
                appRuntime: {
                    e2bCodingAgentTemplateName: 'coding-tpl',
                    e2bCodingAgentTemplateTag: '',
                },
            } as AnyType,
        });

    const config = (): AnyType =>
        (buildGeneralService() as AnyType).generalCodingAgentConfig();

    beforeEach(() => vi.clearAllMocks());

    it('runs in general mode behind the CodingAgent flag with no compile hooks', async () => {
        const cfg = config();
        expect(cfg.mode).toBe('general');
        expect(cfg.featureFlag).toBe(FeatureFlags.CodingAgent);
        // No in-sandbox build: prep/teardown are no-ops (Inv#2 relies on this).
        await expect(cfg.beforeAgentRun()).resolves.toBeUndefined();
        await expect(cfg.afterAgentRun()).resolves.toBeUndefined();
    });

    it('passes the no-Bash allowlist AND the secret/CI denylist to the agent', async () => {
        const sandbox = {
            commands: {
                run: vi
                    .fn()
                    .mockResolvedValue({ stdout: 'models/a.sql\nREADME.md' }),
            },
        };
        const setup = await config().buildAgentSetup({
            sandbox,
            repository: 'acme/web-app',
        });
        expect(setup.allowedTools).toBe(GENERAL_ALLOWED_TOOLS);
        expect(setup.disallowedTools).toBe(GENERAL_DISALLOWED_TOOLS);
    });

    it('mints a scoped contents:read clone token and revokes it after clone (R2)', async () => {
        const minted = await config().resolveCloneToken({
            gitConnection: {
                provider: PullRequestProvider.GITHUB,
                owner: 'acme',
                repo: 'web-app',
            },
            installation: {
                provider: PullRequestProvider.GITHUB,
                installationId: 'inst-1',
            },
        });

        expect(getScopedRepoCloneToken).toHaveBeenCalledWith({
            installationId: 'inst-1',
            repo: 'web-app',
        });
        expect(minted.token).toBe('scoped-clone-token');
        // The token is revoked once the checkout exists — not left live (R2).
        expect(revokeInstallationToken).not.toHaveBeenCalled();
        await minted.onAfterClone();
        expect(revokeInstallationToken).toHaveBeenCalledWith(
            'scoped-clone-token',
        );
    });

    it('does not mint a scoped token for non-GitHub installs (GitLab falls back to scrub-only)', async () => {
        const minted = await config().resolveCloneToken({
            gitConnection: { provider: PullRequestProvider.GITLAB },
            installation: { provider: PullRequestProvider.GITLAB },
        });
        expect(minted).toBeNull();
        expect(getScopedRepoCloneToken).not.toHaveBeenCalled();
    });
});

describe('AiWritebackService.runEditRepo (write audit, decision #2)', () => {
    const args = (): AnyType => ({
        user: { userUuid: 'u1', organizationUuid: ORG } as AnyType,
        projectUuid: 'p1',
        repoTarget: 'acme/web-app',
        prompt: 'edit it',
        source: 'web',
    });

    // runEditRepo builds the general config eagerly (reads appRuntime), so the
    // service needs it even though runCodingAgent itself is stubbed.
    const auditService = () =>
        buildService({
            lightdashConfig: {
                gitlab: {},
                appRuntime: {
                    e2bCodingAgentTemplateName: 'coding-tpl',
                    e2bCodingAgentTemplateTag: '',
                },
            } as AnyType,
        });

    beforeEach(() => vi.clearAllMocks());

    it('emits an allowed audit line on success', async () => {
        const service = auditService();
        vi.spyOn(service as AnyType, 'runCodingAgent').mockResolvedValue({
            repository: 'acme/web-app',
        });
        const info = vi.spyOn((service as AnyType).logger, 'info');

        await service.runEditRepo(args());

        expect(info).toHaveBeenCalledWith(
            'coding_agent_write',
            expect.objectContaining({
                event: 'coding_agent_write',
                projectUuid: 'p1',
                targetRepo: 'acme/web-app',
                allowed: true,
                reason: null,
            }),
        );
    });

    it('emits a denied audit line with the classified reason on failure', async () => {
        const service = auditService();
        vi.spyOn(service as AnyType, 'runCodingAgent').mockRejectedValue(
            new RepoTooLargeError('acme/web-app', 500, 100),
        );
        const info = vi.spyOn((service as AnyType).logger, 'info');

        await expect(service.runEditRepo(args())).rejects.toThrow(
            RepoTooLargeError,
        );

        expect(info).toHaveBeenCalledWith(
            'coding_agent_write',
            expect.objectContaining({
                event: 'coding_agent_write',
                allowed: false,
                reason: 'repo_too_large',
            }),
        );
    });
});

describe('AiWritebackService.prepareTurn (stale-PR recovery, M4)', () => {
    const userWithManage = (): SessionUser => {
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

    const githubProject = (): AnyType => ({
        organizationUuid: ORG,
        projectUuid: 'p1',
        name: 'Analytics',
        dbtConnection: {
            type: DbtProjectType.GITHUB,
            authorization_method: 'installation_id',
            repository: 'acme/analytics',
            branch: 'main',
            project_sub_path: '/',
        },
        warehouseConnection: { type: WarehouseTypes.POSTGRES },
        dbtVersion: SupportedDbtVersions.V1_9,
    });

    const prepare = (
        service: AiWritebackService,
        overrides: AnyType = {},
    ): AnyType =>
        (service as AnyType).prepareTurn({
            user: userWithManage(),
            projectUuid: 'p1',
            aiThreadUuid: 'thread-1',
            source: 'web',
            featureFlag: undefined,
            mode: 'dbt',
            repoTarget: undefined,
            prUrl: undefined,
            startNewPullRequest: false,
            ...overrides,
        });

    it('treats a resumed workstream whose PR was deleted (null pr_url) as a fresh turn', async () => {
        const findActiveWorkstreamByRepo = vi.fn().mockResolvedValue({
            ai_writeback_thread_uuid: 'w-1',
            ai_thread_uuid: 'thread-1',
            target_repo: 'acme/analytics',
            pr_url: null,
        });
        const service = buildService({
            projectModel: {
                get: vi.fn().mockResolvedValue(githubProject()),
            } as AnyType,
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as AnyType,
            aiWritebackThreadModel: {
                findByAiThreadUuid: vi.fn().mockResolvedValue(null),
                findActiveWorkstreamByRepo,
                findByAiThreadUuidAndPrUrl: vi.fn(),
            } as AnyType,
        });

        const prepared = await prepare(service);
        const turn = prepared.kind === 'run' ? prepared.turn : prepared;

        // The stale row is discarded so the turn opens a fresh PR rather than
        // resuming onto a dead branch and throwing later (M4).
        expect(findActiveWorkstreamByRepo).toHaveBeenCalledWith(
            'thread-1',
            'acme/analytics',
        );
        expect(turn.existingRow).toBeNull();
        expect(turn.isResume).toBe(false);
    });
});

describe('AiWritebackService.closePullRequest (workstream provider)', () => {
    const PR_OTHER = 'https://github.com/acme/other-repo/pull/42';

    const userWithManage = (canManage = true): SessionUser => {
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

    const githubProject = (): AnyType => ({
        organizationUuid: ORG,
        projectUuid: 'p1',
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

    const recordedPr = (overrides: AnyType = {}): AnyType => ({
        pullRequestUuid: 'pr-uuid-1',
        organizationUuid: ORG,
        projectUuid: 'p1',
        provider: PullRequestProvider.GITHUB,
        owner: 'acme',
        repo: 'other-repo',
        prNumber: 42,
        prUrl: PR_OTHER,
        ...overrides,
    });

    beforeEach(() => vi.clearAllMocks());

    it('closes a recorded PR in another repo via its provider, not CiService', async () => {
        const findByAiThreadUuidAndUrl = vi
            .fn()
            .mockResolvedValue(recordedPr());
        const ciClose = vi.fn();
        const service = buildService({
            projectModel: {
                get: vi.fn().mockResolvedValue(githubProject()),
            } as AnyType,
            pullRequestsModel: { findByAiThreadUuidAndUrl } as AnyType,
            ciService: { closePullRequest: ciClose } as AnyType,
        });
        vi.spyOn(
            (service as AnyType).githubProvider,
            'resolveInstallation',
        ).mockResolvedValue({
            provider: PullRequestProvider.GITHUB,
            installationId: 'inst-1',
            token: 'install-token',
            userToken: null,
            commitAuthor: { name: 'n', email: 'e' },
            coAuthorTrailer: '',
        } as AnyType);
        const providerClose = vi
            .spyOn((service as AnyType).githubProvider, 'closePullRequest')
            .mockResolvedValue({ state: 'closed' });

        const result = await service.closePullRequest({
            user: userWithManage(),
            projectUuid: 'p1',
            aiThreadUuid: 'thread-1',
            prUrl: PR_OTHER,
        });

        expect(result).toEqual({ state: 'closed' });
        expect(findByAiThreadUuidAndUrl).toHaveBeenCalledWith(
            'thread-1',
            PR_OTHER,
        );
        expect(ciClose).not.toHaveBeenCalled();
        expect(providerClose).toHaveBeenCalledWith(
            expect.objectContaining({
                prUrl: PR_OTHER,
                owner: 'acme',
                repo: 'other-repo',
                pullNumber: 42,
            }),
        );
    });

    it('falls back to CiService when the PR URL is not a recorded workstream', async () => {
        const findByAiThreadUuidAndUrl = vi.fn().mockResolvedValue(null);
        const findByProjectAndUrl = vi.fn().mockResolvedValue(null);
        const ciClose = vi.fn().mockResolvedValue({ state: 'closed' });
        const service = buildService({
            pullRequestsModel: {
                findByAiThreadUuidAndUrl,
                findByProjectAndUrl,
            } as AnyType,
            ciService: { closePullRequest: ciClose } as AnyType,
        });
        const args = {
            user: userWithManage(),
            projectUuid: 'p1',
            aiThreadUuid: 'thread-1',
            prUrl: PR_7,
        };

        const result = await service.closePullRequest(args);

        expect(result).toEqual({ state: 'closed' });
        expect(ciClose).toHaveBeenCalledWith({
            user: args.user,
            projectUuid: args.projectUuid,
            prUrl: args.prUrl,
        });
    });

    it('rejects a project PR that is not a workstream in the current thread', async () => {
        const ciClose = vi.fn();
        const service = buildService({
            pullRequestsModel: {
                findByAiThreadUuidAndUrl: vi.fn().mockResolvedValue(null),
                findByProjectAndUrl: vi.fn().mockResolvedValue(recordedPr()),
            } as AnyType,
            ciService: { closePullRequest: ciClose } as AnyType,
        });

        await expect(
            service.closePullRequest({
                user: userWithManage(),
                projectUuid: 'p1',
                aiThreadUuid: 'thread-1',
                prUrl: PR_OTHER,
            }),
        ).rejects.toThrow(/not a workstream in the current conversation/);
        expect(ciClose).not.toHaveBeenCalled();
    });

    it('rejects a recorded-PR close when the user lacks manage:SourceCode', async () => {
        const service = buildService({
            projectModel: {
                get: vi.fn().mockResolvedValue(githubProject()),
            } as AnyType,
            pullRequestsModel: {
                findByAiThreadUuidAndUrl: vi
                    .fn()
                    .mockResolvedValue(recordedPr()),
            } as AnyType,
        });
        const providerClose = vi.spyOn(
            (service as AnyType).githubProvider,
            'closePullRequest',
        );

        await expect(
            service.closePullRequest({
                user: userWithManage(false),
                projectUuid: 'p1',
                aiThreadUuid: 'thread-1',
                prUrl: PR_OTHER,
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(providerClose).not.toHaveBeenCalled();
    });

    it('routes a recorded GitLab MR to the GitLab provider', async () => {
        const service = buildService({
            projectModel: {
                get: vi.fn().mockResolvedValue(githubProject()),
            } as AnyType,
            pullRequestsModel: {
                findByAiThreadUuidAndUrl: vi.fn().mockResolvedValue(
                    recordedPr({
                        provider: PullRequestProvider.GITLAB,
                        owner: 'acme',
                        repo: 'gl-repo',
                        prNumber: 7,
                        prUrl: 'https://gitlab.com/acme/gl-repo/-/merge_requests/7',
                    }),
                ),
            } as AnyType,
        });
        vi.spyOn(
            (service as AnyType).gitlabProvider,
            'resolveInstallation',
        ).mockResolvedValue({
            provider: PullRequestProvider.GITLAB,
            token: 'gitlab-token',
            instanceUrl: 'https://gitlab.com',
            commitAuthor: { name: 'n', email: 'e' },
        } as AnyType);
        const gitlabClose = vi
            .spyOn((service as AnyType).gitlabProvider, 'closePullRequest')
            .mockResolvedValue({ state: 'closed' });
        const githubClose = vi.spyOn(
            (service as AnyType).githubProvider,
            'closePullRequest',
        );

        const result = await service.closePullRequest({
            user: userWithManage(),
            projectUuid: 'p1',
            aiThreadUuid: 'thread-1',
            prUrl: 'https://gitlab.com/acme/gl-repo/-/merge_requests/7',
        });

        expect(result).toEqual({ state: 'closed' });
        expect(gitlabClose).toHaveBeenCalledTimes(1);
        expect(githubClose).not.toHaveBeenCalled();
    });
});

describe('AiWritebackService.enqueueWriteback', () => {
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
    const projectModel = {
        get: vi.fn().mockResolvedValue({ organizationUuid: ORG }),
    } as AnyType;

    it('creates a pending run row and enqueues the pipeline job', async () => {
        const runRow = { ai_writeback_run_uuid: 'run-1' };
        const aiWritebackRunModel = {
            create: vi.fn().mockResolvedValue(runRow),
        } as AnyType;
        const schedulerClient = {
            aiWritebackPipeline: vi.fn().mockResolvedValue({ jobId: '1' }),
        } as AnyType;
        const service = buildService({
            aiWritebackRunModel,
            schedulerClient,
            projectModel,
        });

        const result = await service.enqueueWriteback({
            user: userWithOrg(true),
            projectUuid: 'proj-1',
            prompt: 'add a metric',
            source: 'mcp',
            aiThreadUuid: 'thread-1',
        });

        expect(result).toEqual({ aiWritebackRunUuid: 'run-1' });
        expect(aiWritebackRunModel.create).toHaveBeenCalledWith({
            organizationUuid: ORG,
            projectUuid: 'proj-1',
            aiThreadUuid: 'thread-1',
            createdByUserUuid: 'u1',
            source: 'mcp',
            promptUuid: null,
            toolCallId: null,
        });
        expect(schedulerClient.aiWritebackPipeline).toHaveBeenCalledWith(
            expect.objectContaining({
                aiWritebackRunUuid: 'run-1',
                organizationUuid: ORG,
                projectUuid: 'proj-1',
                userUuid: 'u1',
                prompt: 'add a metric',
                aiThreadUuid: 'thread-1',
                source: 'mcp',
            }),
        );
    });

    it('persists a null aiThreadUuid for a one-shot run', async () => {
        const aiWritebackRunModel = {
            create: vi
                .fn()
                .mockResolvedValue({ ai_writeback_run_uuid: 'run-1' }),
        } as AnyType;
        const service = buildService({
            aiWritebackRunModel,
            schedulerClient: { aiWritebackPipeline: vi.fn() } as AnyType,
            projectModel,
        });

        await service.enqueueWriteback({
            user: userWithOrg(true),
            projectUuid: 'proj-1',
            prompt: 'add a metric',
            source: 'api',
        });

        expect(aiWritebackRunModel.create).toHaveBeenCalledWith(
            expect.objectContaining({ aiThreadUuid: null }),
        );
    });

    it('throws ForbiddenError when the user has no organization', async () => {
        const service = buildService();

        await expect(
            service.enqueueWriteback({
                user: { userUuid: 'u1' } as AnyType,
                projectUuid: 'proj-1',
                prompt: 'add a metric',
                source: 'api',
            }),
        ).rejects.toThrow(ForbiddenError);
    });

    it('throws ForbiddenError before enqueuing when the user cannot manage source code', async () => {
        const aiWritebackRunModel = { create: vi.fn() } as AnyType;
        const schedulerClient = { aiWritebackPipeline: vi.fn() } as AnyType;
        const service = buildService({
            aiWritebackRunModel,
            schedulerClient,
            projectModel,
        });

        await expect(
            service.enqueueWriteback({
                user: userWithOrg(false),
                projectUuid: 'proj-1',
                prompt: 'add a metric',
                source: 'mcp',
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(aiWritebackRunModel.create).not.toHaveBeenCalled();
        expect(schedulerClient.aiWritebackPipeline).not.toHaveBeenCalled();
    });
});

describe('AiWritebackService.createPendingRun', () => {
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
    const projectModel = {
        get: vi.fn().mockResolvedValue({ organizationUuid: ORG }),
    } as AnyType;

    it('creates a pending run row', async () => {
        const aiWritebackRunModel = {
            create: vi
                .fn()
                .mockResolvedValue({ ai_writeback_run_uuid: 'run-1' }),
        } as AnyType;
        const service = buildService({ aiWritebackRunModel, projectModel });

        const result = await service.createPendingRun({
            user: userWithOrg(true),
            projectUuid: 'proj-1',
            aiThreadUuid: 'thread-1',
            source: 'web',
            promptUuid: 'prompt-1',
            toolCallId: 'tool-1',
        });

        expect(result).toEqual({ aiWritebackRunUuid: 'run-1' });
        expect(aiWritebackRunModel.create).toHaveBeenCalledWith({
            organizationUuid: ORG,
            projectUuid: 'proj-1',
            aiThreadUuid: 'thread-1',
            createdByUserUuid: 'u1',
            source: 'web',
            promptUuid: 'prompt-1',
            toolCallId: 'tool-1',
        });
    });

    it('throws ForbiddenError before creating a row when the user cannot manage source code', async () => {
        const aiWritebackRunModel = { create: vi.fn() } as AnyType;
        const service = buildService({ aiWritebackRunModel, projectModel });

        await expect(
            service.createPendingRun({
                user: userWithOrg(false),
                projectUuid: 'proj-1',
                aiThreadUuid: 'thread-1',
                source: 'web',
                promptUuid: 'prompt-1',
                toolCallId: 'tool-1',
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(aiWritebackRunModel.create).not.toHaveBeenCalled();
    });
});

describe('AiWritebackService.sweepStaleRuns', () => {
    it('errors stale runs past the 45-minute threshold and maps their tool-call linkage', async () => {
        const aiWritebackRunModel = {
            markStaleRunsAsError: vi.fn().mockResolvedValue([
                {
                    ai_writeback_run_uuid: 'run-1',
                    prompt_uuid: 'prompt-1',
                    tool_call_id: 'tool-1',
                },
                {
                    ai_writeback_run_uuid: 'run-2',
                    prompt_uuid: null,
                    tool_call_id: null,
                },
            ]),
        } as AnyType;
        const service = buildService({ aiWritebackRunModel });

        const swept = await service.sweepStaleRuns();

        expect(aiWritebackRunModel.markStaleRunsAsError).toHaveBeenCalledWith(
            45,
            expect.any(String),
        );
        expect(swept).toEqual([
            {
                aiWritebackRunUuid: 'run-1',
                promptUuid: 'prompt-1',
                toolCallId: 'tool-1',
            },
            {
                aiWritebackRunUuid: 'run-2',
                promptUuid: null,
                toolCallId: null,
            },
        ]);
    });

    it('returns an empty array when nothing is stale', async () => {
        const aiWritebackRunModel = {
            markStaleRunsAsError: vi.fn().mockResolvedValue([]),
        } as AnyType;
        const service = buildService({ aiWritebackRunModel });

        expect(await service.sweepStaleRuns()).toEqual([]);
    });
});

describe('AiWritebackService.runPipeline', () => {
    const payload = {
        aiWritebackRunUuid: 'run-1',
        organizationUuid: ORG,
        projectUuid: 'proj-1',
        userUuid: 'u1',
        prompt: 'add a metric',
        aiThreadUuid: 'thread-1',
        source: 'mcp' as const,
    };

    it('skips the run when the row is missing', async () => {
        const aiWritebackRunModel = {
            findByUuid: vi.fn().mockResolvedValue(undefined),
        } as AnyType;
        const userModel = {
            findSessionUserAndOrgByUuid: vi.fn(),
        } as AnyType;
        const service = buildService({ aiWritebackRunModel, userModel });
        const runSpy = vi.spyOn(service, 'run');

        await service.runPipeline(payload);

        expect(userModel.findSessionUserAndOrgByUuid).not.toHaveBeenCalled();
        expect(runSpy).not.toHaveBeenCalled();
    });

    it('skips the run when the row already reached a terminal status', async () => {
        const aiWritebackRunModel = {
            findByUuid: vi.fn().mockResolvedValue({
                ai_writeback_run_uuid: 'run-1',
                status: 'ready',
            }),
        } as AnyType;
        const userModel = {
            findSessionUserAndOrgByUuid: vi.fn(),
        } as AnyType;
        const service = buildService({ aiWritebackRunModel, userModel });
        const runSpy = vi.spyOn(service, 'run');

        await service.runPipeline(payload);

        expect(userModel.findSessionUserAndOrgByUuid).not.toHaveBeenCalled();
        expect(runSpy).not.toHaveBeenCalled();
    });

    it('reconstructs the session user and runs the writeback turn', async () => {
        const sessionUser = {
            userUuid: 'u1',
            organizationUuid: ORG,
        } as AnyType;
        const aiWritebackRunModel = {
            findByUuid: vi.fn().mockResolvedValue({
                ai_writeback_run_uuid: 'run-1',
                status: 'pending',
            }),
        } as AnyType;
        const userModel = {
            findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(sessionUser),
        } as AnyType;
        const service = buildService({ aiWritebackRunModel, userModel });
        const runSpy = vi
            .spyOn(service, 'run')
            .mockResolvedValue({} as AnyType);

        await service.runPipeline(payload);

        expect(userModel.findSessionUserAndOrgByUuid).toHaveBeenCalledWith(
            'u1',
            ORG,
        );
        expect(runSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                user: sessionUser,
                projectUuid: 'proj-1',
                prompt: 'add a metric',
                aiThreadUuid: 'thread-1',
                source: 'mcp',
                aiWritebackRunUuid: 'run-1',
            }),
        );
    });
});

describe('AiWritebackService.getRunStatus', () => {
    const userWithOrg = (canView: boolean): SessionUser => {
        const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
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

    const runRow = (overrides: Record<string, AnyType> = {}) => ({
        ai_writeback_run_uuid: 'run-1',
        organization_uuid: ORG,
        project_uuid: 'proj-1',
        status: 'ready',
        pr_url: 'https://github.com/acme/analytics/pull/1',
        error_message: null,
        ...overrides,
    });

    it('returns the run status scoped to the caller organization', async () => {
        const aiWritebackRunModel = {
            findByUuid: vi.fn().mockResolvedValue(runRow()),
        } as AnyType;
        const service = buildService({
            aiWritebackRunModel,
            projectModel: {
                get: vi.fn().mockResolvedValue({ organizationUuid: ORG }),
            } as AnyType,
        });

        const result = await service.getRunStatus(userWithOrg(true), 'run-1');

        expect(result).toEqual({
            status: 'ready',
            prUrl: 'https://github.com/acme/analytics/pull/1',
            errorMessage: null,
        });
    });

    it('throws NotFoundError when the run does not exist', async () => {
        const aiWritebackRunModel = {
            findByUuid: vi.fn().mockResolvedValue(undefined),
        } as AnyType;
        const service = buildService({ aiWritebackRunModel });

        await expect(
            service.getRunStatus(userWithOrg(true), 'missing'),
        ).rejects.toThrow('not found');
    });

    it('throws ForbiddenError when the run belongs to another organization', async () => {
        const aiWritebackRunModel = {
            findByUuid: vi
                .fn()
                .mockResolvedValue(runRow({ organization_uuid: 'org-2' })),
        } as AnyType;
        const service = buildService({ aiWritebackRunModel });

        await expect(
            service.getRunStatus(userWithOrg(true), 'run-1'),
        ).rejects.toThrow(ForbiddenError);
    });

    it("throws ForbiddenError when the caller lacks view access to the run's project", async () => {
        const aiWritebackRunModel = {
            findByUuid: vi.fn().mockResolvedValue(runRow()),
        } as AnyType;
        const service = buildService({
            aiWritebackRunModel,
            projectModel: {
                get: vi.fn().mockResolvedValue({ organizationUuid: ORG }),
            } as AnyType,
        });

        await expect(
            service.getRunStatus(userWithOrg(false), 'run-1'),
        ).rejects.toThrow(ForbiddenError);
    });
});
