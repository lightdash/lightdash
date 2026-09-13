import { Ability, AbilityBuilder } from '@casl/ability';
import {
    buildAbilityFromScopes,
    ConflictError,
    FeatureFlags,
    ForbiddenError,
    getTrainingProjectScopes,
    getTrainingProjectViewerScopes,
    LEARN_SANDBOX_SCOPES,
    NotFoundError,
    ParameterError,
    ProjectType,
    type MemberAbility,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import {
    mkdir,
    mkdtemp,
    realpath,
    rm,
    utimes,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { LearnSandboxService } from './LearnSandboxService';
import { LEARN_SANDBOX_COMMAND_TIMEOUT_MS } from './runtime';

const user: SessionUser = {
    ...defaultSessionUser,
    organizationUuid: 'org',
    ability: new Ability<PossibleAbilities>([
        {
            action: 'manage',
            subject: 'DeployProject',
            conditions: { projectUuid: 'copy' },
        },
    ]),
};

const lightdashConfig = {
    ...lightdashConfigMock,
    siteUrl: 'https://learn.test',
};

const isAlive = (pid: number): boolean => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

const waitUntilDead = async (pid: number): Promise<void> => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (!isAlive(pid)) {
            return;
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 50);
        });
    }
};

describe('LearnSandboxService', () => {
    const files = {
        listFiles: vi.fn(),
        getFile: vi.fn(),
        countFiles: vi.fn(),
        upsertFile: vi.fn(),
        createCommand: vi.fn(),
        getCommand: vi.fn(),
        findActiveCommand: vi.fn(),
        claimCommand: vi.fn(),
        updateCommand: vi.fn(),
        appendOutput: vi.fn(),
        readOutput: vi.fn(),
        listCommandsWithTokens: vi.fn(),
        failStaleRunning: vi.fn(),
        clearToken: vi.fn(),
    };
    const featureFlagModel = {
        get: vi.fn(async () => ({
            id: FeatureFlags.EnableLearn,
            enabled: true,
        })),
    };
    type ProjectSummaryFixture = {
        projectUuid: string;
        organizationUuid: string;
        type: ProjectType;
        upstreamProjectUuid: string | undefined;
        createdByUserUuid: string | null;
        provisioningSource: string | null;
        name: string;
        slug: string;
    };
    const projectModel = {
        getSummary: vi.fn(
            async (uuid: string): Promise<ProjectSummaryFixture> => ({
                projectUuid: uuid,
                organizationUuid: 'org',
                type: ProjectType.PREVIEW,
                upstreamProjectUuid: 'training',
                createdByUserUuid: user.userUuid,
                provisioningSource: 'training',
                name: 'copy',
                slug: 'copy',
            }),
        ),
    };
    const schedulerClient = { learnSandboxCommand: vi.fn(async () => 'job-1') };
    const personalAccessTokenService = {
        createPersonalAccessToken: vi.fn(),
        deletePersonalAccessToken: vi.fn(async () => undefined),
    };
    const userService = { getSessionByUserUuidAndOrg: vi.fn(async () => user) };
    const service = new LearnSandboxService({
        lightdashConfig,
        learnWorkspaceModel: files as never,
        projectModel,
        featureFlagModel,
        personalAccessTokenService,
        userService,
        schedulerClient,
    });

    beforeEach(() => {
        vi.clearAllMocks();
        featureFlagModel.get.mockResolvedValue({ enabled: true } as never);
    });

    it('lists bundle files as read-only and overlay models as editable', async () => {
        files.listFiles.mockResolvedValueOnce([
            { path: 'models/orders.yml', content: 'version: 2\n' },
        ]);
        const result = await service.listFiles(user, 'copy');
        expect(result).toContainEqual({
            path: 'dbt_project.yml',
            editable: false,
        });
        expect(result).toContainEqual({
            path: 'models/orders.yml',
            editable: true,
        });
    });

    it('rejects saving a non-editable path', async () => {
        await expect(
            service.saveFile(user, 'copy', 'dbt_project.yml', 'x'),
        ).rejects.toThrow(ParameterError);
    });

    it('rejects invalid YAML and oversized content', async () => {
        await expect(
            service.saveFile(user, 'copy', 'models/orders.yml', 'a: ['),
        ).rejects.toThrow(ParameterError);
        await expect(
            service.saveFile(
                user,
                'copy',
                'models/orders.yml',
                'x'.repeat(64 * 1024 + 1),
            ),
        ).rejects.toThrow(ParameterError);
    });

    it('rejects a path longer than 255 characters', async () => {
        const longPath = `models/${'a'.repeat(250)}.yml`;
        expect(longPath.length).toBeGreaterThan(255);
        await expect(
            service.saveFile(user, 'copy', longPath, 'version: 2\n'),
        ).rejects.toThrow(ParameterError);
        expect(files.upsertFile).not.toHaveBeenCalled();
    });

    it('rejects a new file once the workspace already has 200 overlay files', async () => {
        files.getFile.mockResolvedValueOnce(undefined);
        files.countFiles.mockResolvedValueOnce(200);
        await expect(
            service.saveFile(
                user,
                'copy',
                'models/new_file.yml',
                'version: 2\n',
            ),
        ).rejects.toThrow('Workspace file limit reached');
        expect(files.upsertFile).not.toHaveBeenCalled();
    });

    it('allows saving over an existing overlay file without counting against the limit', async () => {
        files.getFile.mockResolvedValueOnce({
            path: 'models/orders.yml',
            content: 'version: 1\n',
        });
        await service.saveFile(
            user,
            'copy',
            'models/orders.yml',
            'version: 2\n',
        );
        expect(files.upsertFile).toHaveBeenCalledWith(
            'copy',
            'models/orders.yml',
            'version: 2\n',
        );
        expect(files.countFiles).not.toHaveBeenCalled();
    });

    it('saves a valid model file', async () => {
        files.getFile.mockResolvedValueOnce(undefined);
        files.countFiles.mockResolvedValueOnce(5);
        await service.saveFile(
            user,
            'copy',
            'models/orders.yml',
            'version: 2\n',
        );
        expect(files.upsertFile).toHaveBeenCalledWith(
            'copy',
            'models/orders.yml',
            'version: 2\n',
        );
    });

    it('returns 404 when learn is off', async () => {
        featureFlagModel.get.mockResolvedValueOnce({ enabled: false } as never);
        await expect(service.listFiles(user, 'copy')).rejects.toThrow(
            NotFoundError,
        );
    });

    it('rejects a disallowed command with the terminal message', async () => {
        await expect(
            service.enqueueCommand(user, 'copy', {
                tool: 'dbt',
                subcommand: 'run',
                args: [],
            }),
        ).rejects.toThrow(
            'That command is not available in the Learn terminal',
        );
    });

    it('refuses a second concurrent command', async () => {
        files.findActiveCommand.mockResolvedValueOnce({
            command_uuid: 'c0',
            status: 'running',
        });
        await expect(
            service.enqueueCommand(user, 'copy', {
                tool: 'dbt',
                subcommand: 'parse',
                args: [],
            }),
        ).rejects.toThrow('A command is already running in this workspace');
    });

    it('409s with the active command uuid in the message for a queued command', async () => {
        files.findActiveCommand.mockResolvedValueOnce({
            command_uuid: 'c-queued',
            status: 'queued',
        });
        await expect(
            service.enqueueCommand(user, 'copy', {
                tool: 'dbt',
                subcommand: 'parse',
                args: [],
            }),
        ).rejects.toThrow(
            'A command is already running in this workspace (command c-queued)',
        );
        expect(files.failStaleRunning).not.toHaveBeenCalled();
    });

    it('409s for a running command still inside the grace window, without touching failStaleRunning', async () => {
        files.findActiveCommand.mockResolvedValueOnce({
            command_uuid: 'c-fresh',
            status: 'running',
            started_at: new Date(Date.now() - 1_000),
        });
        await expect(
            service.enqueueCommand(user, 'copy', {
                tool: 'dbt',
                subcommand: 'parse',
                args: [],
            }),
        ).rejects.toThrow(
            'A command is already running in this workspace (command c-fresh)',
        );
        expect(files.failStaleRunning).not.toHaveBeenCalled();
    });

    it('fails a stale running command, revokes its token, and proceeds to enqueue a new one', async () => {
        const staleStartedAt = new Date(
            Date.now() -
                (LEARN_SANDBOX_COMMAND_TIMEOUT_MS + 5 * 60 * 1000 + 1_000),
        );
        files.findActiveCommand.mockResolvedValueOnce({
            command_uuid: 'c-stale',
            status: 'running',
            started_at: staleStartedAt,
        });
        files.failStaleRunning.mockResolvedValueOnce([
            {
                command_uuid: 'c-stale',
                pat_uuid: 'pat-stale',
                project_uuid: 'copy',
                user_uuid: user.userUuid,
            },
        ]);
        files.createCommand.mockResolvedValueOnce({ commandUuid: 'c-new' });
        const result = await service.enqueueCommand(user, 'copy', {
            tool: 'dbt',
            subcommand: 'parse',
            args: [],
        });
        expect(result).toEqual({ commandUuid: 'c-new' });
        expect(files.failStaleRunning).toHaveBeenCalledOnce();
        expect(
            personalAccessTokenService.deletePersonalAccessToken,
        ).toHaveBeenCalledWith(expect.anything(), 'pat-stale');
        expect(files.clearToken).toHaveBeenCalledWith('c-stale');
        expect(schedulerClient.learnSandboxCommand).toHaveBeenCalledWith(
            expect.objectContaining({ commandUuid: 'c-new' }),
        );
    });

    it('falls back to the database unique index for the 409 when the pre-check races', async () => {
        files.findActiveCommand.mockResolvedValueOnce(undefined);
        files.createCommand.mockRejectedValueOnce(
            Object.assign(new Error('duplicate key value'), { code: '23505' }),
        );
        await expect(
            service.enqueueCommand(user, 'copy', {
                tool: 'dbt',
                subcommand: 'parse',
                args: [],
            }),
        ).rejects.toThrow('A command is already running in this workspace');
    });

    it('rethrows a createCommand failure that is not a unique violation', async () => {
        files.findActiveCommand.mockResolvedValueOnce(undefined);
        files.createCommand.mockRejectedValueOnce(new Error('db is down'));
        await expect(
            service.enqueueCommand(user, 'copy', {
                tool: 'dbt',
                subcommand: 'parse',
                args: [],
            }),
        ).rejects.toThrow('db is down');
    });

    it('creates the command row and enqueues the task', async () => {
        files.findActiveCommand.mockResolvedValueOnce(undefined);
        files.createCommand.mockResolvedValueOnce({ commandUuid: 'c1' });
        const result = await service.enqueueCommand(user, 'copy', {
            tool: 'dbt',
            subcommand: 'parse',
            args: [],
        });
        expect(result).toEqual({ commandUuid: 'c1' });
        expect(schedulerClient.learnSandboxCommand).toHaveBeenCalledWith(
            expect.objectContaining({
                commandUuid: 'c1',
                projectUuid: 'copy',
                userUuid: user.userUuid,
            }),
        );
    });

    it('reads output after a sequence number', async () => {
        files.getCommand.mockResolvedValueOnce({
            command_uuid: 'c1',
            project_uuid: 'copy',
            status: 'done',
            exit_code: 0,
            argv: ['dbt', 'parse'],
        });
        files.readOutput.mockResolvedValueOnce([
            { seq: 3, stream: 'stdout', text: 'ok' },
        ]);
        const out = await service.getOutput(user, 'copy', 'c1', 2);
        expect(out.chunks).toEqual([{ seq: 3, stream: 'stdout', text: 'ok' }]);
        expect(files.readOutput).toHaveBeenCalledWith('c1', 2);
        expect(out.startedAt).toBeNull();
        expect(out.finishedAt).toBeNull();
    });

    it('maps started_at/finished_at to ISO strings in the output response', async () => {
        files.getCommand.mockResolvedValueOnce({
            command_uuid: 'c1',
            project_uuid: 'copy',
            status: 'done',
            exit_code: 0,
            argv: ['dbt', 'parse'],
            started_at: new Date('2026-09-13T10:00:00.000Z'),
            finished_at: new Date('2026-09-13T10:00:05.000Z'),
        });
        files.readOutput.mockResolvedValueOnce([]);
        const out = await service.getOutput(user, 'copy', 'c1', 0);
        expect(out.startedAt).toBe('2026-09-13T10:00:00.000Z');
        expect(out.finishedAt).toBe('2026-09-13T10:00:05.000Z');
    });

    it('rejects access to a project the user cannot manage', async () => {
        await expect(service.listFiles(user, 'other')).rejects.toThrow();
    });

    it('403s for a real project, even one the ability check alone would allow', async () => {
        projectModel.getSummary.mockResolvedValueOnce({
            projectUuid: 'copy',
            organizationUuid: 'org',
            type: ProjectType.DEFAULT,
            upstreamProjectUuid: undefined,
            createdByUserUuid: user.userUuid,
            provisioningSource: null,
            name: 'copy',
            slug: 'copy',
        });
        await expect(service.listFiles(user, 'copy')).rejects.toThrow(
            ForbiddenError,
        );
    });

    it("403s for another learner's training copy (different createdByUserUuid)", async () => {
        projectModel.getSummary.mockResolvedValueOnce({
            projectUuid: 'copy',
            organizationUuid: 'org',
            type: ProjectType.PREVIEW,
            upstreamProjectUuid: 'training',
            createdByUserUuid: 'someone-else-uuid',
            provisioningSource: 'training',
            name: 'copy',
            slug: 'copy',
        });
        await expect(service.listFiles(user, 'copy')).rejects.toThrow(
            ForbiddenError,
        );
    });

    it('403s for a non-training preview the caller created themselves', async () => {
        projectModel.getSummary.mockResolvedValueOnce({
            projectUuid: 'copy',
            organizationUuid: 'org',
            type: ProjectType.PREVIEW,
            upstreamProjectUuid: undefined,
            createdByUserUuid: user.userUuid,
            provisioningSource: null,
            name: 'copy',
            slug: 'copy',
        });
        await expect(service.listFiles(user, 'copy')).rejects.toThrow(
            ForbiddenError,
        );
    });

    it("grants access via the real trainee ability pipeline on the learner's own training copy, and denies it on the shared training project", async () => {
        files.listFiles.mockResolvedValue([]);
        const buildTraineeUser = (
            scopes: string[],
            context: {
                projectUuid: string;
                projectType: ProjectType;
                projectCreatedByUserUuid: string | null;
            },
        ): SessionUser => {
            const builder = new AbilityBuilder<MemberAbility>(Ability);
            buildAbilityFromScopes(
                {
                    ...context,
                    userUuid: user.userUuid,
                    scopes,
                    isEnterprise: false,
                    permissionsConfig: { pat: lightdashConfig.auth.pat },
                },
                builder,
            );
            return { ...user, ability: builder.build() };
        };

        const traineeUser = buildTraineeUser(
            [...getTrainingProjectScopes(), ...LEARN_SANDBOX_SCOPES],
            {
                projectUuid: 'copy2',
                projectType: ProjectType.PREVIEW,
                projectCreatedByUserUuid: user.userUuid,
            },
        );
        await expect(
            service.listFiles(traineeUser, 'copy2'),
        ).resolves.toBeDefined();

        projectModel.getSummary.mockResolvedValueOnce({
            projectUuid: 'training-project',
            organizationUuid: 'org',
            type: ProjectType.TRAINING,
            upstreamProjectUuid: undefined,
            createdByUserUuid: null,
            provisioningSource: 'training',
            name: 'Training',
            slug: 'training',
        });
        const viewerUser = buildTraineeUser(getTrainingProjectViewerScopes(), {
            projectUuid: 'training-project',
            projectType: ProjectType.TRAINING,
            projectCreatedByUserUuid: null,
        });
        await expect(
            service.listFiles(viewerUser, 'training-project'),
        ).rejects.toThrow(ForbiddenError);
    });

    it('404s reading output for a command outside the project', async () => {
        files.getCommand.mockResolvedValueOnce({
            command_uuid: 'c1',
            project_uuid: 'another-project',
            status: 'done',
            exit_code: 0,
            argv: ['dbt', 'parse'],
        });
        await expect(service.getOutput(user, 'copy', 'c1', 0)).rejects.toThrow(
            NotFoundError,
        );
    });
});

