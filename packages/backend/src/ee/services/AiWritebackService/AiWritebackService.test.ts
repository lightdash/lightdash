import { Ability, AbilityBuilder } from '@casl/ability';
import {
    AnyType,
    DbtProjectType,
    FeatureFlags,
    ForbiddenError,
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
} from '../../../clients/github/Github';
import { AiWritebackService } from './AiWritebackService';
import {
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
    createSignedCommitOnBranch: jest.fn().mockResolvedValue(undefined),
    getAppBotIdentity: jest.fn(),
    getAuthenticatedUser: jest.fn(),
    getBranchHeadSha: jest.fn(),
    getInstallationToken: jest.fn(),
    getOrRefreshToken: jest.fn(),
    updatePullRequest: jest.fn().mockResolvedValue(undefined),
}));

const ORG = 'org-1';
const PR_3 = 'https://github.com/acme/analytics/pull/3';
const PR_7 = 'https://github.com/acme/analytics/pull/7';
const PR_9 = 'https://github.com/acme/analytics/pull/9';

const buildService = (overrides: Record<string, AnyType> = {}) =>
    new AiWritebackService({
        lightdashConfig: {} as AnyType,
        analytics: { track: jest.fn() } as AnyType,
        projectModel: { get: jest.fn() } as AnyType,
        featureFlagModel: { get: jest.fn() } as AnyType,
        githubAppInstallationsModel: {} as AnyType,
        aiWritebackThreadModel: { findByAiThreadUuid: jest.fn() } as AnyType,
        pullRequestsModel: {} as AnyType,
        projectCiStatusModel: {} as AnyType,
        ...overrides,
    });

const turnContext = (overrides: AnyType = {}): AnyType => ({
    organizationUuid: ORG,
    projectName: 'Analytics',
    githubConnection: { owner: 'acme', repo: 'analytics', projectSubPath: '.' },
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
        const open = jest
            .spyOn(service as AnyType, 'openInitialPullRequest')
            .mockResolvedValue(PR_7);
        const update = jest
            .spyOn(service as AnyType, 'updateExistingPullRequest')
            .mockResolvedValue(undefined);
        const record = jest
            .spyOn(service as AnyType, 'recordWritebackPullRequest')
            .mockResolvedValue(undefined);
        return { service, open, update, record };
    };

    const applyAgentChanges = (
        service: AiWritebackService,
        args: AnyType,
    ): AnyType =>
        (service as AnyType).applyAgentChanges({
            sandbox: { sandboxId: 'sbx-1' },
            github: { installationId: 'inst-1', prToken: null },
            adoptedPr: null,
            turn: turnContext(),
            user: { userUuid: 'u1' },
            projectUuid: 'p1',
            aiThreadUuid: undefined,
            setStage: jest.fn(),
            prTitle: 'T',
            prDescription: 'D',
            ...args,
        });

    it('does nothing when the agent made no changes (one-shot)', async () => {
        const { service, open, update } = setup();
        const result = await applyAgentChanges(service, { hasChanges: false });
        expect(result).toEqual({
            prUrl: null,
            prCreated: false,
            pauseOnExit: false,
        });
        expect(open).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });

    it('keeps a resumed PR and sandbox warm when there are no changes', async () => {
        const { service } = setup();
        const result = await applyAgentChanges(service, {
            hasChanges: false,
            turn: turnContext({ existingRow: threadRow(PR_3), isResume: true }),
        });
        expect(result).toEqual({
            prUrl: PR_3,
            prCreated: false,
            pauseOnExit: true,
        });
    });

    it('updates the existing PR and pauses on a resume turn with changes', async () => {
        const { service, update, record } = setup();
        const result = await applyAgentChanges(service, {
            hasChanges: true,
            turn: turnContext({ existingRow: threadRow(PR_3), isResume: true }),
        });
        expect(result).toEqual({
            prUrl: PR_3,
            prCreated: false,
            pauseOnExit: true,
        });
        expect(update).toHaveBeenCalledTimes(1);
        expect(record).not.toHaveBeenCalled();
    });

    it('updates and records a pasted (adopted) PR when given a thread uuid', async () => {
        const { service, update, record } = setup();
        const result = await applyAgentChanges(service, {
            hasChanges: true,
            adoptedPr: adoptedPullRequest(PR_9),
            aiThreadUuid: 'thread-1',
        });
        expect(result).toEqual({
            prUrl: PR_9,
            prCreated: false,
            pauseOnExit: true,
        });
        expect(update).toHaveBeenCalledTimes(1);
        expect(record).toHaveBeenCalledTimes(1);
    });

    it('does not keep an adopted PR warm without a thread uuid', async () => {
        const { service } = setup();
        const result = await applyAgentChanges(service, {
            hasChanges: true,
            adoptedPr: adoptedPullRequest(PR_9),
            aiThreadUuid: undefined,
        });
        expect(result.pauseOnExit).toBe(false);
    });

    it('opens and records a new PR for fresh changes in a thread', async () => {
        const { service, open, update, record } = setup();
        const result = await applyAgentChanges(service, {
            hasChanges: true,
            aiThreadUuid: 'thread-1',
        });
        expect(result).toEqual({
            prUrl: PR_7,
            prCreated: true,
            pauseOnExit: true,
        });
        expect(open).toHaveBeenCalledTimes(1);
        expect(update).not.toHaveBeenCalled();
        expect(record).toHaveBeenCalledTimes(1);
    });

    it('kills the sandbox after a one-shot run opens a PR', async () => {
        const { service } = setup();
        const result = await applyAgentChanges(service, {
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

    const githubProject = (): AnyType => ({
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
            githubConnection: {
                owner: 'acme',
                repo: 'analytics',
                projectSubPath: '.',
            },
            existingRow: null,
            isResume: false,
            warehouseType: WarehouseTypes.POSTGRES,
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
                }),
            } as AnyType,
            githubAppInstallationsModel: {
                getInstallationId: jest.fn().mockResolvedValue('inst-1'),
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
            repository: 'acme/analytics',
        });
        expect(createPullRequest).toHaveBeenCalledTimes(1);
        expect(sandbox.kill).toHaveBeenCalledTimes(1);
        expect(sandbox.pause).not.toHaveBeenCalled();
    });

    it('skips the PR when the agent exits non-zero', async () => {
        const sandbox = fakeSandbox(1, true);
        (Sandbox.create as jest.Mock).mockResolvedValue(sandbox);

        const result = await runService(sandbox);

        expect(result).toMatchObject({ exitCode: 1, prUrl: null });
        expect(createPullRequest).not.toHaveBeenCalled();
        expect(sandbox.kill).toHaveBeenCalledTimes(1);
    });

    it('opens no PR when the agent produced no changes', async () => {
        const sandbox = fakeSandbox(0, false);
        (Sandbox.create as jest.Mock).mockResolvedValue(sandbox);

        const result = await runService(sandbox);

        expect(result).toMatchObject({ exitCode: 0, prUrl: null });
        expect(createPullRequest).not.toHaveBeenCalled();
        expect(sandbox.kill).toHaveBeenCalledTimes(1);
    });
});