describe('LearnSandboxService.sweep', () => {
    const files = {
        listFiles: vi.fn(),
        getFile: vi.fn(),
        upsertFile: vi.fn(),
        createCommand: vi.fn(),
        getCommand: vi.fn(),
        findActiveCommand: vi.fn(),
        claimCommand: vi.fn(),
        updateCommand: vi.fn(),
        appendOutput: vi.fn(),
        readOutput: vi.fn(),
        listCommandsWithTokens: vi.fn(),
        failStaleRunning: vi.fn(),
        clearToken: vi.fn(),
    };
    const projectModel = {
        getSummary: vi.fn(async (uuid: string) => ({
            projectUuid: uuid,
            organizationUuid: 'org',
            type: ProjectType.PREVIEW,
            upstreamProjectUuid: 'training',
            createdByUserUuid: user.userUuid,
            name: uuid,
            slug: uuid,
        })),
    };
    const userService = { getSessionByUserUuidAndOrg: vi.fn(async () => user) };
    const personalAccessTokenService = {
        createPersonalAccessToken: vi.fn(),
        deletePersonalAccessToken: vi.fn(async () => undefined),
    };
    const schedulerClient = { learnSandboxCommand: vi.fn(async () => 'job-1') };
    let workspaceRoot: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        files.listCommandsWithTokens.mockResolvedValue([]);
        files.failStaleRunning.mockResolvedValue([]);
        workspaceRoot = await mkdtemp(path.join(tmpdir(), 'learn-sweep-ws-'));
    });

    afterEach(async () => {
        await rm(workspaceRoot, { recursive: true, force: true });
    });

    const buildService = () =>
        new LearnSandboxService({
            lightdashConfig,
            learnWorkspaceModel: files as never,
            projectModel,
            featureFlagModel: { get: vi.fn() },
            personalAccessTokenService,
            userService,
            schedulerClient,
            workspaceRoot,
        });

    it('revokes tokens for finished commands and for stale running commands', async () => {
        files.listCommandsWithTokens.mockResolvedValue([
            {
                command_uuid: 'c-done',
                pat_uuid: 'pat-done',
                status: 'done',
                project_uuid: 'p1',
                user_uuid: 'u1',
            },
        ]);
        files.failStaleRunning.mockResolvedValue([
            {
                command_uuid: 'c-stale',
                pat_uuid: 'pat-stale',
                project_uuid: 'p2',
                user_uuid: 'u2',
            },
        ]);
        const result = await buildService().sweep();
        expect(result.tokensDeleted).toBe(2);
        expect(
            personalAccessTokenService.deletePersonalAccessToken,
        ).toHaveBeenCalledWith(expect.anything(), 'pat-done');
        expect(
            personalAccessTokenService.deletePersonalAccessToken,
        ).toHaveBeenCalledWith(expect.anything(), 'pat-stale');
        expect(files.clearToken).toHaveBeenCalledWith('c-done');
        expect(files.clearToken).toHaveBeenCalledWith('c-stale');
    });

    it('calls failStaleRunning with a cutoff based on commandTimeoutMs plus a grace window', async () => {
        const before = Date.now();
        await buildService().sweep();
        const [cutoff] = files.failStaleRunning.mock.calls[0] as [Date];
        const expectedMs = before - 120_000 - 5 * 60_000;
        expect(cutoff.getTime()).toBeLessThanOrEqual(expectedMs + 5);
        expect(cutoff.getTime()).toBeGreaterThan(expectedMs - 5_000);
    });

    it('clears the token reference when the project/user is gone (not-found), without counting it as revoked', async () => {
        files.listCommandsWithTokens.mockResolvedValue([
            {
                command_uuid: 'c-orphan',
                pat_uuid: 'pat-orphan',
                status: 'done',
                project_uuid: 'deleted-project',
                user_uuid: 'u1',
            },
        ]);
        projectModel.getSummary.mockRejectedValueOnce(
            new NotFoundError('Cannot find project'),
        );
        const result = await buildService().sweep();
        expect(result.tokensDeleted).toBe(0);
        expect(files.clearToken).toHaveBeenCalledWith('c-orphan');
        expect(
            personalAccessTokenService.deletePersonalAccessToken,
        ).not.toHaveBeenCalled();
    });

    it('leaves the token reference in place on an unexpected error, for the next sweep to retry', async () => {
        files.listCommandsWithTokens.mockResolvedValue([
            {
                command_uuid: 'c-retry',
                pat_uuid: 'pat-retry',
                status: 'done',
                project_uuid: 'p1',
                user_uuid: 'u1',
            },
        ]);
        projectModel.getSummary.mockRejectedValueOnce(new Error('db timeout'));
        const result = await buildService().sweep();
        expect(result.tokensDeleted).toBe(0);
        expect(files.clearToken).not.toHaveBeenCalled();
    });

    it('removes workspace directories older than an hour and keeps fresh ones', async () => {
        const oldDir = path.join(workspaceRoot, 'copy-old');
        const freshDir = path.join(workspaceRoot, 'copy-fresh');
        await mkdir(oldDir, { recursive: true });
        await mkdir(freshDir, { recursive: true });
        const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
        await utimes(oldDir, old, old);
        const result = await buildService().sweep();
        expect(result.workspacesRemoved).toBe(1);
        await expect(rm(oldDir, { recursive: false })).rejects.toThrow();
        await rm(freshDir, { recursive: true, force: true });
    });
});

describe('LearnSandboxService.runCommand', () => {
    const files = {
        listFiles: vi.fn(),
        getFile: vi.fn(),
        countFiles: vi.fn(),
        upsertFile: vi.fn(),
        createCommand: vi.fn(),
        getCommand: vi.fn(),
        findActiveCommand: vi.fn(),
        claimCommand: vi.fn(),
        updateCommand: vi.fn(),
        appendOutput: vi.fn(),
        readOutput: vi.fn(),
        listCommandsWithTokens: vi.fn(),
        failStaleRunning: vi.fn(),
        clearToken: vi.fn(),
    };
    const featureFlagModel = {
        get: vi.fn(async () => ({
            id: FeatureFlags.EnableLearn,
            enabled: true,
        })),
    };
    const projectModel = {
        getSummary: vi.fn(async (uuid: string) => ({
            projectUuid: uuid,
            organizationUuid: 'org',
            type: ProjectType.PREVIEW,
            upstreamProjectUuid: 'training',
            createdByUserUuid: user.userUuid,
            provisioningSource: 'training',
            name: 'copy',
            slug: 'copy',
        })),
    };
    const schedulerClient = { learnSandboxCommand: vi.fn(async () => 'job-1') };

    const originalEnv = { ...process.env };
    let workspaceRoot: string;
    let bin: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        files.claimCommand.mockResolvedValue(true);
        // Resolved so it matches what a spawned shell's `pwd` reports: on
        // macOS os.tmpdir() lives under a /var/folders symlink that
        // resolves to /private/var/folders.
        workspaceRoot = await realpath(
            await mkdtemp(path.join(tmpdir(), 'learn-run-ws-')),
        );
        bin = await mkdtemp(path.join(tmpdir(), 'learn-bin-'));
        process.env.LEARN_SANDBOX_PATH_PREFIX = bin;
    });

    afterEach(async () => {
        process.env = { ...originalEnv };
        await rm(workspaceRoot, { recursive: true, force: true });
        await rm(bin, { recursive: true, force: true });
    });

    const buildService = () => {
        const pat = {
            createPersonalAccessToken: vi.fn(async () => ({
                uuid: 'pat-1',
                token: 'ldpat_abc',
                createdAt: new Date(),
                lastUsedAt: null,
                rotatedAt: null,
                expiresAt: null,
                description: 'Learn sandbox command',
            })),
            deletePersonalAccessToken: vi.fn(async () => undefined),
        };
        const userService = {
            getSessionByUserUuidAndOrg: vi.fn(async () => user),
        };
        const service = new LearnSandboxService({
            lightdashConfig,
            learnWorkspaceModel: files as never,
            projectModel,
            featureFlagModel,
            personalAccessTokenService: pat,
            userService,
            schedulerClient,
            workspaceRoot,
        });
        return { service, pat, userService };
    };

    it('runs a fake dbt, streams output, scrubs the token, keeps the child in the workspace, and revokes the PAT', async () => {
        await writeFile(
            path.join(bin, 'dbt'),
            [
                '#!/bin/sh',
                'echo "parse ok key=$LIGHTDASH_API_KEY project=$LIGHTDASH_PROJECT"',
                'echo "warn" 1>&2',
                'echo "home=$HOME profiles=$DBT_PROFILES_DIR project_dir=$DBT_PROJECT_DIR pwd=$(pwd) sentinel=$SANDBOX_HOST_SENTINEL"',
                'exit 0',
                '',
            ].join('\n'),
            { mode: 0o755 },
        );
        process.env.SANDBOX_HOST_SENTINEL = 'host-secret-should-not-leak';
        const appended: unknown[] = [];
        files.getCommand.mockResolvedValue({
            command_uuid: 'c1',
            project_uuid: 'copy',
            user_uuid: user.userUuid,
            status: 'queued',
            argv: ['dbt', 'parse'],
            pat_uuid: null,
        });
        files.listFiles.mockResolvedValue([]);
        files.appendOutput.mockImplementation(async (_id, chunks) => {
            appended.push(...chunks);
        });
        const pat = {
            createPersonalAccessToken: vi.fn(async () => ({
                uuid: 'pat-1',
                token: 'ldpat_abc',
                createdAt: new Date(),
                lastUsedAt: null,
                rotatedAt: null,
                expiresAt: null,
                description: 'Learn sandbox command c1',
            })),
            deletePersonalAccessToken: vi.fn(async () => undefined),
        };
        const userService = {
            getSessionByUserUuidAndOrg: vi.fn(async () => user),
        };
        const svc = new LearnSandboxService({
            lightdashConfig,
            learnWorkspaceModel: files as never,
            projectModel,
            featureFlagModel,
            personalAccessTokenService: pat,
            userService,
            schedulerClient,
            workspaceRoot,
        });
        await svc.runCommand({
            commandUuid: 'c1',
            projectUuid: 'copy',
            organizationUuid: 'org',
            userUuid: user.userUuid,
        });
        const text = (appended as { text: string }[])
            .map((c) => c.text)
            .join('');
        const workspaceDir = path.join(workspaceRoot, 'copy-c1');
        const projectDir = path.join(workspaceDir, 'project');
        expect(text).toContain('parse ok key=*** project=copy');
        expect(text).toContain('warn');
        expect(text).not.toContain('ldpat_abc');
        expect(text).toContain(`home=${workspaceDir}`);
        expect(text).toContain(`profiles=${workspaceDir}`);
        expect(text).toContain(`project_dir=${projectDir}`);
        expect(text).toContain(`pwd=${projectDir}`);
        expect(text).not.toContain('host-secret-should-not-leak');
        expect(pat.deletePersonalAccessToken).toHaveBeenCalledWith(
            expect.anything(),
            'pat-1',
        );
        expect(files.updateCommand).toHaveBeenLastCalledWith(
            'c1',
            expect.objectContaining({
                status: 'done',
                exit_code: 0,
                pat_uuid: null,
            }),
        );
    });

    it("uses the fetched command row's project/user, not the payload's, for the overlay, LIGHTDASH_PROJECT and the PAT session", async () => {
        await writeFile(
            path.join(bin, 'dbt'),
            '#!/bin/sh\necho "project=$LIGHTDASH_PROJECT"\nexit 0\n',
            { mode: 0o755 },
        );
        files.getCommand.mockResolvedValue({
            command_uuid: 'c-m1',
            project_uuid: 'copy',
            user_uuid: user.userUuid,
            status: 'queued',
            argv: ['dbt', 'parse'],
            pat_uuid: null,
        });
        files.listFiles.mockResolvedValue([]);
        const appended: { text: string }[] = [];
        files.appendOutput.mockImplementation(async (_id, chunks) => {
            appended.push(...chunks);
        });
        const { service, userService } = buildService();
        // The scheduler payload deliberately disagrees with the command
        // row: only the row's values should ever reach the workspace.
        await service.runCommand({
            commandUuid: 'c-m1',
            projectUuid: 'wrong-project-from-payload',
            organizationUuid: 'org',
            userUuid: 'wrong-user-from-payload',
        });
        expect(files.listFiles).toHaveBeenCalledWith('copy');
        expect(userService.getSessionByUserUuidAndOrg).toHaveBeenCalledWith(
            user.userUuid,
            'org',
        );
        const text = appended.map((c) => c.text).join('');
        expect(text).toContain('project=copy');
    });

    it('marks a non-zero exit as error and still revokes the PAT', async () => {
        await writeFile(
            path.join(bin, 'dbt'),
            '#!/bin/sh\necho "boom" 1>&2\nexit 3\n',
            { mode: 0o755 },
        );
        files.getCommand.mockResolvedValue({
            command_uuid: 'c2',
            project_uuid: 'copy',
            user_uuid: user.userUuid,
            status: 'queued',
            argv: ['dbt', 'parse'],
            pat_uuid: null,
        });
        files.listFiles.mockResolvedValue([]);
        files.appendOutput.mockResolvedValue(undefined);
        const pat = {
            createPersonalAccessToken: vi.fn(async () => ({
                uuid: 'pat-2',
                token: 'ldpat_xyz',
                createdAt: new Date(),
                lastUsedAt: null,
                rotatedAt: null,
                expiresAt: null,
                description: 'Learn sandbox command c2',
            })),
            deletePersonalAccessToken: vi.fn(async () => undefined),
        };
        const userService = {
            getSessionByUserUuidAndOrg: vi.fn(async () => user),
        };
        const svc = new LearnSandboxService({
            lightdashConfig,
            learnWorkspaceModel: files as never,
            projectModel,
            featureFlagModel,
            personalAccessTokenService: pat,
            userService,
            schedulerClient,
            workspaceRoot,
        });
        await svc.runCommand({
            commandUuid: 'c2',
            projectUuid: 'copy',
            organizationUuid: 'org',
            userUuid: user.userUuid,
        });
        expect(pat.deletePersonalAccessToken).toHaveBeenCalledWith(
            expect.anything(),
            'pat-2',
        );
        expect(files.updateCommand).toHaveBeenLastCalledWith(
            'c2',
            expect.objectContaining({ status: 'error', exit_code: 3 }),
        );
    });

    it('marks a timeout and kills the whole process tree, not just the shell', async () => {
        await writeFile(
            path.join(bin, 'sleep'),
            [
                '#!/bin/sh',
                '/bin/sleep 5 &',
                'echo "child_pid=$!"',
                'wait',
                '',
            ].join('\n'),
            { mode: 0o755 },
        );
        files.getCommand.mockResolvedValue({
            command_uuid: 'c3',
            project_uuid: 'copy',
            user_uuid: user.userUuid,
            status: 'queued',
            argv: ['sleep', '5'],
            pat_uuid: null,
        });
        files.listFiles.mockResolvedValue([]);
        const appended: { text: string }[] = [];
        files.appendOutput.mockImplementation(async (_id, chunks) => {
            appended.push(...chunks);
        });
        const pat = {
            createPersonalAccessToken: vi.fn(async () => ({
                uuid: 'pat-3',
                token: 'ldpat_timeout',
                createdAt: new Date(),
                lastUsedAt: null,
                rotatedAt: null,
                expiresAt: null,
                description: 'Learn sandbox command c3',
            })),
            deletePersonalAccessToken: vi.fn(async () => undefined),
        };
        const userService = {
            getSessionByUserUuidAndOrg: vi.fn(async () => user),
        };
        const svc = new LearnSandboxService({
            lightdashConfig,
            learnWorkspaceModel: files as never,
            projectModel,
            featureFlagModel,
            personalAccessTokenService: pat,
            userService,
            schedulerClient,
            workspaceRoot,
            // Generous relative to the immediate `echo` the fake binary does
            // before backgrounding sleep, so the timeout firing early under
            // load (parallel test workers) doesn't race the child_pid line.
            commandTimeoutMs: 1_000,
        });
        await svc.runCommand({
            commandUuid: 'c3',
            projectUuid: 'copy',
            organizationUuid: 'org',
            userUuid: user.userUuid,
        });
        expect(pat.deletePersonalAccessToken).toHaveBeenCalledWith(
            expect.anything(),
            'pat-3',
        );
        expect(files.updateCommand).toHaveBeenLastCalledWith(
            'c3',
            expect.objectContaining({ status: 'timeout' }),
        );
        const text = appended.map((c) => c.text).join('');
        const match = /child_pid=(\d+)/.exec(text);
        expect(match).not.toBeNull();
        const childPid = Number((match as RegExpExecArray)[1]);
        await waitUntilDead(childPid);
        expect(isAlive(childPid)).toBe(false);
    }, 10_000);

    it('does not mint a PAT when the command cannot be claimed (duplicate delivery)', async () => {
        files.claimCommand.mockResolvedValueOnce(false);
        files.getCommand.mockResolvedValue({
            command_uuid: 'c4',
            project_uuid: 'copy',
            user_uuid: user.userUuid,
            status: 'running',
            argv: ['dbt', 'parse'],
            pat_uuid: null,
        });
        const { service, pat } = buildService();
        await service.runCommand({
            commandUuid: 'c4',
            projectUuid: 'copy',
            organizationUuid: 'org',
            userUuid: user.userUuid,
        });
        expect(pat.createPersonalAccessToken).not.toHaveBeenCalled();
        expect(files.updateCommand).not.toHaveBeenCalled();
    });

    it('reports a spawn failure instead of leaving the terminal blank', async () => {
        files.getCommand.mockResolvedValue({
            command_uuid: 'c5',
            project_uuid: 'copy',
            user_uuid: user.userUuid,
            status: 'queued',
            argv: ['this-binary-does-not-exist-xyz'],
            pat_uuid: null,
        });
        files.listFiles.mockResolvedValue([]);
        const appended: { text: string }[] = [];
        files.appendOutput.mockImplementation(async (_id, chunks) => {
            appended.push(...chunks);
        });
        const { service } = buildService();
        await service.runCommand({
            commandUuid: 'c5',
            projectUuid: 'copy',
            organizationUuid: 'org',
            userUuid: user.userUuid,
        });
        const text = appended.map((c) => c.text).join('');
        expect(text).toMatch(/ENOENT|failed to start|Command failed/i);
        expect(files.updateCommand).toHaveBeenLastCalledWith(
            'c5',
            expect.objectContaining({ status: 'error' }),
        );
    });

    it('tells the learner some output was lost when the buffer fails to flush once, and still reports the real exit status', async () => {
        await writeFile(
            path.join(bin, 'dbt'),
            '#!/bin/sh\necho "hello"\nexit 0\n',
            { mode: 0o755 },
        );
        files.getCommand.mockResolvedValue({
            command_uuid: 'c6',
            project_uuid: 'copy',
            user_uuid: user.userUuid,
            status: 'queued',
            argv: ['dbt', 'parse'],
            pat_uuid: null,
        });
        files.listFiles.mockResolvedValue([]);
        const appended: { text: string }[] = [];
        let flushCalls = 0;
        files.appendOutput.mockImplementation(async (_id, chunks) => {
            flushCalls += 1;
            if (flushCalls === 1) {
                throw new Error('disk full');
            }
            appended.push(...chunks);
        });
        const { service } = buildService();
        await service.runCommand({
            commandUuid: 'c6',
            projectUuid: 'copy',
            organizationUuid: 'org',
            userUuid: user.userUuid,
        });
        const text = appended.map((c) => c.text).join('');
        expect(text).toContain('Some output could not be stored');
        expect(files.updateCommand).toHaveBeenLastCalledWith(
            'c6',
            expect.objectContaining({ status: 'done', exit_code: 0 }),
        );
    });
});
